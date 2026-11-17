/**
 * The VS Code adapter of the extension.
 *
 * Everything that can be tested without an editor lives in `format.ts`,
 * `edits.ts`, `config.ts`, `settings.ts` and `language.ts` — this module only
 * wires the editor API to that logic.
 */

import { findConfigFile, loadConfigFile } from '@sandlada/symbol-align/node';
import type { AlignOptions, LineRange, SymbolAlignConfig } from '@sandlada/symbol-align';
import { dirname, isAbsolute, relative } from 'node:path';
import * as vscode from 'vscode';
import { resolveOptions, resolveProfile } from './config.js';
import { documentReplacement, rangeReplacement } from './edits.js';
import { selectionLineRange } from './format.js';
import { readSettings, toExplicitSettings, type ExplicitSettings, type SymbolAlignSettings } from './settings.js';

/** Every document of the workspace is a candidate for the alignment. */
const documentSelector: vscode.DocumentSelector = [{ scheme: 'file' }, { scheme: 'untitled' }];

/** Reads the settings of the extension from the workspace configuration. */
const readWorkspaceSettings = (): SymbolAlignSettings => {
    const configuration = vscode.workspace.getConfiguration('symbolAlign');

    return readSettings({
        enabled: configuration.get('enabled'),
        symbols: configuration.get('symbols'),
        groups: configuration.get('groups'),
        language: configuration.get('language'),
        scope: configuration.get('scope'),
        declarations: configuration.get('declarations'),
        declarationAnchor: configuration.get('declarationAnchor'),
        maxDeclarationPad: configuration.get('maxDeclarationPad'),
    });
};

/**
 * Reads the settings that the user set explicitly.
 *
 * A setting that the user did not set must not win over the configuration file
 * of the repository, so only the values of the workspace, of the workspace
 * folder and of the user are taken into account.
 */
const readExplicitSettings = (configuration: vscode.WorkspaceConfiguration): ExplicitSettings => {
    const explicit = <T>(key: string): T | undefined => {
        const info = configuration.inspect<T>(key);

        return info?.workspaceFolderValue ?? info?.workspaceValue ?? info?.globalValue;
    };

    return toExplicitSettings({
        symbols: explicit<string[]>('symbols'),
        groups: explicit<readonly (readonly string[])[]>('groups'),
        language: explicit<string>('language'),
        scope: explicit<string>('scope'),
        declarations: explicit<boolean>('declarations'),
        declarationAnchor: explicit<string>('declarationAnchor'),
        maxDeclarationPad: explicit<number>('maxDeclarationPad'),
    });
};

/**
 * The configuration file that applies to a document.
 *
 * The file is looked up from the directory of the document upwards, but never
 * outside of the workspace folder of the document. A document that is not part
 * of a workspace has no configuration file.
 */
const workspaceConfig = (document: vscode.TextDocument): SymbolAlignConfig | undefined => {
    if (document.uri.scheme !== 'file') {
        return undefined;
    }

    const folder = vscode.workspace.getWorkspaceFolder(document.uri);

    if (folder === undefined) {
        return undefined;
    }

    const path = findConfigFile(dirname(document.uri.fsPath));

    if (path === undefined) {
        return undefined;
    }

    const inside = relative(folder.uri.fsPath, path);

    if (inside.startsWith('..') || isAbsolute(inside)) {
        return undefined;
    }

    return loadConfigFile(path);
};

/** The path of a document — `undefined` for a document that has no file. */
const filePathOf = (document: vscode.TextDocument): string | undefined => (document.uri.scheme === 'file' ? document.uri.fsPath : undefined);

/**
 * The alignment options of a document.
 *
 * The configuration file of the repository is the base, the settings the user
 * set explicitly win over it and the profile of the language completes them.
 */
const resolveDocumentOptions = (document: vscode.TextDocument, configuration: vscode.WorkspaceConfiguration): AlignOptions | undefined => {
    const config = workspaceConfig(document);
    const explicit = readExplicitSettings(configuration);
    const language = resolveProfile(config, explicit, document.languageId);

    if (language === undefined) {
        return undefined;
    }

    return { ...resolveOptions(config, explicit, filePathOf(document)), language };
};

/** Reports a failure of the formatter to the user. */
const reportFailure = (error: unknown): void => {
    const reason = error instanceof Error ? error.message : String(error);

    void vscode.window.showErrorMessage(`Symbol Align: ${reason}`);
};

/** Shows the message of an unsupported language. */
const reportUnsupportedLanguage = (languageId: string): void => {
    void vscode.window.showErrorMessage(`Symbol Align: no language profile for "${languageId}".`);
};

