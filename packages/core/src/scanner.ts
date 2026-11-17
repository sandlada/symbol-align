/**
 * Lexical scanner adapter of `@sandlada/symbol-align`.
 *
 * The scanner itself is implemented in Rust; this module serializes the
 * profile and rehydrates the scan result.
 */

import { scanCode } from './abi.js';
import { parsePayload } from './boundary.js';
import { SymbolAlignError } from './errors.js';
import type { LanguageProfile, LineComment, ScanResult } from './types.js';

/** The wire shape of a scan result: `undefined` is encoded as `null`. */
interface WireScanResult {
    readonly codeRegions: ScanResult['codeRegions'];
    readonly lineComments: readonly (LineComment | null)[];
}

/** Whether the payload of the core has the shape of a scan result. */
const isWireScanResult = (value: unknown): value is WireScanResult => {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const candidate = value as Partial<WireScanResult>;

    return Array.isArray(candidate.codeRegions) && Array.isArray(candidate.lineComments);
};

/** Scans `code` with the lexical rules of `profile`. */
export const scanSource =
    (code: string) =>
    (profile: LanguageProfile): ScanResult => {
        const wire = parsePayload<unknown>('scan', scanCode(code, JSON.stringify(profile)));

        if (!isWireScanResult(wire)) {
            throw new SymbolAlignError('scan', 'The core returned a malformed "scan" payload.');
        }

        return {
            codeRegions: wire.codeRegions,
            lineComments: wire.lineComments.map((comment) => comment ?? undefined),
        };
    };
