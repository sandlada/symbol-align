/**
 * Declaration locator for `@sandlada/symbol-align-ts`.
 *
 * The locator turns one line of code into the visual cells of a declaration:
 *
 *     private const string Product = "value";
 *     └ modifiers ─┘ └type─┘ └name─┘
 *
 *     (int, string) pair;
 *     └────type───┘ └name┘
 *
 * It never parses a language grammar. It only tokenises the first code region
 * of the line, tracks bracket and generic nesting and rejects anything that is
 * not a plain declaration. A line with two possible readings — a member access,
 * a statement, a construct with a missing type — is reported as `null`; the
 * aligner then simply leaves it alone.
 *
 * The heuristics are deliberately conservative:
 *
 * - a leading `(...)` group is a type only when it is balanced and closes
 *   before the name, so a statement that happens to start with parentheses is
 *   not mistaken for a tuple type;
 * - `<` opens a generic argument list only when a matching `>` exists in the
 *   region, so `a<b` and `a < b` stay comparisons;
 * - a type span that mixes punctuation with `*`, `&` or `?` has to be
 *   credible (a builtin word, an uppercase word, a modifier run or a
 *   qualifier) before the line is accepted, so `a * b;` and `a && b;` stay
 *   statements.
 */

import type { CodeRegion, DeclarationCell, DeclarationOptions } from './types.js';
import { BUILTIN_TYPES, DECLARATION_KEYWORDS, MODIFIERS, NON_NAMES, STATEMENT_KEYWORDS } from './vocabulary.js';

/** A word or a single punctuation character of the code region. */
interface Token {
    readonly kind: 'word' | 'punct';
    /** Inclusive column of the first character. */
    readonly start: number;
    /** Exclusive column behind the last character. */
    readonly end: number;
    /** The token text — a word or one punctuation character. */
    readonly text: string;
}

/** The nesting depth before a token. */
interface Depth {
    readonly round: number;
    readonly square: number;
    readonly curly: number;
    readonly angle: number;
}

/** The generic brackets of a line: the `<` that open a list and the `>` that close one. */
interface GenericBrackets {
    readonly opens: ReadonlySet<number>;
    readonly closes: ReadonlySet<number>;
}

/** The punctuation shape of a candidate type span. */
interface TypeShape {
    /** The first word of the span, or `null` when it holds no word at all. */
    readonly firstWord: Token | null;
    /** Whether the span contains a pointer, reference or nullable marker. */
    readonly hasMarker: boolean;
    /** Whether the span contains a qualifier or a bracketed/generic group. */
    readonly hasQualifier: boolean;
}

/** Characters that turn a neighbouring `=` into a longer operator. */
const OPERATOR_CHARACTERS = '=!<>+-*/%&|^?';

/**
 * Punctuation that ends the declarator at nesting depth zero.
 *
 * `:` is deliberately absent: `std::string name;` and
 * `std::tuple<int, int> t;` carry a qualifier in front of the name, and a C++
 * bitfield is not worth losing every qualified type over.
 */
const TAIL_PUNCTUATION: ReadonlySet<string> = new Set([';', ',', '(', '{']);

/** Punctuation that may appear inside a declaration type. */
const TYPE_PUNCTUATION: ReadonlySet<string> = new Set(['(', ')', '[', ']', '*', '&', '?', ',', '.']);

/** Whether the first character of a word is an uppercase letter. */
const UPPERCASE_START = /^\p{Lu}/u;

/** How many tokens a generic bracket search may look ahead or behind. */
const MAX_GENERIC_SCAN = 128;

/** Whether `character` can build a word token. */
const isWordCharacter = (character: string): boolean => /[A-Za-z0-9_$]/.test(character) || (character > '~' && character.trim().length > 0);

/** Whether `character` is whitespace. */
const isBlankCharacter = (character: string): boolean => character.trim().length === 0;

/** Number of leading whitespace characters of a line. */
const indentOf = (line: string): number => line.length - line.trimStart().length;

