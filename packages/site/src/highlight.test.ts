import { describe, expect, it } from 'vitest';
import { escapeHtml, renderAlignedLines } from './highlight.js';

describe('escapeHtml', () => {
    it('escapes every HTML metacharacter', () => {
        expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
    });

    it('leaves ordinary code untouched', () => {
        expect(escapeHtml('const value = 1;')).toBe('const value = 1;');
    });
});

describe('renderAlignedLines', () => {
    it('does not mark lines that did not change', () => {
        const [line] = renderAlignedLines('a = 1', 'a = 1');

        expect(line).toEqual({ changed: false, html: 'a = 1' });
    });

    it('marks the inserted spaces of a changed line', () => {
        const [line] = renderAlignedLines('a = 1', 'a    = 1');

        expect(line?.changed).toBe(true);
        expect(line?.html).toBe('a <mark class="pad">   </mark>= 1');
    });

    it('highlights each changed line independently', () => {
        const lines = renderAlignedLines('a = 1\nb = 2', 'a   = 1\nb   = 2');

        expect(lines).toHaveLength(2);
        expect(lines.every((line) => line.changed)).toBe(true);
        expect(lines[0]?.html).toBe('a <mark class="pad">  </mark>= 1');
    });

    it('escapes source and aligned content', () => {
        const [line] = renderAlignedLines('<img = 1', '<img    = 1');

        expect(line?.html).toBe('&lt;img <mark class="pad">   </mark>= 1');
        expect(line?.html).not.toContain('<img');
    });

    it('keeps trailing newlines as an empty final line', () => {
        const lines = renderAlignedLines('a = 1\n', 'a   = 1\n');

        expect(lines).toHaveLength(2);
        expect(lines[1]).toEqual({ changed: false, html: '' });
    });
});