/** Turns a replacement into a text edit. */
const toTextEdit = (document: vscode.TextDocument, replacement: { readonly start: number; readonly end: number; readonly text: string }): vscode.TextEdit =>
    vscode.TextEdit.replace(new vscode.Range(document.positionAt(replacement.start), document.positionAt(replacement.end)), replacement.text);

/** The line range that covers an editor range. */
const rangeLineRange = (range: vscode.Range): LineRange => ({
    start: range.start.line,
    end: range.end.character === 0 && range.end.line > range.start.line ? range.end.line : range.end.line + 1,
});

/**
 * The formatter of the extension.
 *
 * It serves the whole document as well as a range of it, so *Format Document*
 * and *Format Selection* both align the symbols.
 */
class SymbolAlignFormattingProvider implements vscode.DocumentFormattingEditProvider, vscode.DocumentRangeFormattingEditProvider {
    provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
        return this.edits(document);
    }

    provideDocumentRangeFormattingEdits(document: vscode.TextDocument, range: vscode.Range): vscode.TextEdit[] {
        return this.edits(document, rangeLineRange(range));
    }

    /**
     * The edits of a document.
     *
     * A document that is left untouched — an unknown language, a disabled
     * formatter or a failure of the core — produces no edit at all, so the
     * editor never shows an error of its own.
     */
    private edits(document: vscode.TextDocument, range?: LineRange): vscode.TextEdit[] {
        try {
            const configuration = vscode.workspace.getConfiguration('symbolAlign');

            if (!readWorkspaceSettings().enabled) {
                return [];
            }

            const options = resolveDocumentOptions(document, configuration);

            if (options === undefined) {
                return [];
            }

            const replacement = range === undefined ? documentReplacement(document, options) : rangeReplacement(document, options, range);

            if (replacement === undefined) {
                return [];
            }

            return [toTextEdit(document, replacement)];
        } catch (error) {
            reportFailure(error);

            return [];
        }
    }
}

/** Applies a replacement to the document of the active editor. */
const applyReplacement = async (document: vscode.TextDocument, replacement: { readonly start: number; readonly end: number; readonly text: string }): Promise<void> => {
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, new vscode.Range(document.positionAt(replacement.start), document.positionAt(replacement.end)), replacement.text);
    await vscode.workspace.applyEdit(edit);
};

/** Aligns the whole document of the active editor. */
const alignDocument = async (): Promise<void> => {
    const editor = vscode.window.activeTextEditor;

    if (editor === undefined) {
        void vscode.window.showErrorMessage('Symbol Align: no active editor.');
        return;
    }

    const document = editor.document;

    try {
        const configuration = vscode.workspace.getConfiguration('symbolAlign');
        const options = resolveDocumentOptions(document, configuration);

        if (options === undefined) {
            reportUnsupportedLanguage(document.languageId);
            return;
        }

        const replacement = documentReplacement(document, options);

        if (replacement === undefined) {
            return;
        }

        await applyReplacement(document, replacement);
    } catch (error) {
        reportFailure(error);
    }
};

/**
 * Aligns the selected lines of the active editor.
 *
 * The whole document is aligned — only the selected lines may change — so that
 * a string or a comment that reaches into the selection is recognised.
 */
const alignSelection = async (): Promise<void> => {
    const editor = vscode.window.activeTextEditor;

    if (editor === undefined) {
        void vscode.window.showErrorMessage('Symbol Align: no active editor.');
        return;
    }

    const document = editor.document;

    try {
        const configuration = vscode.workspace.getConfiguration('symbolAlign');
        const options = resolveDocumentOptions(document, configuration);

        if (options === undefined) {
            reportUnsupportedLanguage(document.languageId);
            return;
        }

        const lines = selectionLineRange(editor.selection);

        if (lines.start >= lines.end) {
            return;
        }

        const replacement = rangeReplacement(document, options, lines);

        if (replacement === undefined) {
            return;
        }

        await applyReplacement(document, replacement);
    } catch (error) {
        reportFailure(error);
    }
};

/** Registers the formatter and the commands of the extension. */
export const activate = (context: vscode.ExtensionContext): void => {
    const provider = new SymbolAlignFormattingProvider();

    context.subscriptions.push(
        vscode.languages.registerDocumentFormattingEditProvider(documentSelector, provider),
        vscode.languages.registerDocumentRangeFormattingEditProvider(documentSelector, provider),
        vscode.commands.registerCommand('symbolAlign.alignDocument', alignDocument),
        vscode.commands.registerCommand('symbolAlign.alignSelection', alignSelection),
    );
};

/** Disposes the extension — every resource is registered in the subscriptions. */
export const deactivate = (): void => {
    // Nothing to clean up, the subscriptions of the context own every resource.
};
