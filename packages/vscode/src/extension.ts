/**
 * The VS Code adapter of the extension.
 *
 * Everything that can be tested without an editor lives in `format.ts` and
 * `language.ts` — this module only wires the editor API to that logic.
 */

import type { AlignmentScope, LanguageId, LineRange } from '@sandlada/symbol-align';
import { isLanguageId } from '@sandlada/symbol-align';
import * as vscode from 'vscode';
import type { FormatResponse } from './format.js';
import { formatText, linesOfRange, selectionLineRange } from './format.js';
import { resolveLanguage } from './language.js';

/** The settings of the extension as they are stored in the workspace. */
interface SymbolAlignSettings {
    /** Whether the document is aligned when it is formatted. */
    readonly enabled: boolean;
    /** The symbols to align — an empty list means "use the language defaults". */
    readonly symbols: readonly string[];
    /** The configured language profile — `auto` detects it from the document. */
    readonly language: string;
    /** The grouping strategy. */
    readonly scope: AlignmentScope;
}

/** Every document of the workspace is a candidate for the alignment. */
const documentSelector: vscode.DocumentSelector = [{ scheme: 'file', language: '*' }];

/**
 * Reads the grouping strategy from the configuration.
 *
 * An unknown value falls back to `block`, the default of the core library.
 */
const readScope = (value: string): AlignmentScope => {
    if (value === 'indent' || value === 'file') {
        return value;
    }

    return 'block';
};

/** Reads the settings of the extension. */
const readSettings = (): SymbolAlignSettings => {
    const configuration = vscode.workspace.getConfiguration('symbolAlign');

    return {
        enabled: configuration.get<boolean>('enabled', true),
        symbols: configuration.get<string[]>('symbols', []),
        language: configuration.get<string>('language', 'auto'),
        scope: readScope(configuration.get<string>('scope', 'block')),
    };
};

/**
 * Resolves the language profile that is used for a document.
 *
 * The configured profile wins, the language of the document is only used when
 * the configuration says `auto`.
 */
const resolveTargetLanguage = (configured: string, languageId: string): LanguageId | undefined => {
    if (configured !== 'auto') {
        return isLanguageId(configured) ? configured : undefined;
    }

    return resolveLanguage(languageId);
};

/** The range that covers the whole document. */
const fullRange = (document: vscode.TextDocument): vscode.Range => new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));

/** The range of the editor that covers the lines of a line range. */
const lineRange = (document: vscode.TextDocument, range: LineRange): vscode.Range => {
    const lastLine = Math.min(range.end, document.lineCount) - 1;

    return new vscode.Range(new vscode.Position(range.start, 0), new vscode.Position(lastLine, document.lineAt(lastLine).text.length));
};

/** Aligns a text with the settings of the extension. */
const alignText = (text: string, document: vscode.TextDocument, settings: SymbolAlignSettings, language: LanguageId, range?: LineRange): FormatResponse =>
    formatText({
        text,
        languageId: document.languageId,
        symbols: settings.symbols,
        language,
        scope: settings.scope,
        ...(range === undefined ? {} : { range }),
    });

/** Formats a document by lining its symbols up. */
class SymbolAlignFormattingProvider implements vscode.DocumentFormattingEditProvider {
    provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
        const settings = readSettings();

        if (!settings.enabled) {
            return [];
        }

        const language = resolveTargetLanguage(settings.language, document.languageId);

        if (language === undefined) {
            return [];
        }

        const text = document.getText();
        const result = alignText(text, document, settings, language);

        if (result.text === text) {
            return [];
        }

        return [vscode.TextEdit.replace(fullRange(document), result.text)];
    }
}

/** Shows the message of an unsupported language. */
const reportUnsupportedLanguage = (languageId: string): void => {
    void vscode.window.showErrorMessage(`Symbol Align: no language profile for "${languageId}".`);
};

/** Aligns the whole document of the active editor. */
const alignDocument = async (): Promise<void> => {
    const editor = vscode.window.activeTextEditor;

    if (editor === undefined) {
        void vscode.window.showErrorMessage('Symbol Align: no active editor.');
        return;
    }

    const document = editor.document;
    const settings = readSettings();
    const language = resolveTargetLanguage(settings.language, document.languageId);

    if (language === undefined) {
        reportUnsupportedLanguage(document.languageId);
        return;
    }

    const range = fullRange(document);
    const text = document.getText(range);
    const result = alignText(text, document, settings, language);

    if (result.text === text) {
        return;
    }

    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, range, result.text);
    await vscode.workspace.applyEdit(edit);
};

/**
 * Aligns the selected lines of the active editor.
 *
 * The whole document is aligned — only the selected lines may change — so
 * that a string or a comment that reaches into the selection is recognised.
 */
const alignSelection = async (): Promise<void> => {
    const editor = vscode.window.activeTextEditor;

    if (editor === undefined) {
        void vscode.window.showErrorMessage('Symbol Align: no active editor.');
        return;
    }

    const document = editor.document;
    const settings = readSettings();
    const language = resolveTargetLanguage(settings.language, document.languageId);

    if (language === undefined) {
        reportUnsupportedLanguage(document.languageId);
        return;
    }

    const lines = selectionLineRange(editor.selection);

    if (lines.start >= lines.end) {
        return;
    }

    const text = document.getText();
    const result = alignText(text, document, settings, language, lines);

    if (result.text === text) {
        return;
    }

    const range = lineRange(document, lines);
    const aligned = linesOfRange(result.text, lines);

    if (aligned === document.getText(range)) {
        return;
    }

    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, range, aligned);
    await vscode.workspace.applyEdit(edit);
};

/** Registers the formatter and the commands of the extension. */
export const activate = (context: vscode.ExtensionContext): void => {
    context.subscriptions.push(
        vscode.languages.registerDocumentFormattingEditProvider(documentSelector, new SymbolAlignFormattingProvider()),
        vscode.commands.registerCommand('symbolAlign.alignDocument', alignDocument),
        vscode.commands.registerCommand('symbolAlign.alignSelection', alignSelection),
    );
};

/** Disposes the extension — every resource is registered in the subscriptions. */
export const deactivate = (): void => {
    // Nothing to clean up, the subscriptions of the context own every resource.
};
