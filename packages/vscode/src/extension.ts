/**
 * The VS Code adapter of the extension.
 *
 * Everything that can be tested without an editor lives in `format.ts` and
 * `language.ts` — this module only wires the editor API to that logic.
 */

import type { AlignmentScope, LanguageId } from '@sandlada/symbol-align';
import { isLanguageId } from '@sandlada/symbol-align';
import * as vscode from 'vscode';
import type { FormatResponse } from './format.js';
import { formatText } from './format.js';
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

/** Reads the settings of the extension. */
const readSettings = (): SymbolAlignSettings => {
    const configuration = vscode.workspace.getConfiguration('symbolAlign');

    return {
        enabled: configuration.get<boolean>('enabled', true),
        symbols: configuration.get<string[]>('symbols', []),
        language: configuration.get<string>('language', 'auto'),
        scope: configuration.get<string>('scope', 'block') === 'file' ? 'file' : 'block',
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

/** The range that covers the lines touched by the selection. */
const selectedLines = (editor: vscode.TextEditor): vscode.Range => {
    const { document, selection } = editor;
    const lastLine = selection.end.line;

    return new vscode.Range(new vscode.Position(selection.start.line, 0), new vscode.Position(lastLine, document.lineAt(lastLine).text.length));
};

/** Aligns a text with the settings of the extension. */
const alignText = (text: string, document: vscode.TextDocument, settings: SymbolAlignSettings, language: LanguageId): FormatResponse =>
    formatText({
        text,
        languageId: document.languageId,
        symbols: settings.symbols,
        language,
        scope: settings.scope,
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

/** Aligns the selected lines of the active editor. */
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

    const range = selectedLines(editor);
    const text = document.getText(range);
    const result = alignText(text, document, settings, language);

    if (result.text === text) {
        return;
    }

    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, range, result.text);
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
