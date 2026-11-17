import { describe, expect, it } from 'vitest';

import { parsePayload, runBoundary } from './boundary.js';
import { SymbolAlignError } from './errors.js';

describe('runBoundary', () => {
    it('returns the value of a successful call', () => {
        expect(runBoundary('align', () => 42)).toBe(42);
    });

    it('throws a core error that names the failed operation', () => {
        const failure = new Error('unreachable');

        expect(() =>
            runBoundary('scan', () => {
                throw failure;
            }),
        ).toThrow(SymbolAlignError);

        expect(() =>
            runBoundary('scan', () => {
                throw failure;
            }),
        ).toThrow(expect.objectContaining({ operation: 'scan' }));
    });

    it('keeps the original error as the cause', () => {
        const failure = new Error('unreachable');

        try {
            runBoundary('align', () => {
                throw failure;
            });
            expect.unreachable('the call should have failed');
        } catch (error) {
            expect(error).toBeInstanceOf(SymbolAlignError);
            expect((error as SymbolAlignError).cause).toBe(failure);
        }
    });

    it('passes a core error through unchanged', () => {
        const failure = new SymbolAlignError('align', 'The core failed.');

        try {
            runBoundary('align', () => {
                throw failure;
            });
            expect.unreachable('the call should have failed');
        } catch (error) {
            expect(error).toBe(failure);
        }
    });
});

describe('parsePayload', () => {
    it('parses a JSON payload', () => {
        expect(parsePayload('profiles', '{"id":"generic"}')).toEqual({ id: 'generic' });
    });

    it('throws a core error for a malformed payload', () => {
        expect(() => parsePayload('profiles', 'not json')).toThrow(SymbolAlignError);
    });

    it('names the operation of a malformed payload', () => {
        expect(() => parsePayload('profiles', 'not json')).toThrow(expect.objectContaining({ operation: 'profiles' }));
    });

    it('keeps the syntax error as the cause', () => {
        try {
            parsePayload('profiles', 'not json');
            expect.unreachable('the payload should have been rejected');
        } catch (error) {
            expect(error).toBeInstanceOf(SymbolAlignError);
            expect((error as SymbolAlignError).cause).toBeInstanceOf(SyntaxError);
        }
    });
});
