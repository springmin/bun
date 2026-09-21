//! `Bun.ant` — native helpers compatible with Anthropic's internal Bun build
//! (`@anthropic-ai/bun-internal`) used by Claude Code >= 2.1.272.
//!
//! Exposed on the `Bun` object:
//! - `Bun.ant.setDumpable(flag)` — `prctl(PR_SET_DUMPABLE, flag)`
//! - `Bun.ant.getPeerUid(fd)` / `Bun.ant.getPeerPid(fd)` — `SO_PEERCRED`
//! - `Bun.ant.memoryPressureLevel()` — Linux PSI (`/proc/pressure/memory`)
//! - `Bun.ant.CellSegmenter` — terminal-cell segmenter for the Ink renderer.
//!
//! The `CellSegmenter` wire format (`cells`/`runs` packing, negative
//! buffer-too-small return, damage packing) mirrors the protocol Claude Code
//! drives; see `docs/`/the reverse-engineering notes for the layout.

use core::ffi::c_void;
use std::cell::RefCell;
use std::collections::HashMap;

use bun_core::strings;
use bun_jsc::bun_string_jsc;
use bun_jsc::{
    ArrayBuffer, CallFrame, JSArray, JSFunction, JSGlobalObject, JSObject, JSValue, JsResult,
};

// ─── C ABI from src/jsc/bindings/stringWidth.cpp ────────────────────────────

unsafe extern "C" {
    fn Bun__graphemeBreak(cp1: u32, cp2: u32, state: *mut u8) -> bool;
    fn Bun__visibleWidthExcludeANSI_utf16(
        ptr: *const u16,
        len: usize,
        ambiguous_as_wide: bool,
    ) -> usize;
}

// ─── OS helpers ─────────────────────────────────────────────────────────────

#[cfg(any(target_os = "linux", target_os = "android"))]
mod os {
    use super::*;

    const PR_SET_DUMPABLE: i32 = 4;
    const SOL_SOCKET: i32 = 1;
    const SO_PEERCRED: i32 = 17;

    #[repr(C)]
    pub(super) struct UCred {
        pub(super) pid: i32,
        pub(super) uid: u32,
        pub(super) gid: u32,
    }

    unsafe extern "C" {
        fn prctl(option: i32, arg2: u64, arg3: u64, arg4: u64, arg5: u64) -> i32;
        fn getsockopt(
            fd: i32,
            level: i32,
            optname: i32,
            optval: *mut c_void,
            optlen: *mut u32,
        ) -> i32;
    }

    pub(super) fn set_dumpable(flag: bool) -> bool {
        // SAFETY: plain libc call with scalar arguments.
        unsafe { prctl(PR_SET_DUMPABLE, flag as u64, 0, 0, 0) == 0 }
    }

    pub(super) fn peer_cred(fd: i32) -> Option<UCred> {
        let mut cred = UCred { pid: 0, uid: 0, gid: 0 };
        let mut len = core::mem::size_of::<UCred>() as u32;
        // SAFETY: `cred`/`len` are valid for writes for the duration of the call.
        let rc = unsafe {
            getsockopt(
                fd,
                SOL_SOCKET,
                SO_PEERCRED,
                (&mut cred as *mut UCred).cast::<c_void>(),
                &mut len,
            )
        };
        if rc == 0 { Some(cred) } else { None }
    }

    /// Level codes match `process.on("memoryPressure")`: 1 normal, 2 warning, 4 critical.
    pub(super) fn memory_pressure_level() -> Option<i32> {
        let mut buf = [0u8; 256];
        let fd = bun_sys::open(
            bun_core::zstr!("/proc/pressure/memory"),
            bun_sys::O::RDONLY | bun_sys::O::CLOEXEC,
            0,
        )
        .ok()?;
        let n = bun_sys::pread(fd, &mut buf, 0).ok()?;
        let avg10 = parse_avg10(&buf[..n])?;
        Some(if avg10 >= 50.0 {
            4
        } else if avg10 >= 10.0 {
            2
        } else {
            1
        })
    }

