import { allLanguages } from '@sandlada/symbol-align-ts';
import { describe, expect, it } from 'vitest';
import indexHtml from '../index.html?raw';
import socialCard from '../public/og.svg?raw';

/** The contents of the static language list. */
const languageIndex = indexHtml.slice(indexHtml.indexOf('<ul class="language-index"'), indexHtml.indexOf('</ul>', indexHtml.indexOf('<ul class="language-index"')));

/** The names shown in the static, crawlable language list. */
const indexedNames = [...languageIndex.matchAll(/<li>([^<]+)<\/li>/g)].map((match) => match[1]?.trim() ?? '');

/** Every language count advertised by the social card. */
const socialCardCounts = [...socialCard.matchAll(/(\d+)\s+language profiles\b/g)].map((match) => Number(match[1]));

/**
 * The visible text of the social card.
 *
 * The attributes of the SVG carry geometry such as `x="56"`, so the stale
 * count is searched in the rendered text nodes instead of the whole file.
 */
const socialCardText = [...socialCard.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((match) => match[1]?.trim() ?? '').join('\n');

describe('SEO shell', () => {
    it('lists every core language exactly once', () => {
        const expected = allLanguages.map((profile) => profile.name);

        expect(indexedNames).toHaveLength(allLanguages.length);
        expect(new Set(indexedNames).size).toBe(allLanguages.length);
        expect([...indexedNames].sort()).toEqual([...expected].sort());
    });

    it('declares the correct language count everywhere it is mentioned', () => {
        const counts = [...indexHtml.matchAll(/(\d+)\s+(?:language profiles|languages|profiles)\b/g)].map((match) => Number(match[1]));

        expect(counts.length).toBeGreaterThan(0);
        expect(new Set(counts)).toEqual(new Set([allLanguages.length]));
    });

    it('advertises the correct language count on the social card', () => {
        expect(socialCardText).toContain('57 language profiles');
        expect(socialCardText).not.toMatch(/\b56\b/);
        expect(socialCardCounts).toEqual([indexedNames.length]);
    });

    it('keeps external links and import maps out of the page', () => {
        expect(indexHtml).not.toMatch(/href\s*=\s*["']https?:/i);
        expect(indexHtml).not.toMatch(/src\s*=\s*["']https?:/i);
        expect(indexHtml.toLowerCase()).not.toContain('importmap');
    });

    it('carries the core discovery metadata', () => {
        expect(indexHtml).toMatch(/<meta\s+name="description"/);
        expect(indexHtml).toContain('property="og:title"');
        expect(indexHtml).toContain('property="og:image"');
        expect(indexHtml).toContain('name="twitter:card"');
        expect(indexHtml).toContain('"@type": "WebApplication"');
        expect(indexHtml).toContain('"@type": "FAQPage"');
    });
});
