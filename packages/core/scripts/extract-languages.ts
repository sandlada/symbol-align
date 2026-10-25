/**
 * Extracts the language profiles of the TypeScript reference implementation.
 *
 * This is a one-time migration helper: it freezes the 57 profiles into
 * `languages.json`, which becomes the single source of truth for the generated
 * Rust and TypeScript data modules.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { allLanguages } from '../../core-ts/src/language.js';

const target = fileURLToPath(new URL('../languages.json', import.meta.url));

writeFileSync(target, `${JSON.stringify(allLanguages, null, 4)}\n`, 'utf-8');
process.stdout.write(`Wrote ${allLanguages.length} language profiles to ${target}\n`);