    fn parse_avg10(contents: &[u8]) -> Option<f64> {
        let line = strings::split(contents, b"\n").find(|line| line.starts_with(b"some "))?;
        let at = strings::index_of(line, b"avg10=")? + b"avg10=".len();
        let rest = &line[at..];
        let end = rest
            .iter()
            .position(|b| !(b.is_ascii_digit() || *b == b'.'))
            .unwrap_or(rest.len());
        core::str::from_utf8(&rest[..end]).ok()?.parse().ok()
    }
}

#[cfg(not(any(target_os = "linux", target_os = "android")))]
mod os {
    pub struct UCred {
        pub pid: i32,
        pub uid: u32,
        pub gid: u32,
    }
    pub(super) fn set_dumpable(_flag: bool) -> bool {
        false
    }
    pub(super) fn peer_cred(_fd: i32) -> Option<UCred> {
        None
    }
    pub(super) fn memory_pressure_level() -> Option<i32> {
        None
    }
}

#[bun_jsc::host_fn]
fn ant_set_dumpable(_global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    let [flag] = frame.arguments_as_array::<1>();
    let flag = if flag.is_undefined_or_null() { true } else { flag.to_boolean() };
    Ok(JSValue::from(os::set_dumpable(flag)))
}

#[bun_jsc::host_fn]
fn ant_get_peer_uid(_global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    let [fd] = frame.arguments_as_array::<1>();
    match os::peer_cred(fd.to_int32()) {
        Some(cred) => Ok(JSValue::from(cred.uid)),
        None => Ok(JSValue::NULL),
    }
}

#[bun_jsc::host_fn]
fn ant_get_peer_pid(_global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    let [fd] = frame.arguments_as_array::<1>();
    match os::peer_cred(fd.to_int32()) {
        Some(cred) if cred.pid > 0 => Ok(JSValue::from(cred.pid)),
        _ => Ok(JSValue::NULL),
    }
}

#[bun_jsc::host_fn]
fn ant_memory_pressure_level(_global: &JSGlobalObject, _frame: &CallFrame) -> JsResult<JSValue> {
    match os::memory_pressure_level() {
        Some(level) => Ok(JSValue::from(level)),
        None => Ok(JSValue::NULL),
    }
}

// ─── CellSegmenter ──────────────────────────────────────────────────────────

/// Width codes / screen encoding supplied by the constructor's `screen` object.
#[derive(Clone, Copy)]
struct ScreenOptions {
    width_mask: u32,
    narrow: u32,
    wide: u32,
    spacer_tail: u32,
    spacer_head: u32,
    empty_char_index: u32,
    spacer_char_index: u32,
    empty_word: u32,
    tab_width: i32,
}

impl Default for ScreenOptions {
    fn default() -> Self {
        Self {
            width_mask: 3,
            narrow: 0,
            wide: 1,
            spacer_tail: 2,
            spacer_head: 3,
            empty_char_index: 0,
            spacer_char_index: 1,
            empty_word: 0,
            tab_width: 8,
        }
    }
}

/// Interned tables. Index 0 is reserved (`""`) in every table, so `0` means
/// "none" for URIs and the default style.
#[derive(Default)]
struct Tables {
    graphemes: Vec<Box<[u8]>>,
    grapheme_ids: HashMap<Box<[u8]>, u32>,
    sgr_keys: Vec<Box<[u8]>>,
    sgr_key_ids: HashMap<Box<[u8]>, u32>,
    sgr_close_keys: Vec<Box<[u8]>>,
    uris: Vec<Box<[u8]>>,
    uri_ids: HashMap<Box<[u8]>, u32>,
    /// style id → (sgr key index, uri index)
    styles: Vec<(u32, u32)>,
    style_ids: HashMap<(u32, u32), u32>,
}

#[bun_jsc::JsClass]
pub(crate) struct CellSegmenter {
    ambiguous_is_narrow: bool,
    screen: ScreenOptions,
    state: RefCell<Tables>,
}

