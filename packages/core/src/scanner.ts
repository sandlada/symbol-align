/**
 * Lexical scanner adapter of `@sandlada/symbol-align`.
 *
 * The scanner itself is implemented in Rust; this module serializes the
 * profile and rehydrates the scan result.
 */

import { scanCode } from './abi.js';
import type { LanguageProfile, LineComment, ScanResult } from './types.js';

/** The wire shape of a scan result: `undefined` is encoded as `null`. */
interface WireScanResult {
    readonly codeRegions: ScanResult['codeRegions'];
    readonly lineComments: readonly (LineComment | null)[];
}

/** Scans `code` with the lexical rules of `profile`. */
export const scanSource =
    (code: string) =>
    (profile: LanguageProfile): ScanResult => {
        const wire = JSON.parse(scanCode(code, JSON.stringify(profile))) as WireScanResult;

        return {
            codeRegions: wire.codeRegions,
            lineComments: wire.lineComments.map((comment) => comment ?? undefined),
        };
    };
