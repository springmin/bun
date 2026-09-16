mod descriptor;
mod elf;
mod merkle;
mod sha256;

pub use elf::SignError;
pub use elf::is_elf64;

// Exported under `__` names so integration tests can reach internal primitives
// without exposing them as first-class public API.
#[doc(hidden)]
pub fn __sha256_hash(data: &[u8]) -> [u8; 32] {
    sha256::hash(data)
}

#[doc(hidden)]
pub fn __merkle_root_hash(data: &[u8], cs_off: u64, cs_len: u64) -> [u8; 32] {
    merkle::root_hash(data, cs_off, cs_len)
}

#[doc(hidden)]
pub fn __descriptor_build(sign_size: u32, file_size: u64, root_hash: &[u8; 32]) -> [u8; 256] {
    descriptor::build(sign_size, file_size, root_hash)
}

/// Number of bytes in the on-disk ElfSignInfo payload: 8-byte header +
/// 256-byte fs-verity descriptor + 32-byte SHA-256 signature.
const SIGN_INFO_LEN: usize = 8 + descriptor::SIZE + 32;

/// Validate an existing self-signature: the descriptor is well-formed, the
/// stored page Merkle root matches a freshly recomputed one, and the stored
/// signature equals SHA-256 of the descriptor with signSize zeroed.
pub fn is_validly_signed(elf: &[u8]) -> bool {
    let Some((cs_off, cs_len)) = elf::codesign_section_range(elf) else {
        return false;
    };
    if cs_len < SIGN_INFO_LEN {
        return false;
    }
    let d = cs_off + 8;
    let kind = u32::from_le_bytes(elf[cs_off..cs_off + 4].try_into().unwrap());
    let length = u32::from_le_bytes(elf[cs_off + 4..cs_off + 8].try_into().unwrap());
    if kind != descriptor::ELF_SIGN_INFO_TYPE || length as usize != descriptor::SIZE + 32 {
        return false;
    }
    if elf[d] != 1 || elf[d + 1] != 1 || elf[d + 2] != 12 || elf[d + 255] != 3 {
        return false;
    }
    let sign_size = u32::from_le_bytes(elf[d + 4..d + 8].try_into().unwrap());
    let data_size = u64::from_le_bytes(elf[d + 8..d + 16].try_into().unwrap());
    if sign_size != 32 || data_size != elf.len() as u64 {
        return false;
    }
    let mut stored_root = [0u8; 32];
    stored_root.copy_from_slice(&elf[d + 16..d + 48]);
    let root = merkle::root_hash(elf, cs_off as u64, cs_len as u64);
    if stored_root != root {
        return false;
    }
    let mut stored_signature = [0u8; 32];
    stored_signature.copy_from_slice(&elf[d + descriptor::SIZE..d + descriptor::SIZE + 32]);
    stored_signature == sha256::hash(&descriptor::build(0, data_size, &root))
}

/// Returns true if the ELF bytes already contain a `.codesign` section.
pub fn has_codesign(elf: &[u8]) -> bool {
    elf::has_codesign_section(elf)
}

/// Sign `elf` bytes with self-sign (flags=0x10). Fails if already signed.
/// Use `sign_selfsign_with_strip` to strip-then-sign.
pub fn sign_selfsign(elf: &[u8]) -> Result<Vec<u8>, SignError> {
    elf::sign(elf, false)
}

/// Strip existing `.codesign` section then sign.
pub fn sign_selfsign_with_strip(elf: &[u8]) -> Result<Vec<u8>, SignError> {
    elf::sign(elf, true)
}

/// Strip `.codesign` section in-place in the buffer.
/// Returns true if a section was removed, false if none present.
pub fn strip_codesign(elf: &mut Vec<u8>) -> Result<bool, SignError> {
    elf::strip(elf)
}