impl CellSegmenter {
    pub(crate) fn constructor(
        global: &JSGlobalObject,
        frame: &CallFrame,
    ) -> JsResult<Box<Self>> {
        let [options] = frame.arguments_as_array::<1>();

        let mut segmenter = CellSegmenter {
            ambiguous_is_narrow: true,
            screen: ScreenOptions::default(),
            state: RefCell::new(Tables::default()),
        };

        if options.is_object() {
            if let Some(v) = options.get(global, b"ambiguousIsNarrow")? {
                segmenter.ambiguous_is_narrow = v.to_boolean();
            }

            if let Some(screen) = options.get(global, b"screen")? {
                if screen.is_object() {
                    let s = &mut segmenter.screen;
                    s.width_mask = get_u32(global, screen, b"widthMask", s.width_mask)?;
                    s.narrow = get_u32(global, screen, b"narrow", s.narrow)?;
                    s.wide = get_u32(global, screen, b"wide", s.wide)?;
                    s.spacer_tail = get_u32(global, screen, b"spacerTail", s.spacer_tail)?;
                    s.spacer_head = get_u32(global, screen, b"spacerHead", s.spacer_head)?;
                    s.empty_char_index =
                        get_u32(global, screen, b"emptyCharIndex", s.empty_char_index)?;
                    s.spacer_char_index =
                        get_u32(global, screen, b"spacerCharIndex", s.spacer_char_index)?;
                    s.empty_word = get_u32(global, screen, b"emptyWord", s.empty_word)?;
                    s.tab_width = get_u32(global, screen, b"tabWidth", s.tab_width as u32)? as i32;
                }
            }
        }

        {
            let mut t = segmenter.state.borrow_mut();
            t.graphemes.push(Box::from(&b""[..]));
            t.grapheme_ids.insert(Box::from(&b""[..]), 0);
            t.sgr_keys.push(Box::from(&b""[..]));
            t.sgr_key_ids.insert(Box::from(&b""[..]), 0);
            t.sgr_close_keys.push(Box::from(&b""[..]));
            t.uris.push(Box::from(&b""[..]));
            t.uri_ids.insert(Box::from(&b""[..]), 0);
            t.styles.push((0, 0));
            t.style_ids.insert((0, 0), 0);
        }

        Ok(Box::new(segmenter))
    }

    #[bun_jsc::host_fn(getter)]
    pub(crate) fn get_graphemes(this: &Self, global: &JSGlobalObject) -> JsResult<JSValue> {
        let t = this.state.borrow();
        let mut items = Vec::with_capacity(t.graphemes.len());
        for g in &t.graphemes {
            items.push(bun_string_jsc::create_utf8_for_js(global, g)?);
        }
        JSArray::create(global, &items)
    }

    #[bun_jsc::host_fn(getter)]
    pub(crate) fn get_sgr_keys(this: &Self, global: &JSGlobalObject) -> JsResult<JSValue> {
        let t = this.state.borrow();
        let mut items = Vec::with_capacity(t.sgr_keys.len());
        for k in &t.sgr_keys {
            items.push(bun_string_jsc::create_utf8_for_js(global, k)?);
        }
        JSArray::create(global, &items)
    }

    #[bun_jsc::host_fn(getter)]
    pub(crate) fn get_sgr_close_keys(this: &Self, global: &JSGlobalObject) -> JsResult<JSValue> {
        let t = this.state.borrow();
        let mut items = Vec::with_capacity(t.sgr_close_keys.len());
        for k in &t.sgr_close_keys {
            items.push(bun_string_jsc::create_utf8_for_js(global, k)?);
        }
        JSArray::create(global, &items)
    }

    #[bun_jsc::host_fn(getter)]
    pub(crate) fn get_uris(this: &Self, global: &JSGlobalObject) -> JsResult<JSValue> {
        let t = this.state.borrow();
        let mut items = Vec::with_capacity(t.uris.len());
        for u in &t.uris {
            items.push(bun_string_jsc::create_utf8_for_js(global, u)?);
        }
        JSArray::create(global, &items)
    }