/** Splits the region into word and punctuation tokens. */
const tokenize = (line: string, from: number, to: number): readonly Token[] => {
    const tokens: Token[] = [];
    let index = from;

    while (index < to) {
        const character = line[index];

        if (isBlankCharacter(character)) {
            index += 1;
            continue;
        }

        const start = index;

        if (isWordCharacter(character)) {
            while (index < to && isWordCharacter(line[index])) {
                index += 1;
            }
            tokens.push({ kind: 'word', start, end: index, text: line.slice(start, index) });
            continue;
        }

        index += 1;
        tokens.push({ kind: 'punct', start, end: index, text: character });
    }

    return tokens;
};

/** Whether `<` at `index` can open a generic argument list. */
const opensGeneric = (tokens: readonly Token[], index: number): boolean => {
    const token = tokens[index];
    const previous = tokens[index - 1];

    if (token.kind !== 'punct' || token.text !== '<' || previous === undefined || previous.end !== token.start) {
        return false;
    }

    return previous.kind === 'word' || previous.text === '>';
};

/** Whether a generic list opened at `openIndex` is closed later in the region. */
const hasMatchingClose = (tokens: readonly Token[], openIndex: number): boolean => {
    let balance = 1;
    const limit = Math.min(tokens.length, openIndex + MAX_GENERIC_SCAN);

    for (let index = openIndex + 1; index < limit; index += 1) {
        const token = tokens[index];

        if (token.text === '>') {
            balance -= 1;
            if (balance === 0) {
                return true;
            }
            continue;
        }

        if (opensGeneric(tokens, index)) {
            balance += 1;
        }
    }

    return false;
};

/** Index of the `<` that matches the `>` at `closeIndex`, or `null`. */
const matchingOpen = (tokens: readonly Token[], closeIndex: number): number | null => {
    let balance = 1;
    const limit = Math.max(0, closeIndex - MAX_GENERIC_SCAN);

    for (let index = closeIndex - 1; index >= limit; index -= 1) {
        const token = tokens[index];

        if (token.text === '>') {
            balance += 1;
            continue;
        }

        if (opensGeneric(tokens, index)) {
            balance -= 1;
            if (balance === 0) {
                return index;
            }
        }
    }

    return null;
};

/**
 * Collects the generic brackets of a line.
 *
 * A `<` only opens a generic list when a matching `>` exists in the region;
 * every other `<` is an operator, never a type bracket.
 */
const genericBrackets = (tokens: readonly Token[]): GenericBrackets => {
    const opens = new Set<number>();
    const closes = new Set<number>();

    tokens.forEach((token, index) => {
        if (token.kind === 'punct' && token.text === '<' && opensGeneric(tokens, index) && hasMatchingClose(tokens, index)) {
            opens.add(index);
        }
    });

    tokens.forEach((token, index) => {
        if (token.kind !== 'punct' || token.text !== '>') {
            return;
        }

        const open = matchingOpen(tokens, index);

        if (open !== null && opens.has(open)) {
            closes.add(index);
        }
    });

    return { opens, closes };
};

/** Computes the nesting depth before every token. */
const depthBefore = (tokens: readonly Token[], brackets: GenericBrackets): readonly Depth[] => {
    const depths: Depth[] = [];
    let round = 0;
    let square = 0;
    let curly = 0;
    let angle = 0;

    tokens.forEach((token, index) => {
        depths.push({ round, square, curly, angle });

        if (token.kind !== 'punct') {
            return;
        }

        switch (token.text) {
            case '(':
                round += 1;
                break;
            case ')':
                round = Math.max(0, round - 1);
                break;
            case '[':
                square += 1;
                break;
            case ']':
                square = Math.max(0, square - 1);
                break;
            case '{':
                curly += 1;
                break;
            case '}':
                curly = Math.max(0, curly - 1);
                break;
            case '<':
                if (brackets.opens.has(index)) {
                    angle += 1;
                }
                break;
            case '>':
                if (brackets.closes.has(index)) {
                    angle = Math.max(0, angle - 1);
                }
                break;
        }
    });

    return depths;
};

