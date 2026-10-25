import type { AlignGroup, AlignmentScope, AlignResult, DeclarationAnchor, LanguageId } from '@sandlada/symbol-align';
import { align, allLanguages, languageProfile } from '@sandlada/symbol-align';

/** The profile selected when the playground is opened. */
export const DEFAULT_LANGUAGE: LanguageId = 'csharp';

/** The grouping strategy selected when the playground is opened. */
export const DEFAULT_SCOPE: AlignmentScope = 'block';

/** Whether declaration columns are aligned when the playground is opened. */
export const DEFAULT_DECLARATIONS = true;

/** The declaration edge that is aligned when the playground is opened. */
export const DEFAULT_DECLARATION_ANCHOR: DeclarationAnchor = 'start';

/** The declaration pad limit selected when the playground is opened. */
export const DEFAULT_MAX_DECLARATION_PAD = 12;

/** Smallest declaration pad limit the playground accepts. */
const MIN_DECLARATION_PAD = 1;

/** Largest declaration pad limit the playground accepts. */
const MAX_DECLARATION_PAD = 999;

/** A small, language-independent set of symbols that are useful to try. */
const COMMON_SYMBOLS: readonly string[] = ['=', ':', '=>', '->', ':=', '<-', '//', '#', '::', '?'];

/** Longest custom symbol the playground accepts. */
const MAX_SYMBOL_LENGTH = 8;

/** The maximum length of one custom group member. */
export const MAX_GROUP_MEMBER_LENGTH = 64;

/** Languages pinned to the top of the selector. */
const POPULAR_LANGUAGES: readonly LanguageId[] = ['csharp', 'typescript', 'javascript', 'python', 'go', 'rust', 'java', 'kotlin', 'swift', 'cpp', 'sql', 'yaml', 'json', 'css', 'html', 'shell'];

/** One entry of the language selector. */
export interface LanguageOption {
    readonly id: LanguageId;
    readonly name: string;
}

/** A labelled option group of the language selector. */
export interface LanguageGroup {
    readonly label: string;
    readonly options: readonly LanguageOption[];
}

/** The settings that drive one alignment run. */
export interface AlignmentSettings {
    readonly language: LanguageId;
    readonly symbols: readonly string[];
    readonly scope: AlignmentScope;
    readonly declarations: boolean;
    readonly declarationAnchor: DeclarationAnchor;
    readonly maxDeclarationPad: number;
    readonly groups: readonly AlignGroup[];
}

/** The control defaults that are independent of the selected language. */
export const DEFAULT_SETTINGS: Pick<AlignmentSettings, 'declarations' | 'declarationAnchor' | 'maxDeclarationPad' | 'groups'> = {
    declarations: DEFAULT_DECLARATIONS,
    declarationAnchor: DEFAULT_DECLARATION_ANCHOR,
    maxDeclarationPad: DEFAULT_MAX_DECLARATION_PAD,
    groups: [],
};

/** The result of one alignment run together with presentation data. */
export interface AlignmentSnapshot extends AlignResult {
    /** Wall-clock duration of the run in milliseconds. */
    readonly elapsedMs: number;
    /** Number of lines in the input. */
    readonly lineCount: number;
    /** Number of UTF-16 code units in the input. */
    readonly characterCount: number;
}

/** The symbols aligned by default by a language profile. */
export const defaultSymbols = (language: LanguageId): readonly string[] => [...languageProfile(language).defaultSymbols];

/**
 * The symbols offered in the toolbar for a language.
 *
 * The language defaults come first, then the common symbols and finally the
 * custom symbols the user added. Duplicates are removed while order is kept.
 */
export const symbolChoices = (language: LanguageId, custom: readonly string[] = []): readonly string[] => [...new Set([...defaultSymbols(language), ...COMMON_SYMBOLS, ...custom])];

/**
 * Validates and trims a custom symbol.
 *
 * Returns `null` when the value is empty, longer than {@link MAX_SYMBOL_LENGTH}
 * or contains whitespace.
 */
export const normalizeSymbol = (value: string): string | null => {
    const symbol = value.trim();

    if (symbol.length === 0 || symbol.length > MAX_SYMBOL_LENGTH || /\s/.test(symbol)) {
        return null;
    }

    return symbol;
};

