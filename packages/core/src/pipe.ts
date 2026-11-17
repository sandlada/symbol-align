/**
 * The handling of a closed pipe.
 *
 * A program that writes into a pipe whose reader is gone — `symbol-align
 * file.ts | head` — receives an `EPIPE` error on its standard output. Standard
 * tools end quietly in that case, so the error must not become a stack trace
 * of the CLI.
 *
 * The same module flushes the output before the process ends: a pipe is
 * written asynchronously on Windows, so a process that terminates right after
 * a write loses the tail of its output.
 */

/** The error codes of a stream that was closed by its reader. */
const BROKEN_PIPE_CODES: readonly string[] = ['EPIPE', 'ERR_STREAM_DESTROYED'];

/** Whether `error` reports a pipe that was closed by the reader. */
export const isBrokenPipe = (error: unknown): boolean => {
    if (typeof error !== 'object' || error === null) {
        return false;
    }

    const code = (error as { readonly code?: unknown }).code;

    return typeof code === 'string' && BROKEN_PIPE_CODES.includes(code);
};

/** The part of a writable stream that the handler needs. */
export interface ErrorStream {
    on(event: 'error', listener: (error: unknown) => void): void;
}

/**
 * Ends the process quietly when the reader of a pipe is gone.
 *
 * Every other error is rethrown, so a real failure of the stream is never
 * hidden.
 */
export const ignoreBrokenPipe =
    (stream: ErrorStream) =>
    (onBrokenPipe: () => void): void => {
        stream.on('error', (error) => {
            if (isBrokenPipe(error)) {
                onBrokenPipe();
                return;
            }

            throw error;
        });
    };

/** The part of a writable stream that the flush needs. */
export interface FlushableStream {
    /** Whether the stream was closed. */
    readonly destroyed: boolean;
    /** The number of bytes that are still queued in the stream. */
    readonly writableLength: number;
    /** Waits for the event of the stream. */
    once(event: 'drain', listener: () => void): void;
}

/**
 * Waits until everything that was written to a stream left the process.
 *
 * A pipe is written asynchronously on Windows, so a process that ends right
 * after a write loses the tail of its output. A stream that still holds bytes
 * is drained before the process ends.
 */
export const flushStream = (stream: FlushableStream) => (): Promise<void> =>
    new Promise((resolve) => {
        if (stream.destroyed || stream.writableLength === 0) {
            resolve();
            return;
        }

        stream.once('drain', () => {
            resolve();
        });
    });