    /// `segment(text, cells, runs, reordered) -> count`
    ///
    /// Returns the cell count, or `-requiredCells` when `cells` is too small
    /// (caller grows both buffers and calls again).
    #[bun_jsc::host_fn(method)]
    pub(crate) fn segment(
        &self,
        global: &JSGlobalObject,
        frame: &CallFrame,
    ) -> JsResult<JSValue> {
        let [text, cells_val, runs_val, _reordered] = frame.arguments_as_array::<4>();
        if !cells_val.js_type().is_typed_array_or_array_buffer()
            || !runs_val.js_type().is_typed_array_or_array_buffer()
        {
            return Err(global.throw_invalid_arguments(format_args!(
                "CellSegmenter.segment expects Int32Array buffers"
            )));
        }

        let text = text.to_utf8(global)?;
        let mut cells_ab = ArrayBuffer::from_typed_array(global, cells_val);
        let mut runs_ab = ArrayBuffer::from_typed_array(global, runs_val);
        let count = {
            let cells = cells_ab.as_u32();
            let runs = runs_ab.as_u32();
            let mut state = self.state.borrow_mut();
            let mut parser = Parser::new(self, &mut state, &text, cells, runs);
            parser.run();
            parser.finish()
        };

        Ok(JSValue::from(count))
    }

    /// `setCell(cells, screenWidth, x, y, charIndex, packed) -> damage`
    #[bun_jsc::host_fn(method)]
    pub(crate) fn set_cell(
        &self,
        global: &JSGlobalObject,
        frame: &CallFrame,
    ) -> JsResult<JSValue> {
        let [cells_val, width, x, y, char_index, packed] = frame.arguments_as_array::<6>();
        if !cells_val.js_type().is_typed_array_or_array_buffer() {
            return Err(global.throw_invalid_arguments(format_args!(
                "CellSegmenter.setCell expects an Int32Array"
            )));
        }

        let width = width.to_int32();
        let x = x.to_int32();
        let y = y.to_int32();
        let char_index = char_index.to_u32();
        let packed = packed.to_u32();

        let mut cells_ab = ArrayBuffer::from_typed_array(global, cells_val);
        let cells = cells_ab.as_u32();

        let width_code = packed & self.screen.width_mask;
        let advance = if width_code == self.screen.wide {
            2
        } else if width_code == self.screen.spacer_tail {
            0
        } else {
            1
        };

        write_screen_cell(cells, width, x, y, char_index, packed);
        if advance == 2 {
            let tail = (packed & !self.screen.width_mask) | self.screen.spacer_tail;
            write_screen_cell(cells, width, x + 1, y, self.screen.spacer_char_index, tail);
        }

        Ok(JSValue::from(pack_damage(x, x + advance)))
    }

    /// `paint(screenCells, screenWidth, x, y, lineCells, count, undefined, charMap, words) -> damage`
    #[bun_jsc::host_fn(method)]
    pub(crate) fn paint(
        &self,
        global: &JSGlobalObject,
        frame: &CallFrame,
    ) -> JsResult<JSValue> {
        let [cells_val, width, x, y, line_cells_val, count, _opts, char_map, words] =
            frame.arguments_as_array::<9>();
        if !cells_val.js_type().is_typed_array_or_array_buffer()
            || !line_cells_val.js_type().is_typed_array_or_array_buffer()
            || !char_map.js_type().is_typed_array_or_array_buffer()
            || !words.js_type().is_typed_array_or_array_buffer()
        {
            return Err(global.throw_invalid_arguments(format_args!(
                "CellSegmenter.paint expects Int32Array buffers"
            )));
        }

        let width = width.to_int32();
        let start_x = x.to_int32();
        let y = y.to_int32();
        let count = count.to_u32() as usize;

        let mut cells_ab = ArrayBuffer::from_typed_array(global, cells_val);
        let mut line_ab = ArrayBuffer::from_typed_array(global, line_cells_val);
        let mut map_ab = ArrayBuffer::from_typed_array(global, char_map);
        let mut words_ab = ArrayBuffer::from_typed_array(global, words);

        let cells = cells_ab.as_u32();
        let line = line_ab.as_u32();
        let map = map_ab.as_u32();
        let words_buf = words_ab.as_u32();

        let mut cursor = start_x;
        for i in 0..count {
            let Some(&grapheme_index) = line.get(2 * i) else { break };
            let Some(&meta) = line.get(2 * i + 1) else { break };
            let style = meta >> 10;
            let is_tab = (meta & 0x100) != 0;
            let columns = (meta & 0xFF).max(1);
            let char_index = map
                .get(grapheme_index as usize)
                .copied()
                .unwrap_or(self.screen.empty_char_index);
            let word = words_buf
                .get(style as usize)
                .copied()
                .unwrap_or(self.screen.empty_word);

            if is_tab {
                let tab_width = self.screen.tab_width.max(1);
                let stop = tab_width - cursor.rem_euclid(tab_width);
                for _ in 0..stop {
                    let packed = word | self.screen.narrow;
                    write_screen_cell(
                        cells,
                        width,
                        cursor,
                        y,
                        self.screen.empty_char_index,
                        packed,
                    );
                    cursor += 1;
                }
            } else if columns >= 2 {
                let packed = word | self.screen.wide;
                write_screen_cell(cells, width, cursor, y, char_index, packed);
                let tail = (packed & !self.screen.width_mask) | self.screen.spacer_tail;
                write_screen_cell(
                    cells,
                    width,
                    cursor + 1,
                    y,
                    self.screen.spacer_char_index,
                    tail,
                );
                cursor += 2;
            } else {
                let packed = word | self.screen.narrow;
                write_screen_cell(cells, width, cursor, y, char_index, packed);
                cursor += 1;
            }
        }

        Ok(JSValue::from(pack_damage(start_x, cursor)))
    }
}