/**
 * Parses the custom-group field.
 *
 * Semicolons separate groups and commas separate members. Surrounding
 * whitespace is trimmed and empty members or groups are dropped, so an empty
 * input yields an empty list.
 *
 * Returns `null` when a remaining member is longer than
 * {@link MAX_GROUP_MEMBER_LENGTH} or contains whitespace; the caller keeps the
 * last valid groups and shows the field error.
 */
export const parseGroups = (value: string): readonly AlignGroup[] | null => {
    const groups = value
        .split(';')
        .map((group) =>
            group
                .split(',')
                .map((member) => member.trim())
                .filter((member) => member.length > 0),
        )
        .filter((group) => group.length > 0);

    if (groups.some((group) => group.some((member) => member.length > MAX_GROUP_MEMBER_LENGTH || /\s/.test(member)))) {
        return null;
    }

    return groups;
};

/**
 * Parses the max declaration pad field.
 *
 * Returns the integer when it lies between {@link MIN_DECLARATION_PAD} and
 * {@link MAX_DECLARATION_PAD}; every other value yields `null`, so the caller
 * can fall back to the default and restore the field.
 */
export const parseMaxPad = (value: string): number | null => {
    const trimmed = value.trim();

    if (!/^\d+$/.test(trimmed)) {
        return null;
    }

    const pad = Number(trimmed);

    return pad >= MIN_DECLARATION_PAD && pad <= MAX_DECLARATION_PAD ? pad : null;
};

/** Adds a symbol to the selection or removes it when it is already there. */
export const toggleSymbol = (symbols: readonly string[], symbol: string): readonly string[] => (symbols.includes(symbol) ? symbols.filter((candidate) => candidate !== symbol) : [...symbols, symbol]);

/**
 * Groups every language profile for the selector.
 *
 * The popular group is pinned; every other profile is sorted by display name.
 * Every profile appears exactly once.
 */
export const languageGroups = (): readonly LanguageGroup[] => {
    const profiles = new Map(allLanguages.map((profile) => [profile.id, profile] as const));
    const popular = new Set<LanguageId>(POPULAR_LANGUAGES);

    const popularOptions = POPULAR_LANGUAGES.flatMap((id): readonly LanguageOption[] => {
        const profile = profiles.get(id);

        return profile === undefined ? [] : [{ id, name: profile.name }];
    });

    const moreOptions = allLanguages
        .filter((profile) => !popular.has(profile.id))
        .map((profile): LanguageOption => ({ id: profile.id, name: profile.name }))
        .sort((left, right) => left.name.localeCompare(right.name, 'en'));

    return [
        { label: 'Popular', options: popularOptions },
        { label: 'More languages', options: moreOptions },
    ];
};

/** Aligns a snippet and records how long the run took. */
export const runAlignment = (code: string, settings: AlignmentSettings): AlignmentSnapshot => {
    const startedAt = performance.now();
    const result = align(code)({
        language: settings.language,
        symbols: settings.symbols,
        scope: settings.scope,
        declarations: settings.declarations,
        declarationAnchor: settings.declarationAnchor,
        maxDeclarationPad: settings.maxDeclarationPad,
        groups: settings.groups,
    });

    return {
        ...result,
        elapsedMs: performance.now() - startedAt,
        lineCount: code.split('\n').length,
        characterCount: code.length,
    };
};

/** Formats a run duration for the status bar. */
export const formatDuration = (milliseconds: number): string => {
    if (milliseconds < 1) {
        return '<1 ms';
    }

    if (milliseconds < 10) {
        return `${milliseconds.toFixed(1)} ms`;
    }

    return `${Math.round(milliseconds)} ms`;
};

/** Formats a count with thousands separators. */
export const formatNumber = (value: number): string => value.toLocaleString('en-US');

/** Human readable name of the grouping strategy. */
export const scopeLabel = (scope: AlignmentScope): string => {
    if (scope === 'indent') {
        return 'Indent scope';
    }

    if (scope === 'file') {
        return 'File scope';
    }

    return 'Block scope';
};
