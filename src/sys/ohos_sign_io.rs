//! OHOS: file-level ELF self-signing — the I/O policy over `ohos_sign`'s pure
//! byte operations.
//!
//! This lives in `bun_sys` rather than `ohos_sign` because the signing call
//! sites need this crate's file wrappers, and `bun_sys` already depends on
//! `ohos_sign` (the dlopen retry below), so the dependency cannot point the
//! other way. Callers: the dlopen retry in this crate, `spawn_sys` (script
//! shim), install's ELF pass, `--compile` outputs, and `BunProcess.cpp` via
//! the `ohos_ensure_elf_signed` FFI.

use crate::{Error, Fd, File, Maybe, Mode, O, Stat, Tag, ZStr};
use std::collections::HashSet;
use std::path::Path;
use std::sync::{Mutex, OnceLock};

/// `(dev, ino, size, mtime sec, mtime nsec)` — any later modification forces
/// the file through the checks again.
type FileKey = (u64, u64, u64, i64, i64);

fn file_key(md: &Stat) -> FileKey {
    (
        md.st_dev,
        md.st_ino,
        md.st_size as u64,
        md.st_mtime,
        md.st_mtime_nsec,
    )
}

/// Files this process already signed (recorded from the *post-sign* metadata)
/// or already failed to sign. A hit skips the syscalls below entirely.
fn signed_file_cache() -> &'static Mutex<HashSet<FileKey>> {
    static CACHE: OnceLock<Mutex<HashSet<FileKey>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashSet::new()))
}

fn attempted_file_cache() -> &'static Mutex<HashSet<FileKey>> {
    static CACHE: OnceLock<Mutex<HashSet<FileKey>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashSet::new()))
}

fn path_bytes(path: &Path) -> &[u8] {
    use std::os::unix::ffi::OsStrExt as _;
    path.as_os_str().as_bytes()
}

/// Borrow `path` as a `ZStr` in a stack `PATH_MAX` buffer, for the calls whose
/// signature is NUL-terminated (`stat`, `rename`, `unlinkat`). The buffer dies
/// with `body`, so the borrow cannot escape.
fn with_zstr<R>(path: &Path, tag: Tag, body: impl FnOnce(&ZStr) -> Maybe<R>) -> Maybe<R> {
    let src = path_bytes(path);
    let mut buf = [0u8; 4096];
    if src.len() >= buf.len() {
        return Err(Error::from_code_int(libc::ENAMETOOLONG, tag));
    }
    buf[..src.len()].copy_from_slice(src);
    body(ZStr::from_buf(&buf, src.len()))
}

fn stat_path(path: &Path) -> Maybe<Stat> {
    with_zstr(path, Tag::fstatat, |z| crate::stat(z))
}

fn read_file(path: &Path) -> Maybe<Vec<u8>> {
    let f = File::openat(Fd::cwd(), path_bytes(path), O::RDONLY | O::CLOEXEC, 0)?;
    let out = f.read_to_end();
    let _ = f.close();
    out
}

/// True when `path` starts with the ELF magic. Reads four bytes, never the
/// whole file: the spawn paths call this on every target, including scripts.
fn has_elf_magic(path: &Path) -> bool {
    let Ok(f) = File::openat(Fd::cwd(), path_bytes(path), O::RDONLY | O::CLOEXEC, 0) else {
        return false;
    };
    let mut magic = [0u8; 4];
    let is_elf = matches!(f.read(&mut magic), Ok(4)) && magic == [0x7f, b'E', b'L', b'F'];
    let _ = f.close();
    is_elf
}