/** Whether the token at `index` sits at the outermost nesting level. */
const isOutermost = (depths: readonly Depth[], index: number): boolean => {
    const depth = depths[index];

    return depth !== undefined && depth.round === 0 && depth.square === 0 && depth.curly === 0 && depth.angle === 0;
};

/** Index of the `)` that closes a `(` at index 0, or `null` when it never closes. */
const leadingGroupClose = (tokens: readonly Token[]): number | null => {
    let balance = 0;

    for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];

        if (token.text === '(') {
            balance += 1;
            continue;
        }

        if (token.text === ')') {
            balance -= 1;
            if (balance === 0) {
                return index;
            }
        }
    }

    return null;
};

/** Whether the `=` at `token` belongs to a longer operator inside the region. */
const isOperatorFragment = (line: string, token: Token, from: number, to: number): boolean => {
    const before = token.start > from ? line[token.start - 1] : '';
    const after = token.end < to ? line[token.end] : '';

    return OPERATOR_CHARACTERS.includes(before) || OPERATOR_CHARACTERS.includes(after);
};

/** Index of the first declarator-terminating token at depth zero, or `null`. */
const findTail = (tokens: readonly Token[], depths: readonly Depth[], line: string, from: number, to: number, first: number): number | null => {
    for (let index = first; index < tokens.length; index += 1) {
        const token = tokens[index];

        if (token.kind !== 'punct' || !isOutermost(depths, index)) {
            continue;
        }

        if (token.text === '=') {
            const next = tokens[index + 1];

            if (next !== undefined && next.text === '>' && next.start === token.end) {
                return index;
            }

            if (!isOperatorFragment(line, token, from, to)) {
                return index;
            }
            continue;
        }

        if (TAIL_PUNCTUATION.has(token.text)) {
            return index;
        }
    }

    return null;
};

/** Index of the last word before `before` at depth zero, or `null`. */
const lastWordBefore = (tokens: readonly Token[], depths: readonly Depth[], before: number): number | null => {
    for (let index = before - 1; index >= 0; index -= 1) {
        if (tokens[index].kind === 'word' && isOutermost(depths, index)) {
            return index;
        }
    }

    return null;
};

/** Index of the name word of a declaration, or `null` when it is ambiguous. */
const findNameIndex = (tokens: readonly Token[], depths: readonly Depth[], tail: number): number | null => {
    const beforeTail = tokens[tail - 1];

    // A tail directly behind `>` closes a generic list of the name itself
    // (`GetAsync<T>()`); the name is the word in front of that `<`.
    if (beforeTail !== undefined && beforeTail.text === '>') {
        const open = matchingOpen(tokens, tail - 1);

        if (open === null) {
            return null;
        }

        return lastWordBefore(tokens, depths, open);
    }

    return lastWordBefore(tokens, depths, tail);
};

/** Whether the tokens before the name mark a member access. */
const isMemberAccess = (tokens: readonly Token[], nameIndex: number): boolean => {
    const previous = tokens[nameIndex - 1];

    if (previous === undefined || previous.kind !== 'punct') {
        return false;
    }

    if (previous.text === '.') {
        return true;
    }

    const beforePrevious = tokens[nameIndex - 2];

    if (beforePrevious === undefined) {
        return false;
    }

    return (previous.text === ':' && beforePrevious.text === ':') || (previous.text === '>' && beforePrevious.text === '-');
};

/**
 * Index where the name cell starts, including a C/C++ pointer or reference.
 *
 * A marker only belongs to the name when it touches it: `char *name` declares
 * a pointer, while `a * b` multiplies two values.
 */
