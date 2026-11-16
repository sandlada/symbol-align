import type { LanguageId } from '@sandlada/symbol-align';
import { align, allLanguages, isLanguageId } from '@sandlada/symbol-align';
import { describe, expect, it } from 'vitest';
import indexHtml from '../index.html?raw';
import headers from '../public/_headers?raw';
import notFoundHtml from '../public/404.html?raw';
import manifest from '../public/manifest.webmanifest?raw';
import socialCard from '../public/og.svg?raw';
import robotsTxt from '../public/robots.txt?raw';
import sitemapXml from '../public/sitemap.xml?raw';
import wranglerConfigJsonc from '../../../wrangler.jsonc?raw';

/** The origin the site is published on. */
const origin = 'https://symbol-align.sandlada.com';

/** The canonical URL of the single page. */
const canonicalUrl = `${origin}/`;

/**
 * The Cloudflare deployment configuration, parsed without its `//` comments.
 *
 * The shell, the sitemap and the Worker must name the same origin and the same
 * build output; the SEO tests below fail when one of them drifts.
 */
const workerConfig = JSON.parse(wranglerConfigJsonc.replace(/^\s*\/\/.*$/gm, '')) as {
    assets: { directory: string; not_found_handling: string };
    routes: readonly { pattern: string; custom_domain: boolean }[];
};

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

/** Every JSON-LD block of the page, parsed. */
const structuredData = [...indexHtml.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => JSON.parse(match[1] ?? 'null') as { '@graph'?: readonly Record<string, unknown>[] });

/** The nodes of the structured-data graph, whichever block declares them. */
const graph = structuredData.flatMap((block) => block['@graph'] ?? [block]);

/**
 * A before/after pair documented on the page.
 *
 * The markup is the contract: a `<figure class="recipe">` carries the
 * `data-language` and `data-symbols` of the run, and holds one
 * `data-part="source"` and one `data-part="aligned"` block.
 */
const recipes = [...indexHtml.matchAll(/<figure class="recipe"[^>]*data-language="([a-z]+)"[^>]*data-symbols="([^"]*)"[^>]*>([\s\S]*?)<\/figure>/g)].map((match) => ({
    language: match[1] ?? '',
    symbols: (match[2] ?? '')
        .split(',')
        .map((symbol) => symbol.trim())
        .filter(Boolean),
    body: match[3] ?? '',
}));

/** Decodes the entities a `<pre>` block needs to escape inside HTML. */
const entities: Readonly<Record<string, string>> = {
    '&lt;': '<',
    '&gt;': '>',
    '&amp;': '&',
    '&quot;': '"',
    '&#39;': "'",
};