fn get_u32(
    global: &JSGlobalObject,
    object: JSValue,
    key: &[u8],
    default: u32,
) -> JsResult<u32> {
    Ok(match object.get(global, key)? {
        Some(v) if v.is_number() => v.to_u32(),
        _ => default,
    })
}

fn write_screen_cell(cells: &mut [u32], width: i32, x: i32, y: i32, char_index: u32, packed: u32) {
    if width <= 0 || x < 0 || y < 0 {
        return;
    }
    let index = (y as i64 * width as i64 + x as i64) * 2;
    if index < 0 {
        return;
    }
    let index = index as usize;
    if index + 1 < cells.len() {
        cells[index] = char_index;
        cells[index + 1] = packed;
    }
}

/// Damage descriptor: `start << 20 | end << 36`, low 20 bits = new x.
fn pack_damage(start: i32, end: i32) -> f64 {
    let start = start.max(0) as u64 & 0xFFFF;
    let end = end.max(0) as u64 & 0xFFFFF_FFFF;
    ((end << 36) | (start << 20) | (end & 0xFFFFF)) as f64
}

// ─── Parser ─────────────────────────────────────────────────────────────────

struct OpenAttr {
    group: u8,
    open: Box<[u8]>,
    close: Box<[u8]>,
}

struct Parser<'a> {
    seg: &'a CellSegmenter,
    st: &'a mut Tables,
    text: &'a [u8],
    cells: &'a mut [u32],
    runs: &'a mut [u32],
    count: usize,
    overflow: bool,
    open: Vec<OpenAttr>,
    uri: u32,
    style: u32,
    cluster: Vec<u16>,
    cluster_start: usize,
    prev_cp: Option<u32>,
    break_state: u8,
}

impl<'a> Parser<'a> {
    fn new(
        seg: &'a CellSegmenter,
        st: &'a mut Tables,
        text: &'a [u8],
        cells: &'a mut [u32],
        runs: &'a mut [u32],
    ) -> Self {
        Self {
            seg,
            st,
            text,
            cells,
            runs,
            count: 0,
            overflow: false,
            open: Vec::new(),
            uri: 0,
            style: 0,
            cluster: Vec::new(),
            cluster_start: 0,
            prev_cp: None,
            break_state: 0,
        }
    }

    fn finish(self) -> i32 {
        // Runs are indexed by style id (`2 * style`), so publish every style
        // that was interned while parsing.
        for (style, &(key, uri)) in self.st.styles.iter().enumerate() {
            if 2 * style + 1 < self.runs.len() {
                self.runs[2 * style] = key;
                self.runs[2 * style + 1] = uri;
            }
        }
        if self.overflow { -(self.count as i32) } else { self.count as i32 }
    }

