import { describe, expect, it } from 'vitest';

import { flushStream, ignoreBrokenPipe, isBrokenPipe, type ErrorStream, type FlushableStream } from './pipe.js';

/** A stream that reports an error to its listener. */
const streamOf = (): ErrorStream & { emit: (error: unknown) => void } => {
    const listeners: ((error: unknown) => void)[] = [];

    return {
        on: (_event, listener) => {
            listeners.push(listener);
        },
        emit: (error) => {
            listeners.forEach((listener) => {
                listener(error);
            });
        },
    };
};

/** The error of a pipe that was closed by its reader. */
const brokenPipe = (): Error => Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });

describe('isBrokenPipe', () => {
    it('recognises a closed pipe', () => {
        expect(isBrokenPipe(brokenPipe())).toBe(true);
    });

    it('recognises a destroyed stream', () => {
        expect(isBrokenPipe(Object.assign(new Error('destroyed'), { code: 'ERR_STREAM_DESTROYED' }))).toBe(true);
    });

    it('rejects every other error', () => {
        expect(isBrokenPipe(new Error('EACCES'))).toBe(false);
        expect(isBrokenPipe(Object.assign(new Error('other'), { code: 'EACCES' }))).toBe(false);
        expect(isBrokenPipe('EPIPE')).toBe(false);
        expect(isBrokenPipe(undefined)).toBe(false);
        expect(isBrokenPipe(null)).toBe(false);
    });
});

describe('ignoreBrokenPipe', () => {
    it('ends the process quietly when the pipe is closed', () => {
        const stream = streamOf();
        let ended = false;

        ignoreBrokenPipe(stream)(() => {
            ended = true;
        });
        stream.emit(brokenPipe());

        expect(ended).toBe(true);
    });

    it('does not hide another error of the stream', () => {
        const stream = streamOf();

        ignoreBrokenPipe(stream)(() => undefined);

        expect(() => stream.emit(new Error('EACCES'))).toThrow('EACCES');
    });
});

describe('flushStream', () => {
    /** A stream with a known number of queued bytes. */
    const flushableOf = (writableLength: number): FlushableStream & { drain: () => void } => {
        const listeners: (() => void)[] = [];

        return {
            destroyed: false,
            writableLength,
            once: (_event, listener) => {
                listeners.push(listener);
            },
            drain: () => {
                listeners.forEach((listener) => {
                    listener();
                });
            },
        };
    };

    it('resolves right away when the stream holds no bytes', async () => {
        await expect(flushStream(flushableOf(0))()).resolves.toBeUndefined();
    });

    it('resolves right away when the stream was closed', async () => {
        const stream = { ...flushableOf(10), destroyed: true };

        await expect(flushStream(stream)()).resolves.toBeUndefined();
    });

    it('waits for the queued bytes to leave the stream', async () => {
        const stream = flushableOf(10);
        let flushed = false;

        const waiting = flushStream(stream)().then(() => {
            flushed = true;
        });

        expect(flushed).toBe(false);

        stream.drain();

        await waiting;

        expect(flushed).toBe(true);
    });
});
