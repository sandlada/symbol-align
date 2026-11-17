/**
 * The pure edit computation of the extension.
 *
 * The module never imports `vscode`: it works on the small part of the
 * document API that the formatter needs, so the decision *what* changes can be
 * unit tested without an editor.
 */

import type { AlignOptions, LineRange } from '@sandlada/symbol-align';

import { formatText } from './format.js';

/** The part of the VS Code document API that the formatter needs. */
export interface FormattableDocument {
    /** The VS Code language id of the document, e.g. `typescript`. */
    readonly languageId: string;
    /** The whole text of the document. */
    getText(): string;
}

/** A replacement of a part of a document. */
export interface TextReplacement {
    /** The offset of the first replaced character. */
    readonly start: number;
    /** The offset behind the last replaced character. */
    readonly end: number;
    /** The text that replaces the range. */
    readonly text: string;
}

/** The offsets of one line inside a text. */
interface LineSpan {
    /** The offset of the first character of the line. */
    readonly start: number;
    /** The offset behind the last character of the line. */
    readonly end: number;
}

/**
 * The offsets of every line of a text.
 *
 * The lines are split at the line feed, so a line that ends with a carriage
 * return keeps it — the carriage return belongs to the line break and stays
 * inside the range that replaces the line.
 */
const lineSpans = (text: string): readonly LineSpan[] => {
    const spans: LineSpan[] = [];
    let offset = 0;

    for (const line of text.split('\n')) {
        spans.push({ start: offset, end: offset + line.length });
        offset += line.length + 1;
    }

    return spans;
};

/** Builds the request of the core library. */
const request = (document: FormattableDocument, options: AlignOptions, range?: LineRange) => ({
    text: document.getText(),
    languageId: document.languageId,
    ...options,
    ...(range === undefined ? {} : { range }),
});

/**
 * Aligns a whole document.
 *
 * Returns `undefined` when the document is already aligned.
 */
export const documentReplacement = (document: FormattableDocument, options: AlignOptions): TextReplacement | undefined => {
    const text = document.getText();
    const result = formatText(request(document, options));

    if (result.text === text) {
        return undefined;
    }

    return { start: 0, end: text.length, text: result.text };
};

/**
 * Aligns the lines of a range.
 *
 * The whole document is aligned — only the lines of the range may change — so
 * that a string or a comment that reaches into the range is recognised.
 *
 * Returns `undefined` when the lines of the range are already aligned.
 */
export const rangeReplacement = (document: FormattableDocument, options: AlignOptions, range: LineRange): TextReplacement | undefined => {
    const text = document.getText();
    const result = formatText(request(document, options, range));

    if (result.text === text) {
        return undefined;
    }

    const spans = lineSpans(text);
    const first = spans[range.start];
    const last = spans[Math.min(range.end, spans.length) - 1];

    if (first === undefined || last === undefined) {
        return undefined;
    }

    const aligned = result.text.split('\n').slice(range.start, range.end).join('\n');

    if (aligned === text.slice(first.start, last.end)) {
        return undefined;
    }

    return { start: first.start, end: last.end, text: aligned };
};
