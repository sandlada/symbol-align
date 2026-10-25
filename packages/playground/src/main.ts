import type { AlignmentScope, DeclarationAnchor, LanguageId } from '@sandlada/symbol-align';
import { isLanguageId, languageProfile } from '@sandlada/symbol-align';
import { renderAlignedLines } from './highlight.js';
import type { AlignmentSnapshot } from './model.js';
import {
    DEFAULT_DECLARATION_ANCHOR,
    DEFAULT_DECLARATIONS,
    DEFAULT_LANGUAGE,
    DEFAULT_MAX_DECLARATION_PAD,
    DEFAULT_SCOPE,
    DEFAULT_SETTINGS,
    defaultSymbols,
    formatDuration,
    formatNumber,
    languageGroups,
    normalizeSymbol,
    parseGroups,
    parseMaxPad,
    runAlignment,
    scopeLabel,
    symbolChoices,
    toggleSymbol,
} from './model.js';
import { sampleFor } from './samples.js';
import './styles.css';

/** Looks up a required element and fails loudly when the markup drifts. */
const query = <T extends Element>(selector: string): T => {
    const element = document.querySelector<T>(selector);

    if (element === null) {
        throw new Error(`Missing required element: ${selector}`);
    }

    return element;
};

/** Creates the playground and owns all of its mutable state. */
const createPlayground = (): void => {
    const languageSelect = query<HTMLSelectElement>('#language');
    const scopeInputs = [...document.querySelectorAll<HTMLInputElement>('input[name="scope"]')];
    const declarationsInputs = [...document.querySelectorAll<HTMLInputElement>('input[name="declarations"]')];
    const anchorInputs = [...document.querySelectorAll<HTMLInputElement>('input[name="declaration-anchor"]')];
    const maxPadInput = query<HTMLInputElement>('#max-declaration-pad');
    const groupsInput = query<HTMLInputElement>('#groups');
    const groupsError = query<HTMLParagraphElement>('#groups-error');
    const loadExample = query<HTMLButtonElement>('#load-example');
    const copyOutput = query<HTMLButtonElement>('#copy-output');
    const copyLabel = copyOutput.querySelector<HTMLSpanElement>('span');

    if (copyLabel === null) {
        throw new Error('The copy button is missing its label.');
    }

    const symbolsContainer = query<HTMLFieldSetElement>('#symbols');
    const customForm = query<HTMLFormElement>('#custom-symbol-form');
    const customInput = query<HTMLInputElement>('#custom-symbol');
    const customError = query<HTMLParagraphElement>('#custom-symbol-error');
    const source = query<HTMLTextAreaElement>('#source');
    const output = query<HTMLPreElement>('#output');
    const sourceGutter = query<HTMLDivElement>('#source-gutter');
    const outputGutter = query<HTMLDivElement>('#output-gutter');
    const sourceMeta = query<HTMLParagraphElement>('#source-meta');
    const sourceTag = query<HTMLSpanElement>('#source-tag');
    const changeTag = query<HTMLSpanElement>('#change-tag');
    const statusDot = query<HTMLSpanElement>('#status-dot');
    const statusMessage = query<HTMLSpanElement>('#status-message');
    const statusMetrics = query<HTMLParagraphElement>('#status-metrics');
    const statusContext = query<HTMLParagraphElement>('#status-context');
    const liveRegion = query<HTMLParagraphElement>('#live-region');
    const workspace = query<HTMLDivElement>('#workspace');
    const splitter = query<HTMLHRElement>('#splitter');

    let language: LanguageId = DEFAULT_LANGUAGE;
    let scope: AlignmentScope = DEFAULT_SCOPE;
    let symbols: readonly string[] = defaultSymbols(language);
    let customSymbols: readonly string[] = [];
    let declarations: boolean = DEFAULT_SETTINGS.declarations;
    let declarationAnchor: DeclarationAnchor = DEFAULT_SETTINGS.declarationAnchor;
    let maxDeclarationPad: number = DEFAULT_SETTINGS.maxDeclarationPad;
    let groups: readonly (readonly string[])[] = DEFAULT_SETTINGS.groups;
    let usingSample = true;
    let splitPercent = 50;
    let pendingFrame = 0;
    let announcementTimer = 0;
    let copyResetTimer = 0;
    let latest: AlignmentSnapshot = { code: '', changes: 0, elapsedMs: 0, lineCount: 1, characterCount: 0 };

    /** Pluralises a simple English count. */
    const plural = (count: number, singular: string): string => (count === 1 ? singular : `${singular}s`);

    /** Announces a message to assistive technology without interrupting every keystroke. */
    const announce = (message: string, delay: number): void => {
        window.clearTimeout(announcementTimer);
        announcementTimer = window.setTimeout(() => {
            liveRegion.textContent = message;
        }, delay);
    };

    /** Fills the language selector from the core profile table. */
    const populateLanguages = (): void => {
        const fragment = document.createDocumentFragment();

        for (const group of languageGroups()) {
            const optgroup = document.createElement('optgroup');
            optgroup.label = group.label;

            for (const option of group.options) {
                const element = document.createElement('option');
                element.value = option.id;
                element.textContent = option.name;
                element.selected = option.id === language;
                optgroup.append(element);
            }

            fragment.append(optgroup);
        }

        languageSelect.replaceChildren(fragment);
        languageSelect.value = language;
    };

    /** Rebuilds the symbol chips, keeping the current selection. */
    const renderSymbols = (): void => {
        const fragment = document.createDocumentFragment();

        for (const symbol of symbolChoices(language, customSymbols)) {
            const label = document.createElement('label');
            label.className = 'symbol';

            const input = document.createElement('input');
            input.type = 'checkbox';
            input.value = symbol;
            input.checked = symbols.includes(symbol);
            input.setAttribute('aria-label', `Align ${symbol}`);
            input.addEventListener('change', () => {
                symbols = toggleSymbol(symbols, symbol);
                scheduleRender();
                announce(`${symbol} ${symbols.includes(symbol) ? 'enabled' : 'disabled'}.`, 200);
            });

            const text = document.createElement('span');
            text.textContent = symbol;

            label.append(input, text);
            fragment.append(label);
        }

        symbolsContainer.replaceChildren(fragment);
    };

    /** Renders the line numbers of one pane. */
    const renderGutter = (container: HTMLDivElement, lineCount: number, changed: ReadonlySet<number> = new Set()): void => {
        const fragment = document.createDocumentFragment();

        for (let index = 0; index < lineCount; index += 1) {
            const line = document.createElement('span');
            line.className = changed.has(index) ? 'gutter-line gutter-line-changed' : 'gutter-line';
            line.textContent = String(index + 1);
            fragment.append(line);
        }

        container.replaceChildren(fragment);
    };

    /** Shows or hides the custom-symbol validation message. */
    const setCustomError = (visible: boolean): void => {
        customError.hidden = !visible;

        if (visible) {
            customInput.setAttribute('aria-invalid', 'true');
            customInput.setAttribute('aria-errormessage', 'custom-symbol-error');
        } else {
            customInput.removeAttribute('aria-invalid');
            customInput.removeAttribute('aria-errormessage');
        }
    };

    /** Shows or hides the custom-group validation message. */
    const setGroupsError = (visible: boolean): void => {
        groupsError.hidden = !visible;

        if (visible) {
            groupsInput.setAttribute('aria-invalid', 'true');
            groupsInput.setAttribute('aria-errormessage', 'groups-error');
        } else {
            groupsInput.removeAttribute('aria-invalid');
            groupsInput.removeAttribute('aria-errormessage');
        }
    };

    /** Reports an unexpected alignment failure in the status bar. */
    const reportFailure = (error: unknown): void => {
        const message = error instanceof Error ? error.message : String(error);

        statusDot.dataset.state = 'error';
        statusMessage.textContent = 'Alignment failed';
        statusMetrics.textContent = message;
        statusContext.textContent = '';
        announce(`Alignment failed: ${message}`, 0);
    };

    /** Paints the current state of the editor and the status bar. */
    const render = (): AlignmentSnapshot => {
        const code = source.value;

        declarations = readDeclarations();
        declarationAnchor = readDeclarationAnchor();
        maxDeclarationPad = parseMaxPad(maxPadInput.value) ?? maxDeclarationPad;

        const parsedGroups = parseGroups(groupsInput.value);
        setGroupsError(parsedGroups === null);

        if (parsedGroups !== null) {
            groups = parsedGroups;
        }

        let snapshot: AlignmentSnapshot;

        try {
            snapshot = runAlignment(code, { language, symbols, scope, declarations, declarationAnchor, maxDeclarationPad, groups });
        } catch (error) {
            reportFailure(error);
            return latest;
        }

        latest = snapshot;

        const rendered = renderAlignedLines(code, snapshot.code);
        const changed = new Set<number>();
        rendered.forEach((line, index) => {
            if (line.changed) {
                changed.add(index);
            }
        });

        const sourceLineCount = code.split('\n').length;
        const profile = languageProfile(language);
        const outputHtml = rendered.map((line) => line.html).join('\n');

        output.innerHTML = outputHtml;

        renderGutter(sourceGutter, sourceLineCount);
        renderGutter(outputGutter, rendered.length, changed);

        sourceMeta.textContent = `${formatNumber(sourceLineCount)} ${plural(sourceLineCount, 'line')} · ${formatNumber(snapshot.characterCount)} ${plural(snapshot.characterCount, 'character')}`;
        sourceTag.textContent = profile.name;

        if (code.length === 0) {
            changeTag.textContent = 'Waiting';
        } else if (snapshot.changes === 0) {
            changeTag.textContent = symbols.length === 0 && groups.length === 0 ? 'No symbols' : 'No changes';
        } else {
            changeTag.textContent = `${formatNumber(snapshot.changes)} ${plural(snapshot.changes, 'line')}`;
        }

        changeTag.classList.toggle('pane-tag-accent', snapshot.changes > 0);

        if (code.length === 0) {
            statusMessage.textContent = 'Paste a snippet to begin';
            statusDot.dataset.state = 'idle';
        } else if (symbols.length === 0 && groups.length === 0) {
            statusMessage.textContent = 'No symbols selected';
            statusDot.dataset.state = 'idle';
        } else if (snapshot.changes === 0) {
            statusMessage.textContent = 'Already aligned';
            statusDot.dataset.state = 'ready';
        } else {
            statusMessage.textContent = `${formatNumber(snapshot.changes)} ${plural(snapshot.changes, 'line')} updated`;
            statusDot.dataset.state = 'changed';
        }

        statusMetrics.textContent = `${formatDuration(snapshot.elapsedMs)} · ${formatNumber(snapshot.lineCount)} ${plural(snapshot.lineCount, 'line')} · ${formatNumber(snapshot.characterCount)} ${plural(snapshot.characterCount, 'character')}`;
        statusContext.textContent = `${profile.name} · ${scopeLabel(scope)} · ${formatNumber(symbols.length)} ${plural(symbols.length, 'symbol')}`;

        sourceGutter.scrollTop = source.scrollTop;
        outputGutter.scrollTop = output.scrollTop;

        announce(`${statusMessage.textContent}. ${statusContext.textContent}.`, 700);

        return snapshot;
    };

    /** Coalesces rapid input into one render per animation frame. */
    const scheduleRender = (): void => {
        if (pendingFrame !== 0) {
            return;
        }

        pendingFrame = window.requestAnimationFrame(() => {
            pendingFrame = 0;
            render();
        });
    };

    /** Cancels a pending frame and paints immediately. */
    const renderNow = (): AlignmentSnapshot => {
        if (pendingFrame !== 0) {
            window.cancelAnimationFrame(pendingFrame);
            pendingFrame = 0;
        }

        return render();
    };

    /** Reads the grouping strategy from the segmented control. */
    const readScope = (): AlignmentScope => {
        const selected = scopeInputs.find((input) => input.checked);
        const value = selected?.value;

        return value === 'indent' || value === 'file' ? value : 'block';
    };

    /** Reads whether the declaration columns are aligned from the segmented control. */
    const readDeclarations = (): boolean => {
        const selected = declarationsInputs.find((input) => input.checked)?.value;

        return selected === undefined ? DEFAULT_DECLARATIONS : selected === 'true';
    };

    /** Reads the declaration cell edge from the segmented control. */
    const readDeclarationAnchor = (): DeclarationAnchor => {
        const selected = anchorInputs.find((input) => input.checked)?.value;

        return selected === 'end' ? 'end' : DEFAULT_DECLARATION_ANCHOR;
    };

    /** Switches the language profile and loads its sample when the editor is pristine. */
    const changeLanguage = (value: string): void => {
        if (!isLanguageId(value)) {
            return;
        }

        language = value;
        symbols = defaultSymbols(language);
        customSymbols = [];

        if (usingSample) {
            source.value = sampleFor(language);
        }

        renderSymbols();
        scheduleRender();
        announce(`Language changed to ${languageProfile(language).name}.`, 300);
    };

    /** Copies text with a synchronous fallback for non-secure contexts. */
    const copyText = async (text: string): Promise<void> => {
        if (window.isSecureContext && navigator.clipboard !== undefined) {
            try {
                await navigator.clipboard.writeText(text);
                return;
            } catch {
                // Fall through to the selection based fallback.
            }
        }

        const helper = document.createElement('textarea');
        helper.value = text;
        helper.setAttribute('readonly', '');
        helper.setAttribute('aria-hidden', 'true');
        helper.tabIndex = -1;
        helper.style.position = 'fixed';
        helper.style.top = '0';
        helper.style.left = '0';
        helper.style.opacity = '0';
        document.body.append(helper);
        helper.select();

        const copied = document.execCommand('copy');
        helper.remove();

        if (!copied) {
            throw new Error('The clipboard is not available.');
        }
    };

    /** Shows the success state of the copy button for a moment. */
    const flashCopied = (): void => {
        window.clearTimeout(copyResetTimer);
        copyLabel.textContent = 'Copied';
        copyOutput.classList.add('is-copied');

        copyResetTimer = window.setTimeout(() => {
            copyLabel.textContent = 'Copy output';
            copyOutput.classList.remove('is-copied');
        }, 1600);
    };

    /** Updates the share of the source pane. */
    const setSplit = (value: number): void => {
        splitPercent = Math.min(75, Math.max(25, value));
        workspace.style.setProperty('--split', `${splitPercent}%`);
        splitter.setAttribute('aria-valuenow', String(Math.round(splitPercent)));
    };

    /** Loads the starter snippet of the current language. */
    const loadCurrentExample = (): void => {
        source.value = sampleFor(language);
        usingSample = true;
        symbols = defaultSymbols(language);
        customSymbols = [];
        renderSymbols();
        renderNow();
        source.focus();
        announce(`Loaded the ${languageProfile(language).name} example.`, 0);
    };

    /** Wires every control of the playground. */
    const bindEvents = (): void => {
        source.addEventListener('input', () => {
            usingSample = false;
            scheduleRender();
        });

        languageSelect.addEventListener('change', () => {
            changeLanguage(languageSelect.value);
        });

        for (const input of scopeInputs) {
            input.addEventListener('change', () => {
                if (!input.checked) {
                    return;
                }

                scope = readScope();
                scheduleRender();
                announce(`Scope changed to ${scopeLabel(scope)}.`, 200);
            });
        }

        for (const input of declarationsInputs) {
            input.addEventListener('change', () => {
                if (!input.checked) {
                    return;
                }

                declarations = readDeclarations();
                scheduleRender();
                announce(`Declaration alignment ${declarations ? 'enabled' : 'disabled'}.`, 200);
            });
        }

        for (const input of anchorInputs) {
            input.addEventListener('change', () => {
                if (!input.checked) {
                    return;
                }

                declarationAnchor = readDeclarationAnchor();
                scheduleRender();
                announce(`Declaration anchor set to ${declarationAnchor}.`, 200);
            });
        }

        maxPadInput.addEventListener('input', () => {
            maxDeclarationPad = parseMaxPad(maxPadInput.value) ?? maxDeclarationPad;
            scheduleRender();
        });

        maxPadInput.addEventListener('change', () => {
            const parsed = parseMaxPad(maxPadInput.value);

            if (parsed === null) {
                maxPadInput.value = String(DEFAULT_MAX_DECLARATION_PAD);
                maxDeclarationPad = DEFAULT_MAX_DECLARATION_PAD;
                announce(`Max pad restored to ${DEFAULT_MAX_DECLARATION_PAD}.`, 0);
            } else {
                maxDeclarationPad = parsed;
            }

            scheduleRender();
        });

        groupsInput.addEventListener('input', () => {
            const parsed = parseGroups(groupsInput.value);

            setGroupsError(parsed === null);

            if (parsed !== null) {
                groups = parsed;
            }

            scheduleRender();
        });

        groupsInput.addEventListener('change', () => {
            if (parseGroups(groupsInput.value) === null) {
                announce('Custom groups use one to sixty-four characters without spaces. Separate groups with semicolons and members with commas.', 0);
            }
        });

        loadExample.addEventListener('click', loadCurrentExample);

        customForm.addEventListener('submit', (event) => {
            event.preventDefault();

            const symbol = normalizeSymbol(customInput.value);

            if (symbol === null) {
                setCustomError(true);
                customInput.focus();
                announce('That symbol is not valid. Use one to eight characters without spaces.', 0);
                return;
            }

            setCustomError(false);

            if (!symbolChoices(language, customSymbols).includes(symbol)) {
                customSymbols = [...customSymbols, symbol];
            }

            if (!symbols.includes(symbol)) {
                symbols = [...symbols, symbol];
            }

            customInput.value = '';
            renderSymbols();
            scheduleRender();
            announce(`Added ${symbol}.`, 250);
        });

        customInput.addEventListener('input', () => {
            if (customInput.value.trim().length > 0) {
                setCustomError(false);
            }
        });

        copyOutput.addEventListener('click', () => {
            const snapshot = renderNow();

            if (snapshot.code.length === 0) {
                announce('There is nothing to copy yet.', 0);
                source.focus();
                return;
            }

            void copyText(snapshot.code)
                .then(() => {
                    flashCopied();
                    announce('Aligned output copied to the clipboard.', 0);
                })
                .catch(() => {
                    const selection = window.getSelection();
                    const range = document.createRange();

                    range.selectNodeContents(output);
                    selection?.removeAllRanges();
                    selection?.addRange(range);
                    output.focus();
                    announce('Copy failed. The output is selected — press Control+C or Command+C.', 0);
                });
        });

        source.addEventListener(
            'scroll',
            () => {
                sourceGutter.scrollTop = source.scrollTop;
            },
            { passive: true },
        );

        output.addEventListener(
            'scroll',
            () => {
                outputGutter.scrollTop = output.scrollTop;
            },
            { passive: true },
        );

        splitter.addEventListener('pointerdown', (event) => {
            if (event.button !== 0) {
                return;
            }

            splitter.setPointerCapture(event.pointerId);
            document.body.classList.add('is-resizing');
            event.preventDefault();
        });

        splitter.addEventListener('pointermove', (event) => {
            if (!splitter.hasPointerCapture(event.pointerId)) {
                return;
            }

            const bounds = workspace.getBoundingClientRect();

            if (bounds.width > 0) {
                setSplit(((event.clientX - bounds.left) / bounds.width) * 100);
            }
        });

        const endResize = (event: PointerEvent): void => {
            if (splitter.hasPointerCapture(event.pointerId)) {
                splitter.releasePointerCapture(event.pointerId);
            }

            document.body.classList.remove('is-resizing');
        };

        splitter.addEventListener('pointerup', endResize);
        splitter.addEventListener('pointercancel', endResize);

        splitter.addEventListener('keydown', (event) => {
            let next = splitPercent;

            if (event.key === 'ArrowLeft') {
                next -= 4;
            } else if (event.key === 'ArrowRight') {
                next += 4;
            } else if (event.key === 'Home') {
                next = 25;
            } else if (event.key === 'End') {
                next = 75;
            } else {
                return;
            }

            event.preventDefault();
            setSplit(next);
        });
    };

    /** Boots the playground. */
    const start = (): void => {
        populateLanguages();
        source.value = sampleFor(language);
        renderSymbols();
        setSplit(50);
        bindEvents();
        render();
    };

    start();
};

createPlayground();
