//! Raw wasm ABI of the core.
//!
//! The ABI is deliberately dependency free: the JavaScript wrapper allocates a
//! buffer, writes UTF-8 bytes into it, calls one of the exported functions and
//! copies the result out. Every result is an owned boxed slice; the caller must
//! release it with [`dealloc`] using the exact length that the function wrote
//! into `out_len_ptr`.
//!
//! All pointers are 32-bit values in wasm. The module never retains a pointer
//! after a call returns.

use crate::declarations::{DeclarationOptions, find_declaration_cells};
use crate::finder::{FindOptions, find_symbol_positions};
use crate::json;
use crate::line::{Line, split_lines};
use crate::{aligner, language, scanner};

/// Copies `len` bytes out of wasm memory into a string.
fn read_string(ptr: *const u8, len: usize) -> String {
    if len == 0 || ptr.is_null() {
        return String::new();
    }

    let bytes = unsafe { std::slice::from_raw_parts(ptr, len) };

    String::from_utf8_lossy(bytes).into_owned()
}

/// Leaks `bytes` and writes its length to `out_len`.
fn output(bytes: Vec<u8>, out_len: *mut usize) -> *mut u8 {
    let mut boxed = bytes.into_boxed_slice();
    let len = boxed.len();
    let ptr = boxed.as_mut_ptr();

    std::mem::forget(boxed);
    unsafe {
        *out_len = len;
    }

    ptr
}

/// Allocates `len` zeroed bytes inside wasm memory.
#[unsafe(no_mangle)]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    let mut boxed = vec![0u8; len].into_boxed_slice();
    let ptr = boxed.as_mut_ptr();

    std::mem::forget(boxed);
    ptr
}

/// Releases a buffer returned by [`alloc`] or by one of the exported functions.
#[unsafe(no_mangle)]
pub extern "C" fn dealloc(ptr: *mut u8, len: usize) {
    if ptr.is_null() {
        return;
    }

    unsafe {
        drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(ptr, len)));
    }
}

/// Aligns `code` with the JSON options payload.
///
/// The result is a four byte little-endian change counter followed by the
/// UTF-8 encoded aligned code.
#[unsafe(no_mangle)]
pub extern "C" fn align(
    code_ptr: *const u8,
    code_len: usize,
    options_ptr: *const u8,
    options_len: usize,
    out_len: *mut usize,
) -> *mut u8 {
    let code = read_string(code_ptr, code_len);
    let options = json::parse_align_options(&read_string(options_ptr, options_len));
    let result = aligner::align(&code, &options);
    let mut bytes = Vec::with_capacity(4 + result.code.len());

    bytes.extend_from_slice(&(result.changes as u32).to_le_bytes());
    bytes.extend_from_slice(result.code.as_bytes());

    output(bytes, out_len)
}

/// Scans `code` with the JSON profile payload and returns JSON.
#[unsafe(no_mangle)]
pub extern "C" fn scan(
    code_ptr: *const u8,
    code_len: usize,
    profile_ptr: *const u8,
    profile_len: usize,
    out_len: *mut usize,
) -> *mut u8 {
    let code = read_string(code_ptr, code_len);
    let profile = json::parse_profile(&read_string(profile_ptr, profile_len));
    let lines = split_lines(&code);
    let result = scanner::scan_source(&code, &profile);

    output(
        json::scan_result_json(&result, &lines).into_bytes(),
        out_len,
    )
}

/// Finds symbol positions on one line and returns JSON.
#[unsafe(no_mangle)]
pub extern "C" fn find_symbols(
    line_ptr: *const u8,
    line_len: usize,
    options_ptr: *const u8,
    options_len: usize,
    out_len: *mut usize,
) -> *mut u8 {
    let text = read_string(line_ptr, line_len);
    let line = Line::new(&text);
    let parsed = json::parse_find_options(&read_string(options_ptr, options_len), &line);
    let options = FindOptions {
        regions: &parsed.regions,
        symbols: &parsed.symbols,
        operators: &parsed.operators,
        comment: parsed.comment.as_ref(),
    };
    let positions = find_symbol_positions(&line, &options);

    output(
        json::positions_json(&positions, &line).into_bytes(),
        out_len,
    )
}

/// Locates declaration cells on one line and returns JSON.
#[unsafe(no_mangle)]
pub extern "C" fn find_declarations(
    line_ptr: *const u8,
    line_len: usize,
    options_ptr: *const u8,
    options_len: usize,
    out_len: *mut usize,
) -> *mut u8 {
    let text = read_string(line_ptr, line_len);
    let line = Line::new(&text);
    let parsed = json::parse_declaration_options(&read_string(options_ptr, options_len), &line);
    let options = DeclarationOptions {
        regions: &parsed.regions,
        style: parsed.style,
    };
    let cells = find_declaration_cells(&line, &options);

    output(
        json::cells_json(cells.as_deref(), &line).into_bytes(),
        out_len,
    )
}

/// Returns every language profile as JSON.
#[unsafe(no_mangle)]
pub extern "C" fn profiles(out_len: *mut usize) -> *mut u8 {
    output(
        json::profiles_json(&language::all_profiles()).into_bytes(),
        out_len,
    )
}
