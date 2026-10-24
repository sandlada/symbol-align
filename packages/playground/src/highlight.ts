/**
 * Safe rendering of the aligned output.
 *
 * The core only ever inserts spaces, so a changed line can be diffed by
 * removing the common prefix and suffix. The inserted gap is wrapped in a
 * `<mark>` so the playground can show exactly what changed without shipping a
 * syntax highlighter or a diffing dependency.
 */

/** A line of the aligned output, ready to be rendered. */
export interface RenderedLine {
    /** Whether the line differs from the corresponding source line. */
    readonly changed: boolean;
    /** HTML with the inserted spaces wrapped in a highlight element. */
    readonly html: string;
}

const HTML_ESCAPES: Readonly<Record<string, string>> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};

/** Escapes text so it can be assigned to `innerHTML` safely. */
export const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character);

/** Length of the common prefix of two strings. */
const prefixLength = (left: string, right: string): number => {
    const limit = Math.min(left.length, right.length);
    let index = 0;

    while (index < limit && left[index] === right[index]) {
        index += 1;
    }

    return index;
};

/** Length of the common suffix of two strings, never overlapping the prefix. */
const suffixLength = (left: string, right: string, prefix: number): number => {
    const limit = Math.min(left.length, right.length) - prefix;
    let index = 0;

    while (index < limit && left[left.length - 1 - index] === right[right.length - 1 - index]) {
        index += 1;
    }

    return index;
};

/** Renders one aligned line and highlights the inserted spaces. */
const renderLine = (source: string | undefined, aligned: string): RenderedLine => {
    if (source === undefined) {
        return { changed: true, html: escapeHtml(aligned) };
    }

    if (source === aligned) {
        return { changed: false, html: escapeHtml(aligned) };
    }

    const prefix = prefixLength(source, aligned);
    const suffix = suffixLength(source, aligned, prefix);
    const inserted = aligned.slice(prefix, aligned.length - suffix);

    const highlighted = inserted.length === 0 ? escapeHtml(aligned) : `${escapeHtml(aligned.slice(0, prefix))}<mark class="pad">${escapeHtml(inserted)}</mark>${escapeHtml(aligned.slice(aligned.length - suffix))}`;

    return { changed: true, html: highlighted };
};

/** Renders every line of the aligned output. */
export const renderAlignedLines = (source: string, aligned: string): readonly RenderedLine[] => {
    const sourceLines = source.split('\n');

    return aligned.split('\n').map((line, index) => renderLine(sourceLines[index], line));
};
