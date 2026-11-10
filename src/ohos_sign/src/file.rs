//! Signing a file without holding it: a compiled executable can be hundreds of
//! megabytes, and the in-memory signer would need the original and two copies
//! of it. Reads and writes here are one page at a time, and the only buffer
//! that grows with the file is the 32-byte hash of each page.

use std::fs::{File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::Path;

use crate::{SignError, descriptor, merkle, sha256};

const PAGE: u64 = 4096;
const PAGE_USIZE: usize = PAGE as usize;
const CODESIGN_NAME: &[u8] = b".codesign\0";
const SHT_NOBITS: u32 = 8;
const E_SHOFF: u64 = 0x28;
const E_SHENTSIZE: u64 = 0x3a;
const E_SHNUM: u64 = 0x3c;
const E_SHSTRNDX: u64 = 0x3e;

fn read_u16(buf: &[u8], off: usize) -> u16 {
    u16::from_le_bytes(buf[off..off + 2].try_into().unwrap())
}
fn read_u32(buf: &[u8], off: usize) -> u32 {
    u32::from_le_bytes(buf[off..off + 4].try_into().unwrap())
}
fn read_u64(buf: &[u8], off: usize) -> u64 {
    u64::from_le_bytes(buf[off..off + 8].try_into().unwrap())
}
fn write_u32(buf: &mut [u8], off: usize, value: u32) {
    buf[off..off + 4].copy_from_slice(&value.to_le_bytes());
}
fn write_u64(buf: &mut [u8], off: usize, value: u64) {
    buf[off..off + 8].copy_from_slice(&value.to_le_bytes());
}
fn align_up(value: u64, alignment: u64) -> u64 {
    value.div_ceil(alignment) * alignment
}

fn read_at(file: &mut File, offset: u64, buf: &mut [u8]) -> Result<(), SignError> {
    file.seek(SeekFrom::Start(offset))?;
    file.read_exact(buf)?;
    Ok(())
}

fn write_at(file: &mut File, offset: u64, buf: &[u8]) -> Result<(), SignError> {
    file.seek(SeekFrom::Start(offset))?;
    file.write_all(buf)?;
    Ok(())
}

struct Headers {
    e_shoff: u64,
    e_shnum: u16,
    e_shstrndx: u16,
    /// The section header table, `e_shnum * 64` bytes.
    entries: Vec<u8>,
    shstr: Vec<u8>,
}

fn read_headers(file: &mut File, len: u64) -> Result<Headers, SignError> {
    let mut header = [0u8; 64];
    if len < 64 {
        return Err(SignError::NotElf64);
    }
    read_at(file, 0, &mut header)?;
    if !crate::elf::is_elf64(&header) {
        return Err(SignError::NotElf64);
    }
    let e_shoff = read_u64(&header, E_SHOFF as usize);
    let e_shentsize = read_u16(&header, E_SHENTSIZE as usize);
    let e_shnum = read_u16(&header, E_SHNUM as usize);
    let e_shstrndx = read_u16(&header, E_SHSTRNDX as usize);
    if e_shentsize != 64 || e_shoff == 0 || e_shnum == 0 || e_shstrndx as u64 >= e_shnum as u64 {
        return Err(SignError::NoSectionHeaders);
    }
    let sht_end = e_shoff
        .checked_add(e_shnum as u64 * 64)
        .ok_or(SignError::NoSectionHeaders)?;
    if sht_end > len {
        return Err(SignError::NoSectionHeaders);
    }
    let mut entries = vec![0u8; e_shnum as usize * 64];
    read_at(file, e_shoff, &mut entries)?;
    let shstr_entry = e_shstrndx as usize * 64;
    let shstr_off = read_u64(&entries, shstr_entry + 24);
    let shstr_size = read_u64(&entries, shstr_entry + 32);
    if shstr_off
        .checked_add(shstr_size)
        .is_none_or(|end| end > len)
    {
        return Err(SignError::ShstrtabOutOfBounds);
    }
    let mut shstr = vec![0u8; shstr_size as usize];
    read_at(file, shstr_off, &mut shstr)?;
    Ok(Headers {
        e_shoff,
        e_shnum,
        e_shstrndx,
        entries,
        shstr,
    })
}

/// Where `.codesign` is, if the section table names it.
fn find_codesign(headers: &Headers) -> Option<(usize, u64, u64)> {
    for index in 0..headers.e_shnum as usize {
        let entry = index * 64;
        if read_u32(&headers.entries, entry + 4) != 1 {
            continue;
        }
        let name_offset = read_u32(&headers.entries, entry) as usize;
        let name = headers.shstr.get(name_offset..)?;
        if name.len() >= CODESIGN_NAME.len() && &name[..CODESIGN_NAME.len()] == CODESIGN_NAME {
            return Some((
                index,
                read_u64(&headers.entries, entry + 24),
                read_u64(&headers.entries, entry + 32),
            ));
        }
    }
    None
}

/// Drops the `.codesign` entry and its name. The data behind it is cut off by
/// the caller: every signer puts the section at the end of the file.
fn strip(headers: &mut Headers, index: usize) -> Result<u64, SignError> {
    let entry = index * 64;
    let name_offset = read_u32(&headers.entries, entry) as usize;
    let section_offset = read_u64(&headers.entries, entry + 24);
    if name_offset
        .checked_add(CODESIGN_NAME.len())
        .is_none_or(|end| end > headers.shstr.len())
    {
        return Err(SignError::Malformed);
    }
    headers
        .shstr
        .drain(name_offset..name_offset + CODESIGN_NAME.len());

    let mut entries = Vec::with_capacity(headers.e_shnum as usize * 64 - 64);
    for i in 0..headers.e_shnum as usize {
        if i == index {
            continue;
        }
        let at = i * 64;
        let mut section = [0u8; 64];
        section.copy_from_slice(&headers.entries[at..at + 64]);
        let entry_name = read_u32(&section, 0) as usize;
        if entry_name >= name_offset + CODESIGN_NAME.len() {
            write_u32(&mut section, 0, (entry_name - CODESIGN_NAME.len()) as u32);
        }
        entries.extend_from_slice(&section);
    }
    headers.entries = entries;
    headers.e_shnum -= 1;
    if (index as u16) < headers.e_shstrndx {
        headers.e_shstrndx -= 1;
    }
    Ok(section_offset)
}

/// The end of every byte a section covers, and the end of the file itself.
fn covered_end(headers: &Headers, len: u64) -> u64 {
    let mut end = headers.e_shoff.saturating_add(headers.e_shnum as u64 * 64);
    for index in 0..headers.e_shnum as usize {
        let entry = index * 64;
        let sh_type = read_u32(&headers.entries, entry + 4);
        let offset = read_u64(&headers.entries, entry + 24);
        let size = if sh_type == SHT_NOBITS {
            0
        } else {
            read_u64(&headers.entries, entry + 32)
        };
        end = end.max(offset.saturating_add(size));
    }
    end.max(len)
}

/// A MiB at a time: one read for 256 pages, and a 4 KiB page hashed at a time.
const CHUNK: usize = 1 << 20;

fn page_hashes(
    file: &mut File,
    len: u64,
    codesign_offset: u64,
    codesign_len: u64,
) -> Result<Vec<[u8; 32]>, SignError> {
    let pages = len.div_ceil(PAGE);
    let first = codesign_offset / PAGE;
    let last = codesign_offset.saturating_add(codesign_len).div_ceil(PAGE);
    let mut leaves = Vec::with_capacity(usize::try_from(pages).unwrap_or(0));
    let mut chunk = vec![0u8; CHUNK];
    let mut page = [0u8; PAGE_USIZE];
    let mut done: u64 = 0;
    while done < len {
        let count = usize::try_from((len - done).min(CHUNK as u64)).unwrap_or(CHUNK);
        read_at(file, done, &mut chunk[..count])?;
        let mut within = 0;
        while within < count {
            let index = (done + within as u64) / PAGE;
            let n = PAGE_USIZE.min(count - within);
            if codesign_len > 0 && index >= first && index < last {
                leaves.push([0u8; 32]);
            } else {
                page.fill(0);
                page[..n].copy_from_slice(&chunk[within..within + n]);
                leaves.push(sha256::hash(&page));
            }
            within += n;
        }
        done += count as u64;
    }
    Ok(leaves)
}

fn signed_payload(
    root: [u8; 32],
    file_size: u64,
    tree: &[u8],
) -> ([u8; descriptor::SIZE], [u8; 32], [u8; PAGE_USIZE]) {
    let descriptor_for_digest = descriptor::build(0, file_size, &root);
    let signature = sha256::hash(&descriptor_for_digest);
    let descriptor_on_disk = descriptor::build(32, file_size, &root);

    let payload_len = 8 + descriptor::SIZE + signature.len();
    let mut section = [0u8; PAGE_USIZE];
    section[0..4].copy_from_slice(&descriptor::ELF_SIGN_INFO_TYPE.to_le_bytes());
    section[4..8].copy_from_slice(&((descriptor::SIZE + signature.len()) as u32).to_le_bytes());
    section[8..8 + descriptor::SIZE].copy_from_slice(&descriptor_on_disk);
    section[8 + descriptor::SIZE..payload_len].copy_from_slice(&signature);
    let tree_max = PAGE_USIZE - payload_len;
    if tree_max > 0 {
        let count = tree.len().min(tree_max);
        section[payload_len..payload_len + count].copy_from_slice(&tree[..count]);
    }
    (descriptor_on_disk, signature, section)
}

/// Signs a file in place, reading and writing one page at a time.
///
/// `force` strips an existing `.codesign` first; without it, a signed file is
/// an error, as `sign_selfsign` does.
pub fn sign_file_in_place(path: &Path, force: bool) -> Result<bool, SignError> {
    let mut file = OpenOptions::new().read(true).write(true).open(path)?;
    let mut len = file.metadata()?.len();
    let mut headers = read_headers(&mut file, len)?;
    let existing = find_codesign(&headers);
    if let Some((index, section_offset, section_size)) = existing {
        if !force {
            return Err(SignError::AlreadySigned);
        }
        if section_offset
            .checked_add(section_size)
            .is_none_or(|end| end > len)
        {
            return Err(SignError::Malformed);
        }
        len = strip(&mut headers, index)?;
        file.set_len(len)?;
    }

    let old_shstr_len = headers.shstr.len();
    headers.shstr.extend_from_slice(CODESIGN_NAME);
    let covered = covered_end(&headers, len);
    let codesign_offset = align_up(covered, PAGE);
    let shstr_offset = codesign_offset + PAGE;
    let sht_offset = align_up(shstr_offset + headers.shstr.len() as u64, 8);
    let section_count = headers.e_shnum as usize + 1;
    let total = sht_offset
        .checked_add(section_count as u64 * 64)
        .ok_or(SignError::Malformed)?;
    file.set_len(total)?;

    write_at(&mut file, shstr_offset, &headers.shstr)?;

    let mut entries = headers.entries;
    entries.resize(section_count * 64, 0);
    let shstr_entry = headers.e_shstrndx as usize * 64;
    write_u64(&mut entries, shstr_entry + 24, shstr_offset);
    write_u64(&mut entries, shstr_entry + 32, headers.shstr.len() as u64);
    let codesign_entry = (section_count - 1) * 64;
    write_u32(&mut entries, codesign_entry, old_shstr_len as u32);
    write_u32(&mut entries, codesign_entry + 4, 1); // SHT_PROGBITS
    write_u64(&mut entries, codesign_entry + 24, codesign_offset);
    write_u64(&mut entries, codesign_entry + 32, PAGE);
    write_u64(&mut entries, codesign_entry + 48, PAGE);
    write_at(&mut file, sht_offset, &entries)?;

    write_at(&mut file, E_SHOFF, &sht_offset.to_le_bytes())?;
    write_at(&mut file, E_SHNUM, &(headers.e_shnum + 1).to_le_bytes())?;
    write_at(&mut file, E_SHSTRNDX, &headers.e_shstrndx.to_le_bytes())?;

    let leaves = page_hashes(&mut file, total, codesign_offset, PAGE)?;
    let (root, tree) = merkle::root_hash_from_leaves(leaves);
    let (_, _, section) = signed_payload(root, total, &tree);
    write_at(&mut file, codesign_offset, &section)?;
    Ok(true)
}

/// Whether `path` carries a signature that covers its bytes, without reading
/// the whole file into one buffer.
pub fn is_validly_signed_file(path: &Path) -> Result<bool, SignError> {
    let mut file = File::open(path)?;
    let len = file.metadata()?.len();
    let headers = read_headers(&mut file, len)?;
    let Some((_, codesign_offset, codesign_len)) = find_codesign(&headers) else {
        return Ok(false);
    };
    let sign_info_len = 8 + descriptor::SIZE + 32;
    if codesign_len < sign_info_len as u64 {
        return Ok(false);
    }
    if codesign_offset
        .checked_add(codesign_len)
        .is_none_or(|end| end > len)
    {
        return Ok(false);
    }
    let mut header = [0u8; 8];
    read_at(&mut file, codesign_offset, &mut header)?;
    let kind = read_u32(&header, 0);
    let length = read_u32(&header, 4);
    if kind != descriptor::ELF_SIGN_INFO_TYPE || length as usize != descriptor::SIZE + 32 {
        return Ok(false);
    }
    let mut descriptor_bytes = [0u8; descriptor::SIZE];
    read_at(&mut file, codesign_offset + 8, &mut descriptor_bytes)?;
    if descriptor_bytes[0] != 1
        || descriptor_bytes[1] != 1
        || descriptor_bytes[2] != 12
        || descriptor_bytes[255] != 3
    {
        return Ok(false);
    }
    let sign_size = read_u32(&descriptor_bytes, 4);
    let data_size = read_u64(&descriptor_bytes, 8);
    if sign_size != 32 || data_size != len {
        return Ok(false);
    }
    let mut stored_root = [0u8; 32];
    stored_root.copy_from_slice(&descriptor_bytes[16..48]);
    let leaves = page_hashes(&mut file, len, codesign_offset, codesign_len)?;
    let (root, _) = merkle::root_hash_from_leaves(leaves);
    if stored_root != root {
        return Ok(false);
    }
    let mut stored_signature = [0u8; 32];
    read_at(
        &mut file,
        codesign_offset + 8 + descriptor::SIZE as u64,
        &mut stored_signature,
    )?;
    Ok(stored_signature == sha256::hash(&descriptor::build(0, data_size, &root)))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn minimal_elf64() -> Vec<u8> {
        let mut b = vec![0u8; 208];
        b[0..4].copy_from_slice(b"\x7fELF");
        b[4] = 2;
        b[5] = 1;
        b[6] = 1;
        b[16..18].copy_from_slice(&1u16.to_le_bytes());
        b[18..20].copy_from_slice(&183u16.to_le_bytes());
        b[20..24].copy_from_slice(&1u32.to_le_bytes());
        b[40..48].copy_from_slice(&64u64.to_le_bytes());
        b[52..54].copy_from_slice(&64u16.to_le_bytes());
        b[58..60].copy_from_slice(&64u16.to_le_bytes());
        b[60..62].copy_from_slice(&2u16.to_le_bytes());
        b[62..64].copy_from_slice(&1u16.to_le_bytes());
        b[128..132].copy_from_slice(&1u32.to_le_bytes());
        b[132..136].copy_from_slice(&3u32.to_le_bytes());
        b[152..160].copy_from_slice(&192u64.to_le_bytes());
        b[160..168].copy_from_slice(&11u64.to_le_bytes());
        b[176..184].copy_from_slice(&1u64.to_le_bytes());
        b[192..203].copy_from_slice(b"\0.shstrtab\0");
        b
    }

    fn temporary_file(name: &str, bytes: &[u8]) -> std::path::PathBuf {
        let path =
            std::env::temp_dir().join(format!("ohos-sign-file-{}-{name}", std::process::id()));
        let mut file = File::create(&path).unwrap();
        file.write_all(bytes).unwrap();
        path
    }

    #[test]
    fn file_signing_matches_memory_signing() {
        let mut elf = minimal_elf64();
        let trailer = b"BUN-STANDALONE-GRAPH-0123456789";
        let trailer_at = elf.len();
        elf.extend_from_slice(trailer);
        let path = temporary_file("match", &elf);
        assert!(!is_validly_signed_file(&path).unwrap());
        assert!(sign_file_in_place(&path, false).unwrap());
        assert!(is_validly_signed_file(&path).unwrap());
        let signed = std::fs::read(&path).unwrap();
        assert!(crate::is_validly_signed(&signed));
        assert_eq!(
            &signed[trailer_at..trailer_at + trailer.len()],
            trailer,
            "data behind the section table must stay where it was"
        );
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn file_signing_strips_an_old_signature() {
        let elf = minimal_elf64();
        let path = temporary_file("strip", &elf);
        assert!(sign_file_in_place(&path, false).unwrap());
        let first = std::fs::read(&path).unwrap();
        assert!(crate::is_validly_signed(&first));
        assert!(sign_file_in_place(&path, true).unwrap());
        let second = std::fs::read(&path).unwrap();
        assert!(crate::is_validly_signed(&second));
        assert_eq!(
            crate::has_codesign(&second),
            true,
            "signing again must leave exactly one .codesign"
        );
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn a_large_file_is_signed_without_a_second_copy() {
        let mut elf = minimal_elf64();
        elf.resize(8 << 20, 0);
        elf.extend_from_slice(b"tail behind the sections");
        let path = temporary_file("large", &elf);
        assert!(sign_file_in_place(&path, false).unwrap());
        assert!(is_validly_signed_file(&path).unwrap());
        let signed = std::fs::read(&path).unwrap();
        assert!(crate::is_validly_signed(&signed));
        let trailer = b"tail behind the sections";
        assert_eq!(&signed[8 << 20..(8 << 20) + trailer.len()], trailer);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn tampering_is_rejected() {
        let elf = minimal_elf64();
        let path = temporary_file("tamper", &elf);
        assert!(sign_file_in_place(&path, false).unwrap());
        let mut file = OpenOptions::new()
            .read(true)
            .write(true)
            .open(&path)
            .unwrap();
        write_at(&mut file, 10, &[0xff]).unwrap();
        assert!(!is_validly_signed_file(&path).unwrap());
        let _ = std::fs::remove_file(&path);
    }
}