    fn capacity(&self) -> usize {
        self.cells.len() / 2
    }

    fn push_cell(&mut self, grapheme_index: u32, meta: u32) {
        if self.count < self.capacity() {
            self.cells[2 * self.count] = grapheme_index;
            self.cells[2 * self.count + 1] = meta;
        } else {
            self.overflow = true;
        }
        self.count += 1;
    }

    fn intern_grapheme(&mut self, bytes: &[u8]) -> u32 {
        if let Some(&id) = self.st.grapheme_ids.get(bytes) {
            return id;
        }
        let id = self.st.graphemes.len() as u32;
        let key: Box<[u8]> = bytes.into();
        self.st.graphemes.push(key.clone());
        self.st.grapheme_ids.insert(key, id);
        id
    }

    fn flush_cluster(&mut self, end: usize) {
        if self.cluster.is_empty() {
            return;
        }
        let bytes = &self.text[self.cluster_start..end];
        let width = if self.cluster.len() == bytes.len() && bytes.is_ascii() {
            1
        } else {
            // SAFETY: `cluster` is a live UTF-16 buffer; the callee only reads it.
            let w = unsafe {
                Bun__visibleWidthExcludeANSI_utf16(
                    self.cluster.as_ptr(),
                    self.cluster.len(),
                    !self.seg.ambiguous_is_narrow,
                )
            };
            if w < 1 { 1 } else { w as u32 }
        };
        let index = self.intern_grapheme(bytes);
        self.push_cell(index, width | (self.style << 10));
        self.cluster.clear();
    }

    fn run(&mut self) {
        let text = self.text;
        let mut i = 0usize;
        while i < text.len() {
            let b = text[i];
            if b == 0x1b {
                self.flush_cluster(i);
                i = self.parse_escape(i);
                self.prev_cp = None;
                continue;
            }
            if b == b'\t' {
                self.flush_cluster(i);
                let index = self.intern_grapheme(b"\t");
                self.push_cell(index, 1 | 0x100 | (self.style << 10));
                i += 1;
                self.prev_cp = None;
                continue;
            }
            if b < 0x20 {
                self.flush_cluster(i);
                i += 1;
                self.prev_cp = None;
                continue;
            }

            let (cp, len) = decode_utf8(&text[i..]);
            if self.cluster.is_empty() {
                self.cluster_start = i;
            } else if let Some(prev) = self.prev_cp {
                // SAFETY: `break_state` is a plain u8 carried across calls.
                let brk = unsafe { Bun__graphemeBreak(prev, cp, &mut self.break_state) };
                if brk {
                    self.flush_cluster(i);
                    self.cluster_start = i;
                }
            }
            push_utf16(&mut self.cluster, cp);
            self.prev_cp = Some(cp);
            i += len;
        }
        self.flush_cluster(text.len());
    }

    fn parse_escape(&mut self, at: usize) -> usize {
        let text = self.text;
        let mut i = at + 1;
        if i >= text.len() {
            return i;
        }
        match text[i] {
            b'[' => {
                i += 1;
                let start = i;
                while i < text.len() && !(0x40..=0x7e).contains(&text[i]) {
                    i += 1;
                }
                if i < text.len() {
                    let final_byte = text[i];
                    if final_byte == b'm' {
                        self.set_sgr(&text[start..i]);
                    }
                    i += 1;
                }
            }
            b']' => {
                i += 1;
                let start = i;
                while i < text.len() {
                    if text[i] == 0x07 {
                        break;
                    }
                    if text[i] == 0x1b && i + 1 < text.len() && text[i + 1] == b'\\' {
                        break;
                    }
                    i += 1;
                }
                let payload = &text[start..i];
                if let Some(rest) = payload.strip_prefix(b"8;") {
                    if let Some(semi) = strings::index_of(rest, b";") {
                        self.set_uri(&rest[semi + 1..]);
                    }
                }
                if i < text.len() {
                    i += if text[i] == 0x1b { 2 } else { 1 };
                }
            }
            _ => i += 1,
        }
        i
    }