/** Decodes the handful of HTML entities that appear in a recipe block. */
const unescapeHtml = (text: string): string => text.replace(/&(?:lt|gt|amp|quot|#39);/g, (entity) => entities[entity] ?? entity);

/** The text of one `<pre>` block of a recipe figure. */
const recipeBlock = (body: string, part: 'source' | 'aligned'): string => {
    const match = body.match(new RegExp(`<pre class="recipe-code[^"]*" data-part="${part}"><code>([\\s\\S]*?)</code></pre>`));

    if (match === null) {
        throw new Error(`The recipe figure has no "${part}" block.`);
    }

    return unescapeHtml(match[1] ?? '');
};

/** The language of a recipe, rejected when it is not a core profile. */
const recipeLanguage = (language: string): LanguageId => {
    if (!isLanguageId(language)) {
        throw new Error(`The recipe uses an unknown language: ${language}`);
    }

    return language;
};

/** Reads the `content` that follows a `name`/`property` attribute of a meta tag. */
const contentOf = (attribute: 'name' | 'property', value: string): string | undefined => indexHtml.match(new RegExp(`<meta\\s+${attribute}="${value}"\\s+content="([^"]*)"`))?.[1];

/** Reads the `href` of the first `<link>` with the given `rel`. */
const hrefOf = (rel: string): string | undefined => indexHtml.match(new RegExp(`<link rel="${rel}"[^>]*href="([^"]*)"`))?.[1];

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

    it('keeps third-party resources out of the page', () => {
        const referenced = [...indexHtml.matchAll(/(?:href|src)="(https?:\/\/[^"]*)"/g)].map((match) => match[1]);

        expect(referenced).toEqual([canonicalUrl]);
        expect(indexHtml.toLowerCase()).not.toContain('importmap');
    });

    it('anchors the page to one canonical URL', () => {
        expect(hrefOf('canonical')).toBe(canonicalUrl);
        expect(contentOf('property', 'og:url')).toBe(canonicalUrl);
    });

    it('serves the social image from the canonical origin', () => {
        const ogImage = contentOf('property', 'og:image');
        const twitterImage = contentOf('name', 'twitter:image');

        expect(ogImage).toBe(`${origin}/og.png`);
        expect(twitterImage).toBe(ogImage);
        expect(contentOf('property', 'og:image:secure_url')).toBe(ogImage);
    });

    it('keeps the title and the description inside the search snippet limits', () => {
        const title = indexHtml.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
        const description = contentOf('name', 'description') ?? '';

        expect(title.length).toBeGreaterThan(20);
        expect(title.length).toBeLessThanOrEqual(65);
        expect(description.length).toBeGreaterThanOrEqual(110);
        expect(description.length).toBeLessThanOrEqual(165);
    });

    it('describes the site with a connected structured-data graph', () => {
        const types = graph.map((node) => node['@type']);

        expect(structuredData).not.toHaveLength(0);
        expect(types).toContain('WebSite');
        expect(types).toContain('WebApplication');
        expect(types).toContain('FAQPage');

        for (const node of graph) {
            if (typeof node['@id'] === 'string' && node['@id'].startsWith(origin)) {
                continue;
            }

            throw new Error(`A structured-data node is not identified by the canonical origin: ${JSON.stringify(node['@type'])}`);
        }

        const application = graph.find((node) => node['@type'] === 'WebApplication') ?? {};
        const website = graph.find((node) => node['@type'] === 'WebSite') ?? {};

        expect(application.url).toBe(canonicalUrl);
        expect(application.screenshot).toBe(`${origin}/og.png`);
        expect(website.inLanguage).toBe('en');
    });

    it('declares the questions that the page answers', () => {
        const faq = graph.find((node) => node['@type'] === 'FAQPage') ?? {};
        const questions = (faq.mainEntity as readonly { name: string }[] | undefined) ?? [];
        const summaries = [...indexHtml.matchAll(/<summary>([^<]*)<\/summary>/g)].map((match) => match[1]?.trim() ?? '');

        expect(questions.length).toBeGreaterThan(0);
        expect(questions.map((question) => question.name)).toEqual(summaries);
    });

    it('points robots and crawlers at the sitemap', () => {
        expect(robotsTxt).toContain(`Sitemap: ${origin}/sitemap.xml`);

        const locations = [...sitemapXml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) => match[1]);

        expect(locations).toEqual([canonicalUrl]);
    });

    it('publishes that canonical page from the Worker', () => {
        expect(workerConfig.routes).toEqual([{ pattern: new URL(origin).host, custom_domain: true }]);
        expect(workerConfig.assets.directory).toBe('./packages/site/dist');
        expect(workerConfig.assets.not_found_handling).toBe('404-page');
    });

    it('keeps the manifest consistent with the canonical URL', () => {
        const webManifest = JSON.parse(manifest) as Record<string, unknown>;

        expect(webManifest.name).toBe('Symbol Align');
        expect(webManifest.start_url).toBe('/');
        expect(webManifest.scope).toBe('/');
        expect(hrefOf('manifest')).toBe('/manifest.webmanifest');
    });

    it('serves a noindex 404 page that links home', () => {
        expect(notFoundHtml).toContain('<meta name="robots" content="noindex" />');
        expect(notFoundHtml).toContain('href="/"');
        expect(notFoundHtml).toContain('<h1>');
    });

    it('ships the security and cache headers with the static assets', () => {
        expect(headers).toContain('X-Content-Type-Options: nosniff');
        expect(headers).toContain('/assets/*');
        expect(headers).toContain('Cache-Control: public, max-age=31536000, immutable');
    });

    it('lets the page compile its wasm core under the CSP', () => {
        // The aligner instantiates a wasm module, which a `script-src` without
        // `'wasm-unsafe-eval'` blocks - the page renders but never aligns.
        expect(headers).toContain("script-src 'self' 'wasm-unsafe-eval'");
        expect(headers).not.toContain("'unsafe-eval'");
    });
});

describe('recipe examples', () => {
    it('documents at least one pair', () => {
        expect(recipes.length).toBeGreaterThan(0);
    });

    it('reproduces every documented pair byte for byte', () => {
        for (const recipe of recipes) {
            const source = recipeBlock(recipe.body, 'source');
            const result = align(source)({ language: recipeLanguage(recipe.language), symbols: recipe.symbols });

            expect(result.changes, recipe.language).toBeGreaterThan(0);
            expect(result.code, recipe.language).toBe(recipeBlock(recipe.body, 'aligned'));
        }
    });
});
