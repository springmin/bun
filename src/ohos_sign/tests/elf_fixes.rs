// Regression tests for the ELF-level fixes:
//  - data appended after the section header table (Bun's standalone module
//    graph) must survive signing — the old copy stopped at the aligned end of
//    the last section and silently truncated everything past it, breaking
//    `bun build --compile` output.
//  - a big-endian ELF must be rejected: the signer reads and writes
//    little-endian fields, so accepting one corrupted it silently.
//  - is_validly_signed must accept a freshly signed file and reject an
//    unsigned or modified one, so `ensure_signed_inplace` can skip the
//    rewrite of an already-valid signature.
use ohos_sign::{is_validly_signed, sign_selfsign};

/// ELF64 with only the null section and a `.shstrtab`; enough for the signer's
/// section-header walk. Layout: ELF header (0..64), null section header
/// (64..128), `.shstrtab` header (128..192), its bytes (192..203).
fn minimal_elf64() -> Vec<u8> {
    let mut b = vec![0u8; 208];
    b[0..4].copy_from_slice(b"\x7fELF");
    b[4] = 2; // ELFCLASS64
    b[5] = 1; // ELFDATA2LSB
    b[6] = 1; // EV_CURRENT
    b[16..18].copy_from_slice(&1u16.to_le_bytes()); // e_type = ET_REL
    b[18..20].copy_from_slice(&183u16.to_le_bytes()); // e_machine = EM_AARCH64
    b[20..24].copy_from_slice(&1u32.to_le_bytes()); // e_version
    b[40..48].copy_from_slice(&64u64.to_le_bytes()); // e_shoff
    b[52..54].copy_from_slice(&64u16.to_le_bytes()); // e_ehsize
    b[58..60].copy_from_slice(&64u16.to_le_bytes()); // e_shentsize
    b[60..62].copy_from_slice(&2u16.to_le_bytes()); // e_shnum
    b[62..64].copy_from_slice(&1u16.to_le_bytes()); // e_shstrndx
    // .shstrtab section header (index 1) at e_shoff + 64
    b[128..132].copy_from_slice(&1u32.to_le_bytes()); // sh_name
    b[132..136].copy_from_slice(&3u32.to_le_bytes()); // sh_type = SHT_STRTAB
    b[152..160].copy_from_slice(&192u64.to_le_bytes()); // sh_offset
    b[160..168].copy_from_slice(&11u64.to_le_bytes()); // sh_size
    b[176..184].copy_from_slice(&1u64.to_le_bytes()); // sh_addralign
    b[192..203].copy_from_slice(b"\0.shstrtab\0");
    b
}

#[test]
fn trailing_data_survives_signing() {
    let mut elf = minimal_elf64();
    let trailer = b"BUN-STANDALONE-GRAPH-0123456789";
    let trailer_off = elf.len();
    elf.extend_from_slice(trailer);

    let signed = sign_selfsign(&elf).expect("minimal ELF must sign");
    assert_eq!(
        &signed[trailer_off..trailer_off + trailer.len()],
        trailer,
        "data appended after the section header table must be preserved",
    );
    assert!(is_validly_signed(&signed), "signed bytes must validate");
}

#[test]
fn big_endian_elf_is_rejected() {
    let mut elf = minimal_elf64();
    elf[5] = 2; // ELFDATA2MSB
    assert!(sign_selfsign(&elf).is_err(), "big-endian ELF must not be signed");
}

#[test]
fn valid_signature_is_recognized_and_tampering_is_not() {
    let elf = minimal_elf64();
    assert!(!is_validly_signed(&elf), "unsigned bytes must not validate");

    let mut signed = sign_selfsign(&elf).expect("minimal ELF must sign");
    assert!(is_validly_signed(&signed));

    let last = signed.len() - 1;
    signed[last] ^= 0xff;
    assert!(
        !is_validly_signed(&signed),
        "a modified file must not validate (data_size/merkle root cover it)",
    );
}
