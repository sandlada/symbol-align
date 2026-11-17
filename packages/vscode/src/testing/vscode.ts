/**
 * A fake of the editor API for the unit tests.
 *
 * The extension is the only module of the package that talks to the editor, so
 * it needs a test double to be covered at all. The fake implements the small
 * part of the API that the extension uses and records what the extension does,
 * so a test can assert on the edits and on the notifications.
 *
 * The module is a test double — it is only reachable from the tests and it is
 * never part of the bundle of the extension.
 */

/** A position inside a document. */
export class Position {
    constructor(
        readonly line: number,
        readonly character: number,
    ) {}
}

/** A range inside a document. */
export class Range {
    constructor(
        readonly start: Position,
        readonly end: Position,
    ) {}
}

/** A replacement of a range of a document. */
export interface FakeTextEdit {
    readonly range: Range;
    readonly newText: string;
}

/** The editor API of `vscode.TextEdit`. */
export const TextEdit = {
    replace(range: Range, newText: string): FakeTextEdit {
        return { range, newText };
    },
};

/** One replacement of a workspace edit. */
export interface AppliedEdit {
    readonly uri: unknown;
    readonly range: Range;
    readonly text: string;
}

/** The editor API of `vscode.WorkspaceEdit`. */
export class WorkspaceEdit {
    /** The replacements of the edit. */
    readonly edits: AppliedEdit[] = [];

    replace(uri: unknown, range: Range, text: string): void {
        this.edits.push({ uri, range, text });
    }
}

/** The URI of a document. */
export interface FakeUri {
    readonly scheme: string;
    readonly fsPath: string;
}

/** The part of the document API that the extension uses. */
export interface FakeDocument {
    readonly uri: FakeUri;
    readonly languageId: string;
    getText(): string;
    positionAt(offset: number): Position;
}

/** The part of the editor API that the extension uses. */
export interface FakeEditor {
    readonly document: FakeDocument;
    readonly selection: { readonly start: Position; readonly end: Position };
}

/** The part of the folder API that the extension uses. */
export interface FakeWorkspaceFolder {
    readonly uri: FakeUri;
}

/** The formatter of a document. */
export interface FakeDocumentFormatter {
    provideDocumentFormattingEdits(document: FakeDocument): FakeTextEdit[];
}

/** The formatter of a range of a document. */
export interface FakeRangeFormatter {
    provideDocumentRangeFormattingEdits(document: FakeDocument, range: Range): FakeTextEdit[];
}

/** The state of the fake editor. */
export interface FakeState {
    /** The effective value of every setting — what `get` returns. */
    values: Record<string, unknown>;
    /** The value of every setting that the user set explicitly. */
    explicit: Record<string, unknown>;
    /** The workspace folder of the open documents. */
    workspaceFolder: FakeWorkspaceFolder | undefined;
    /** The active editor. */
    editor: FakeEditor | undefined;
    /** The notifications that were shown. */
    readonly errors: string[];
    /** The edits that were applied to a document. */
    readonly appliedEdits: AppliedEdit[];
    /** The registered formatters. */
    readonly formatters: { document: FakeDocumentFormatter | undefined; range: FakeRangeFormatter | undefined };
    /** The registered commands. */
    readonly commands: Map<string, () => unknown>;
}

/** The state of the fake editor. */
export const state: FakeState = {
    values: {},
    explicit: {},
    workspaceFolder: undefined,
    editor: undefined,
    errors: [],
    appliedEdits: [],
    formatters: { document: undefined, range: undefined },
    commands: new Map(),
};

/** Resets the fake editor to its default state. */
export const reset = (): void => {
    state.values = {};
    state.explicit = {};
    state.workspaceFolder = undefined;
    state.editor = undefined;
    state.errors.length = 0;
    state.appliedEdits.length = 0;
    state.formatters.document = undefined;
    state.formatters.range = undefined;
    state.commands.clear();
};

/**
 * Creates a document.
 *
 * The offset of a position is the number of UTF-16 code units before it, the
 * same rule that the editor uses.
 */
export const createDocument = (text: string, languageId = 'typescript', fsPath = 'E:\\workspace\\document.ts'): FakeDocument => {
    const uri: FakeUri = { scheme: 'file', fsPath };

    return {
        uri,
        languageId,
        getText: () => text,
        positionAt: (offset: number) => {
            const before = text.slice(0, offset);
            const lines = before.split('\n');

            return new Position(lines.length - 1, lines[lines.length - 1]?.length ?? 0);
        },
    };
};

/** Creates an editor with a selection. */
export const createEditor = (document: FakeDocument, start = new Position(0, 0), end = new Position(0, 0)): FakeEditor => ({ document, selection: { start, end } });

/** The fake of the `vscode` module. */
export const workspace = {
    getConfiguration: (_section: string) => ({
        get: (key: string, fallback?: unknown) => state.values[key] ?? fallback,
        inspect: (key: string) => ({ key, defaultValue: undefined, globalValue: state.explicit[key] }),
    }),
    getWorkspaceFolder: (_uri: unknown) => state.workspaceFolder,
    applyEdit: async (edit: WorkspaceEdit): Promise<boolean> => {
        state.appliedEdits.push(...edit.edits);

        return true;
    },
};

/** The fake of the `vscode` module. */
export const window = {
    get activeTextEditor(): FakeEditor | undefined {
        return state.editor;
    },
    showErrorMessage: async (message: string): Promise<undefined> => {
        state.errors.push(message);

        return undefined;
    },
};

/** The fake of the `vscode` module. */
export const languages = {
    registerDocumentFormattingEditProvider: (_selector: unknown, provider: FakeDocumentFormatter) => {
        state.formatters.document = provider;

        return { dispose: () => undefined };
    },
    registerDocumentRangeFormattingEditProvider: (_selector: unknown, provider: FakeRangeFormatter) => {
        state.formatters.range = provider;

        return { dispose: () => undefined };
    },
};

/** The fake of the `vscode` module. */
export const commands = {
    registerCommand: (id: string, callback: () => unknown) => {
        state.commands.set(id, callback);

        return { dispose: () => undefined };
    },
};