/// Sign `path` in place if it is an ELF file this process has not signed yet.
///
/// Returns true when `path` is an ELF file (signed, or already signed unchanged
/// by this process); false for non-ELF files, unreadable paths, or a failed
/// signature. Failures are silent by design: callers report the real
/// exec/dlopen error, and an error line here would pollute stderr and trip
/// `stderr.not.toContain("error:")` test assertions.
pub fn ensure_signed_inplace(path: &Path) -> bool {
    let Ok(md) = stat_path(path) else {
        return false;
    };
    let key = file_key(&md);
    if signed_file_cache().lock().unwrap().contains(&key) {
        return true;
    }
    if attempted_file_cache().lock().unwrap().contains(&key) {
        return false;
    }
    if !has_elf_magic(path) {
        attempted_file_cache().lock().unwrap().insert(key);
        return false;
    }
    // One read serves both the validation and the fallback signing below.
    let Ok(bytes) = read_file(path) else {
        attempted_file_cache().lock().unwrap().insert(key);
        return false;
    };
    // A signature that still validates is left untouched: re-signing rewrites
    // the file (EACCES once OHOS marked it immutable after execution) and pays
    // a full read/strip/sign/write per dlopen. The cache above already covers
    // repeat lookups with a single stat.
    if ohos_sign::is_validly_signed(&bytes) {
        signed_file_cache().lock().unwrap().insert(key);
        return true;
    }
    // Non-ELF64 inputs (e.g. Mach-O templates for --target=bun-darwin-*) are
    // skipped silently: the compile pipeline calls this unconditionally on
    // OHOS, and only ELF outputs need signing.
    if !ohos_sign::is_elf64(&bytes) {
        signed_file_cache().lock().unwrap().insert(key);
        return true;
    }
    let Ok(signed) = ohos_sign::sign_selfsign_with_strip(&bytes) else {
        attempted_file_cache().lock().unwrap().insert(key);
        return false;
    };
    if write_signed(path, &signed).is_err() {
        attempted_file_cache().lock().unwrap().insert(key);
        return false;
    }
    if let Ok(md) = stat_path(path) {
        signed_file_cache().lock().unwrap().insert(file_key(&md));
    }
    true
}

/// Write `data` over `path`, preferring a sibling temp file + rename so an
/// inode the kernel marked immutable after execution can still be replaced;
/// falls back to an in-place rewrite when the directory is not writable.
fn write_signed(path: &Path, data: &[u8]) -> Maybe<()> {
    let dir = path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("elf");
    let tmp = dir.join(format!(".{file_name}.ohos-sign.tmp"));
    match write_temp_then_rename(&tmp, path, data) {
        Ok(()) => Ok(()),
        Err(_) => {
            let _ = with_zstr(&tmp, Tag::unlink, |z| crate::unlinkat(Fd::cwd(), z));
            let mode = stat_path(path).map(|md| md.st_mode).unwrap_or(0o755);
            let f = File::openat(
                Fd::cwd(),
                path_bytes(path),
                O::WRONLY | O::CREAT | O::TRUNC | O::CLOEXEC,
                mode as Mode,
            )?;
            let out = f.write_all(data);
            let _ = f.close();
            out
        }
    }
}

fn write_temp_then_rename(tmp: &Path, dest: &Path, data: &[u8]) -> Maybe<()> {
    let mode = stat_path(dest)
        .map(|md| (md.st_mode & 0o7777) as Mode)
        .unwrap_or(0o755);
    let f = File::openat(
        Fd::cwd(),
        path_bytes(tmp),
        O::WRONLY | O::CREAT | O::TRUNC | O::CLOEXEC,
        mode,
    )?;
    f.write_all(data)?;
    let _ = f.close();
    with_zstr(tmp, Tag::rename, |t| {
        with_zstr(dest, Tag::rename, |d| crate::rename(t, d))
    })
}

/// C FFI bridge: ensure an ELF file at `path` has a `.codesign` section.
/// If unsigned, signs it in-place using self-sign. Returns true if the file
/// is (or became) signed; false if not an ELF or signing failed.
/// Called from BunProcess.cpp before `dlopen()`.
#[unsafe(no_mangle)]
pub extern "C" fn ohos_ensure_elf_signed(path: *const core::ffi::c_char) -> bool {
    if path.is_null() {
        return false;
    }
    use std::os::unix::ffi::OsStrExt as _;
    let bytes = unsafe { core::ffi::CStr::from_ptr(path) }.to_bytes();
    ensure_signed_inplace(Path::new(std::ffi::OsStr::from_bytes(bytes)))
}
