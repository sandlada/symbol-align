/**
 * The wasm boundary of the Rust core.
 *
 * The module is instantiated synchronously from an inline base64 payload, so
 * the public API stays synchronous and the package can be bundled for Node.js,
 * the browser, a worker or the VS Code extension host without an asset loader.
 */

import { WASM_BASE64 } from './generated/wasm-binary.js';

/** The subset of `WebAssembly.Memory` the boundary needs. */
interface WasmMemory {
    readonly buffer: ArrayBuffer;
}

/** The exports of the core module. */
interface WasmExports {
    readonly memory: WasmMemory;
    alloc(length: number): number;
    dealloc(pointer: number, length: number): void;
    align(codePointer: number, codeLength: number, optionsPointer: number, optionsLength: number, outLengthPointer: number): number;
    scan(codePointer: number, codeLength: number, profilePointer: number, profileLength: number, outLengthPointer: number): number;
    find_symbols(linePointer: number, lineLength: number, optionsPointer: number, optionsLength: number, outLengthPointer: number): number;
    find_declarations(linePointer: number, lineLength: number, optionsPointer: number, optionsLength: number, outLengthPointer: number): number;
    profiles(outLengthPointer: number): number;
}

/** The subset of the WebAssembly API the loader needs. */
interface WasmApi {
    readonly Module: new (bytes: Uint8Array) => unknown;
    readonly Instance: new (module: unknown) => { readonly exports: unknown };
}

/** The outcome of an alignment call. */
export interface WasmAlignResult {
    readonly code: string;
    readonly changes: number;
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Maps one base64 character code to its six-bit value. */
const BASE64_VALUES = (() => {
    const values = new Int16Array(128).fill(-1);

    for (let index = 0; index < BASE64_ALPHABET.length; index += 1) {
        values[BASE64_ALPHABET.charCodeAt(index)] = index;
    }

    return values;
})();

/** Decodes a base64 string without relying on `atob` or `Buffer`. */
const decodeBase64 = (text: string): Uint8Array => {
    let padding = 0;

    if (text.endsWith('==')) {
        padding = 2;
    } else if (text.endsWith('=')) {
        padding = 1;
    }

    const bytes = new Uint8Array((text.length / 4) * 3 - padding);
    let output = 0;

    for (let index = 0; index < text.length; index += 4) {
        const a = BASE64_VALUES[text.charCodeAt(index)] ?? -1;
        const b = BASE64_VALUES[text.charCodeAt(index + 1)] ?? -1;
        const c = BASE64_VALUES[text.charCodeAt(index + 2)] ?? -1;
        const d = BASE64_VALUES[text.charCodeAt(index + 3)] ?? -1;

        if (a < 0 || b < 0) {
            throw new Error('Invalid wasm payload: malformed base64 data.');
        }

        const chunk = (a << 18) | (b << 12) | (Math.max(c, 0) << 6) | Math.max(d, 0);

        if (output < bytes.length) bytes[output++] = (chunk >> 16) & 0xff;
        if (output < bytes.length) bytes[output++] = (chunk >> 8) & 0xff;
        if (output < bytes.length) bytes[output++] = chunk & 0xff;
    }

    return bytes;
};

const wasmApi = (globalThis as unknown as { readonly WebAssembly?: WasmApi }).WebAssembly;

if (wasmApi === undefined) {
    throw new Error('The current runtime does not provide WebAssembly.');
}

const module = new wasmApi.Module(decodeBase64(WASM_BASE64));
const instance = new wasmApi.Instance(module);
const core = instance.exports as WasmExports;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { ignoreBOM: true });

/** A four byte scratch buffer that receives the result length of a call. */
const outLengthPointer = core.alloc(4);

/** Writes one UTF-8 string into wasm memory. */
const writeText = (text: string): { readonly pointer: number; readonly length: number } => {
    const bytes = encoder.encode(text);
    const pointer = core.alloc(bytes.length);

    if (bytes.length > 0) {
        new Uint8Array(core.memory.buffer, pointer, bytes.length).set(bytes);
    }

    return { pointer, length: bytes.length };
};

/** Reads the four byte result length. */
const readLength = (): number => new DataView(core.memory.buffer, outLengthPointer, 4).getUint32(0, true);

/** Copies a result buffer out of wasm memory and releases it. */
const readBytes = (pointer: number, length: number): Uint8Array => {
    const view = new Uint8Array(core.memory.buffer, pointer, length);
    const copy = view.slice();

    core.dealloc(pointer, length);

    return copy;
};

/** Runs a call that returns a JSON string. */
const callJson = (invoke: (outLength: number) => number): string => {
    const pointer = invoke(outLengthPointer);
    const length = readLength();
    const bytes = readBytes(pointer, length);

    return decoder.decode(bytes);
};

/** Runs a call with two text inputs and returns JSON. */
const callWithTwoInputs = (first: string, second: string, invoke: (firstPointer: number, firstLength: number, secondPointer: number, secondLength: number, outLength: number) => number): string => {
    const left = writeText(first);
    const right = writeText(second);

    try {
        return callJson((outLength) => invoke(left.pointer, left.length, right.pointer, right.length, outLength));
    } finally {
        core.dealloc(left.pointer, left.length);
        core.dealloc(right.pointer, right.length);
    }
};

/** Aligns `code` with the JSON encoded options payload. */
export const alignCode = (code: string, optionsJson: string): WasmAlignResult => {
    const codeInput = writeText(code);
    const optionsInput = writeText(optionsJson);

    try {
        const pointer = core.align(codeInput.pointer, codeInput.length, optionsInput.pointer, optionsInput.length, outLengthPointer);
        const length = readLength();
        const bytes = new Uint8Array(core.memory.buffer, pointer, length);
        const changes = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, true);
        const aligned = decoder.decode(bytes.subarray(4));

        core.dealloc(pointer, length);

        return { code: aligned, changes };
    } finally {
        core.dealloc(codeInput.pointer, codeInput.length);
        core.dealloc(optionsInput.pointer, optionsInput.length);
    }
};

/** Scans `code` with the JSON encoded language profile. */
export const scanCode = (code: string, profileJson: string): string =>
    callWithTwoInputs(code, profileJson, (codePointer, codeLength, profilePointer, profileLength, outLength) => core.scan(codePointer, codeLength, profilePointer, profileLength, outLength));

/** Finds symbol positions on one line. */
export const findSymbols = (line: string, optionsJson: string): string =>
    callWithTwoInputs(line, optionsJson, (linePointer, lineLength, optionsPointer, optionsLength, outLength) => core.find_symbols(linePointer, lineLength, optionsPointer, optionsLength, outLength));

/** Locates declaration cells on one line. */
export const findDeclarations = (line: string, optionsJson: string): string =>
    callWithTwoInputs(line, optionsJson, (linePointer, lineLength, optionsPointer, optionsLength, outLength) => core.find_declarations(linePointer, lineLength, optionsPointer, optionsLength, outLength));

/** Returns every language profile as JSON. */
export const readProfiles = (): string => callJson((outLength) => core.profiles(outLength));
