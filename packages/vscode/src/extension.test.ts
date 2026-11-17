import { beforeEach, describe, expect, it } from 'vitest';

import { activate } from './extension.js';
import { createDocument, createEditor, Position, Range, reset, state, type FakeDocument } from './testing/vscode.js';

/** The context of the extension — only the subscriptions are used. */
const context = () => ({ subscriptions: [] as { dispose(): void }[] });

/** The lines of the document that the formatter returns. */
const textOf = (edits: readonly { readonly newText: string }[]): string => edits.map((edit) => edit.newText).join('');

beforeEach(() => {
    reset();
});

describe('activate', () => {
    it('registers the document formatter, the range formatter and the commands', () => {
        activate(context() as never);

        expect(state.formatters.document).toBeDefined();
        expect(state.formatters.range).toBeDefined();
        expect([...state.commands.keys()]).toEqual(['symbolAlign.alignDocument', 'symbolAlign.alignSelection']);
    });

    it('registers every resource in the subscriptions of the context', () => {
        const subscriptions = context();

        activate(subscriptions as never);

        expect(subscriptions.subscriptions).toHaveLength(4);
    });
});

describe('the document formatter', () => {
    const document = (text: string, languageId = 'typescript'): FakeDocument => createDocument(text, languageId);

    it('replaces the whole document', () => {
        activate(context() as never);

        const edits = state.formatters.document?.provideDocumentFormattingEdits(document('const a = 1;\nconst bbbb = 22;')) ?? [];

        expect(edits).toHaveLength(1);
        expect(textOf(edits)).toBe('const a    = 1;\nconst bbbb = 22;');
    });

    it('returns no edit when the document is already aligned', () => {
        activate(context() as never);

        const edits = state.formatters.document?.provideDocumentFormattingEdits(document('const a    = 1;\nconst bbbb = 22;')) ?? [];

        expect(edits).toEqual([]);
    });

    it('returns no edit when the formatter is disabled', () => {
        state.values.enabled = false;
        activate(context() as never);

        const edits = state.formatters.document?.provideDocumentFormattingEdits(document('const a = 1;\nconst bbbb = 22;')) ?? [];

        expect(edits).toEqual([]);
    });

    it('returns no edit for a document of an unknown language', () => {
        activate(context() as never);

        const edits = state.formatters.document?.provideDocumentFormattingEdits(document('const a = 1;', 'klingon')) ?? [];

        expect(edits).toEqual([]);
    });

    it('reports a failure of the core and returns no edit', () => {
        activate(context() as never);

        const broken = {
            ...createDocument('const a = 1;'),
            getText: () => {
                throw new Error('the core is gone');
            },
        };
        const edits = state.formatters.document?.provideDocumentFormattingEdits(broken) ?? [];

        expect(edits).toEqual([]);
        expect(state.errors).toEqual(['Symbol Align: the core is gone']);
    });
});

describe('the range formatter', () => {
    it('replaces the lines of the range only', () => {
        activate(context() as never);

        const document = createDocument('const a = 1;\nconst bbbb = 22;\nconst cccccc = 333;');
        const edits = state.formatters.range?.provideDocumentRangeFormattingEdits(document, new Range(new Position(1, 0), new Position(2, 17))) ?? [];

        expect(edits).toHaveLength(1);
        expect(textOf(edits)).toBe('const bbbb   = 22;\nconst cccccc = 333;');
    });

    it('returns no edit when the range is already aligned', () => {
        activate(context() as never);

        const document = createDocument('const a = 1;\nconst bbbb   = 22;\nconst cccccc = 333;');
        const edits = state.formatters.range?.provideDocumentRangeFormattingEdits(document, new Range(new Position(1, 0), new Position(2, 17))) ?? [];

        expect(edits).toEqual([]);
    });
});

describe('the align command', () => {
    it('applies the alignment to the document of the active editor', async () => {
        activate(context() as never);

        const document = createDocument('const a = 1;\nconst bbbb = 22;');
        state.editor = createEditor(document);

        await state.commands.get('symbolAlign.alignDocument')?.();

        expect(state.appliedEdits).toHaveLength(1);
        expect(state.appliedEdits[0].text).toBe('const a    = 1;\nconst bbbb = 22;');
    });

    it('reports an unsupported language', async () => {
        activate(context() as never);

        state.editor = createEditor(createDocument('const a = 1;', 'klingon'));

        await state.commands.get('symbolAlign.alignDocument')?.();

        expect(state.appliedEdits).toEqual([]);
        expect(state.errors).toEqual(['Symbol Align: no language profile for "klingon".']);
    });

    it('reports that there is no active editor', async () => {
        activate(context() as never);

        await state.commands.get('symbolAlign.alignDocument')?.();

        expect(state.errors).toEqual(['Symbol Align: no active editor.']);
    });
});

describe('the selection command', () => {
    it('applies the alignment to the selected lines only', async () => {
        activate(context() as never);

        const document = createDocument('const a = 1;\nconst bbbb = 22;\nconst cccccc = 333;');
        state.editor = createEditor(document, new Position(1, 0), new Position(2, 17));

        await state.commands.get('symbolAlign.alignSelection')?.();

        expect(state.appliedEdits).toHaveLength(1);
        expect(state.appliedEdits[0].text).toBe('const bbbb   = 22;\nconst cccccc = 333;');
    });

    it('does nothing when the selection is empty', async () => {
        activate(context() as never);

        const document = createDocument('const a = 1;\nconst bbbb = 22;');
        state.editor = createEditor(document, new Position(1, 0), new Position(1, 0));

        await state.commands.get('symbolAlign.alignSelection')?.();

        expect(state.appliedEdits).toEqual([]);
    });
});