const nameCellIndex = (tokens: readonly Token[], nameIndex: number): number => {
    let cell = nameIndex;

    for (let index = nameIndex - 1; index >= 0; index -= 1) {
        const token = tokens[index];
        const next = tokens[index + 1];

        if (token.kind !== 'punct' || next.start !== token.end) {
            break;
        }

        if (token.text === '*' || token.text === '^' || token.text === '?') {
            cell = index;
            continue;
        }

        if (token.text === '&') {
            const before = tokens[index - 1];

            if (before !== undefined && before.text === '&' && before.end === token.start) {
                cell = index - 1;
                index -= 1;
                continue;
            }

            cell = index;
            continue;
        }

        break;
    }

    return cell;
};

/** Whether the `:` at `index` is half of a `::` qualifier. */
const isQualifierColon = (tokens: readonly Token[], index: number): boolean => {
    const token = tokens[index];
    const previous = tokens[index - 1];
    const next = tokens[index + 1];

    return (previous !== undefined && previous.text === ':' && previous.end === token.start) || (next !== undefined && next.text === ':' && next.start === token.end);
};

/** Whether the token at `index` is valid punctuation of a type span. */
const isTypePunctuation = (tokens: readonly Token[], index: number, brackets: GenericBrackets): boolean => {
    const token = tokens[index];

    if (token.kind === 'word') {
        return true;
    }

    if (token.text === ':') {
        return isQualifierColon(tokens, index);
    }

    if (token.text === '<') {
        return brackets.opens.has(index);
    }

    if (token.text === '>') {
        return brackets.closes.has(index);
    }

    return TYPE_PUNCTUATION.has(token.text);
};

/**
 * Validates the punctuation of a type span and records its shape.
 *
 * A span that carries a marker (`*`, `&`, `?`) also has to be *credible*: a
 * builtin type word, an uppercase word, a modifier run or a qualifier in front
 * of the marker. Without that rule `a * b;` reads as a pointer declaration.
 */
const typeShape = (tokens: readonly Token[], from: number, to: number, brackets: GenericBrackets): TypeShape | null => {
    if (from < 0 || to < from) {
        return null;
    }

    let firstWord: Token | null = null;
    let hasMarker = false;
    let hasQualifier = false;

    for (let index = from; index <= to; index += 1) {
        const token = tokens[index];

        if (!isTypePunctuation(tokens, index, brackets)) {
            return null;
        }

        if (token.kind === 'word') {
            if (firstWord === null) {
                firstWord = token;
            }
            continue;
        }

        if (token.text === '*' || token.text === '&' || token.text === '?') {
            hasMarker = true;
        }

        if (token.text === '(' || token.text === '[' || token.text === '<' || (token.text === ':' && isQualifierColon(tokens, index))) {
            hasQualifier = true;
        }
    }

    return { firstWord, hasMarker, hasQualifier };
};

/** Whether a type span with a marker still looks like a declaration type. */
const isCredibleType = (shape: TypeShape, hasModifiers: boolean): boolean => {
    if (!shape.hasMarker) {
        return true;
    }

    if (shape.firstWord !== null && (BUILTIN_TYPES.has(shape.firstWord.text) || UPPERCASE_START.test(shape.firstWord.text))) {
        return true;
    }

    return hasModifiers || shape.hasQualifier;
};

/** Builds the cells of a prefix declaration (`public int value`). */
const prefixCells = (tokens: readonly Token[], nameIndex: number, nameCell: number, nameStart: number, brackets: GenericBrackets): readonly DeclarationCell[] | null => {
    let modifierCount = 0;

    while (modifierCount < nameIndex && tokens[modifierCount].kind === 'word' && MODIFIERS.has(tokens[modifierCount].text)) {
        modifierCount += 1;
    }

    const typeToken = tokens[modifierCount];

    if (typeToken === undefined || typeToken.start >= nameStart || DECLARATION_KEYWORDS.has(typeToken.text)) {
        return null;
    }

    const shape = typeShape(tokens, modifierCount, nameCell - 1, brackets);

    if (shape === null || !isCredibleType(shape, modifierCount > 0)) {
        return null;
    }

    const nameEnd = tokens[nameIndex].end;
    const typeCell: DeclarationCell = { kind: 'type', start: typeToken.start, end: tokens[nameCell - 1].end };
    const nameCellShape: DeclarationCell = { kind: 'name', start: nameStart, end: nameEnd };

    if (modifierCount === 0) {
        return [typeCell, nameCellShape];
    }

    return [{ kind: 'modifiers', start: tokens[0].start, end: tokens[modifierCount - 1].end }, typeCell, nameCellShape];
};