    fn set_uri(&mut self, uri: &[u8]) {
        self.uri = if uri.is_empty() {
            0
        } else if let Some(&id) = self.st.uri_ids.get(uri) {
            id
        } else {
            let id = self.st.uris.len() as u32;
            let key: Box<[u8]> = uri.into();
            self.st.uris.push(key.clone());
            self.st.uri_ids.insert(key, id);
            id
        };
        self.intern_style();
    }

    fn set_sgr(&mut self, params: &[u8]) {
        if params.is_empty() {
            self.open.clear();
            self.intern_style();
            return;
        }

        let mut numbers: Vec<u16> = Vec::new();
        for part in strings::split(params, b";") {
            let n = core::str::from_utf8(part)
                .ok()
                .and_then(|s| s.parse::<u16>().ok())
                .unwrap_or(0);
            numbers.push(n);
        }

        let mut i = 0usize;
        while i < numbers.len() {
            let code = numbers[i];
            match code {
                0 => self.open.clear(),
                38 | 48 => {
                    let group = if code == 38 { GROUP_FG } else { GROUP_BG };
                    let (extended_len, extended) = if numbers.get(i + 1) == Some(&5)
                        && i + 2 < numbers.len()
                    {
                        (3, true)
                    } else if numbers.get(i + 1) == Some(&2) && i + 4 < numbers.len() {
                        (5, true)
                    } else {
                        (0, false)
                    };
                    if extended {
                        let open = make_sgr_open(&numbers[i..i + extended_len]);
                        let close = make_sgr_close(if group == GROUP_FG { 39 } else { 49 });
                        self.set_open(group, open, close);
                        i += extended_len;
                        continue;
                    }
                }
                _ => {
                    let group = group_of(code);
                    let open = make_sgr_open(&[code]);
                    let close = make_sgr_close(close_for(code));
                    self.set_open(group, open, close);
                }
            }
            i += 1;
        }

        self.intern_style();
    }

    fn set_open(&mut self, group: u8, open: Box<[u8]>, close: Box<[u8]>) {
        if group != GROUP_UNIQUE {
            self.open.retain(|attr| attr.group != group);
        }
        self.open.push(OpenAttr { group, open, close });
    }

    fn intern_style(&mut self) {
        let mut key: Vec<u8> = Vec::new();
        let mut close_key: Vec<u8> = Vec::new();
        for (i, attr) in self.open.iter().enumerate() {
            if i > 0 {
                key.push(0);
                close_key.push(0);
            }
            key.extend_from_slice(&attr.open);
            close_key.extend_from_slice(&attr.close);
        }

        let key_id = if let Some(&id) = self.st.sgr_key_ids.get(key.as_slice()) {
            id
        } else {
            let id = self.st.sgr_keys.len() as u32;
            let boxed: Box<[u8]> = key.clone().into();
            self.st.sgr_keys.push(boxed.clone());
            self.st.sgr_key_ids.insert(boxed, id);
            self.st.sgr_close_keys.push(close_key.into());
            id
        };

        let style_key = (key_id, self.uri);
        self.style = match self.st.style_ids.get(&style_key) {
            Some(&id) => id,
            None => {
                let id = self.st.styles.len() as u32;
                self.st.styles.push(style_key);
                self.st.style_ids.insert(style_key, id);
                id
            }
        };
    }
}

// SGR attribute groups: a new value in a group replaces the previous one.
const GROUP_UNIQUE: u8 = 0;
const GROUP_BOLD: u8 = 1;
const GROUP_ITALIC: u8 = 2;
const GROUP_UNDERLINE: u8 = 3;
const GROUP_BLINK: u8 = 4;
const GROUP_REVERSE: u8 = 5;
const GROUP_HIDDEN: u8 = 6;
const GROUP_STRIKE: u8 = 7;
const GROUP_FG: u8 = 8;
const GROUP_BG: u8 = 9;