/** Builds the cells of a type-first declaration (`uint256 public value`). */
const typeFirstCells = (tokens: readonly Token[], nameIndex: number, nameCell: number, nameStart: number, brackets: GenericBrackets): readonly DeclarationCell[] | null => {
    let modifierStart = nameCell;

    while (modifierStart > 0 && tokens[modifierStart - 1].kind === 'word' && MODIFIERS.has(tokens[modifierStart - 1].text)) {
        modifierStart -= 1;
    }

    if (modifierStart === 0) {
        return null;
    }

    const typeToken = tokens[0];

    if (typeToken.start >= nameStart) {
        return null;
    }

    const typeEnd = modifierStart === nameCell ? nameCell - 1 : modifierStart - 1;
    const shape = typeShape(tokens, 0, typeEnd, brackets);

    if (shape === null || !isCredibleType(shape, modifierStart !== nameCell)) {
        return null;
    }

    const nameEnd = tokens[nameIndex].end;
    const nameCellShape: DeclarationCell = { kind: 'name', start: nameStart, end: nameEnd };

    if (modifierStart === nameCell) {
        return [{ kind: 'type', start: typeToken.start, end: tokens[nameCell - 1].end }, nameCellShape];
    }

    return [{ kind: 'type', start: typeToken.start, end: tokens[modifierStart - 1].end }, { kind: 'modifiers', start: tokens[modifierStart].start, end: tokens[nameCell - 1].end }, nameCellShape];
};

/**
 * Locates the declaration cells of a line.
 *
 * @param line - The line of code to inspect.
 * @returns A function that takes the code regions and the declaration style
 * and returns the cells in visual order, or `null` when the line is not an
 * unambiguous declaration.
 */
export const findDeclarationCells =
    (line: string) =>
    (options: DeclarationOptions): readonly DeclarationCell[] | null => {
        if (options.style === 'none') {
            return null;
        }

        const region: CodeRegion | undefined = options.regions[0];
        const indent = indentOf(line);

        // The scanner folds the leading whitespace into the first code region;
        // a region that starts behind the indentation means a string or a
        // comment comes first, which is never a declaration.
        if (region === undefined || region.start > indent || region.end <= indent) {
            return null;
        }

        const end = Math.min(region.end, line.length);
        const tokens = tokenize(line, indent, end);
        const first = tokens[0];

        if (first === undefined) {
            return null;
        }

        // A leading `(...)` group may start a tuple type (`(int, string) pair`);
        // anything else has to be a word.
        const opensGroup = first.kind === 'punct' && first.text === '(';

        if (!opensGroup && (first.kind !== 'word' || STATEMENT_KEYWORDS.has(first.text))) {
            return null;
        }

        if (opensGroup && leadingGroupClose(tokens) === null) {
            return null;
        }

        const brackets = genericBrackets(tokens);
        const depths = depthBefore(tokens, brackets);
        const tail = findTail(tokens, depths, line, indent, end, opensGroup ? 1 : 0);

        if (tail === null) {
            return null;
        }

        const nameIndex = findNameIndex(tokens, depths, tail);

        if (nameIndex === null || isMemberAccess(tokens, nameIndex)) {
            return null;
        }

        const name = tokens[nameIndex].text;

        if (NON_NAMES.has(name) || DECLARATION_KEYWORDS.has(name)) {
            return null;
        }

        const nameCell = nameCellIndex(tokens, nameIndex);
        const nameStart = tokens[nameCell].start;

        return options.style === 'prefix' ? prefixCells(tokens, nameIndex, nameCell, nameStart, brackets) : typeFirstCells(tokens, nameIndex, nameCell, nameStart, brackets);
    };