fn group_of(code: u16) -> u8 {
    match code {
        1 | 2 => GROUP_BOLD,
        3 => GROUP_ITALIC,
        4 | 21 => GROUP_UNDERLINE,
        5 | 6 => GROUP_BLINK,
        7 => GROUP_REVERSE,
        8 => GROUP_HIDDEN,
        9 => GROUP_STRIKE,
        30..=39 | 90..=97 => GROUP_FG,
        40..=49 | 100..=107 => GROUP_BG,
        _ => GROUP_UNIQUE,
    }
}

fn close_for(code: u16) -> u16 {
    match code {
        1 | 2 | 21 | 22 => 22,
        3 => 23,
        4 | 24 => 24,
        5 | 6 | 25 => 25,
        7 => 27,
        8 => 28,
        9 => 29,
        30..=39 | 90..=97 => 39,
        40..=49 | 100..=107 => 49,
        _ => 0,
    }
}

fn make_sgr_open(params: &[u16]) -> Box<[u8]> {
    let mut out = Vec::with_capacity(8 + params.len() * 4);
    out.extend_from_slice(b"\x1b[");
    for (i, p) in params.iter().enumerate() {
        if i > 0 {
            out.push(b';');
        }
        push_decimal(&mut out, *p);
    }
    out.push(b'm');
    out.into()
}

fn make_sgr_close(code: u16) -> Box<[u8]> {
    let mut out = Vec::with_capacity(8);
    out.extend_from_slice(b"\x1b[");
    push_decimal(&mut out, code);
    out.push(b'm');
    out.into()
}

fn push_decimal(out: &mut Vec<u8>, mut n: u16) {
    if n == 0 {
        out.push(b'0');
        return;
    }
    let mut digits = [0u8; 5];
    let mut len = 0;
    while n > 0 {
        digits[len] = b'0' + (n % 10) as u8;
        n /= 10;
        len += 1;
    }
    while len > 0 {
        len -= 1;
        out.push(digits[len]);
    }
}

fn push_utf16(out: &mut Vec<u16>, cp: u32) {
    if cp <= 0xFFFF {
        out.push(cp as u16);
    } else {
        let v = cp - 0x10000;
        out.push(0xD800 + (v >> 10) as u16);
        out.push(0xDC00 + (v & 0x3FF) as u16);
    }
}

fn decode_utf8(bytes: &[u8]) -> (u32, usize) {
    let b0 = bytes[0];
    if b0 < 0x80 {
        return (b0 as u32, 1);
    }
    let len = if b0 >= 0xF0 {
        4
    } else if b0 >= 0xE0 {
        3
    } else if b0 >= 0xC0 {
        2
    } else {
        return (0xFFFD, 1);
    };
    if bytes.len() < len {
        return (0xFFFD, 1);
    }
    let mut cp: u32 = match len {
        2 => (b0 & 0x1F) as u32,
        3 => (b0 & 0x0F) as u32,
        _ => (b0 & 0x07) as u32,
    };
    for &b in &bytes[1..len] {
        if b & 0xC0 != 0x80 {
            return (0xFFFD, 1);
        }
        cp = (cp << 6) | (b & 0x3F) as u32;
    }
    (cp, len)
}

// ─── `Bun.ant` object ───────────────────────────────────────────────────────

pub(crate) fn create(global: &JSGlobalObject, _: &JSObject) -> JSValue {
    let ant = JSValue::create_empty_object(global, 5);
    ant.put(
        global,
        b"setDumpable",
        JSFunction::create(global, "setDumpable", __jsc_host_ant_set_dumpable, 1, Default::default()),
    );
    ant.put(
        global,
        b"getPeerUid",
        JSFunction::create(global, "getPeerUid", __jsc_host_ant_get_peer_uid, 1, Default::default()),
    );
    ant.put(
        global,
        b"getPeerPid",
        JSFunction::create(global, "getPeerPid", __jsc_host_ant_get_peer_pid, 1, Default::default()),
    );
    ant.put(
        global,
        b"memoryPressureLevel",
        JSFunction::create(
            global,
            "memoryPressureLevel",
            __jsc_host_ant_memory_pressure_level,
            0,
            Default::default(),
        ),
    );
    ant.put(
        global,
        b"CellSegmenter",
        bun_jsc::codegen::js::get_constructor::<CellSegmenter>(global),
    );
    ant
}
