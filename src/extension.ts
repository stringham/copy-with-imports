'use strict';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as ts from 'typescript';
import {walk} from './walk';
import {getTsConfig} from './tsconfig';
import {getImports, ImportOptions} from './imports';
import {jsExtensions, tsExtensions, removeExtension, getRelativePath} from './pathresolver';
import {getExtensionConfig} from './config';

function bringInImports(sourceFile: string, editor: vscode.TextEditor, text: string, edit: vscode.TextEditorEdit) {
    let sourceExt = path.extname(sourceFile);
    let destExt = path.extname(editor.document.fileName);
    let bothTs = tsExtensions.has(sourceExt) && tsExtensions.has(destExt);
    let bothJs = jsExtensions.has(sourceExt) && jsExtensions.has(destExt);
    if (!bothTs && !bothJs) {
        return;
    }

    let srcFileText = fs.readFileSync(sourceFile, 'utf8').toString();
    const srcFileImports = getImports(srcFileText, sourceFile);

    let destinationFileText = editor.document.getText();
    const destinationFileImports = getImports(destinationFileText, editor.document.fileName);

    const importsToAdd: {names: string[], options: ImportOptions}[] = [];

    let file = ts.createSourceFile(editor.document.fileName, text, ts.ScriptTarget.Latest, true);
    const keep = new Set<string>()
    walk(file, node => {
        if (ts.isIdentifier(node)) {
            keep.add(node.getText());
        }
    });

    const destinationNameSpaceImports = new Map<string, {names: string[], option: ImportOptions}>();
    for (let importName in destinationFileImports) {
        let option = destinationFileImports[importName];
        if (option.isImport && !(option.defaultImport || option.namespace) && option.moduleSpecifier) {
            if (!destinationNameSpaceImports.has(option.moduleSpecifier)) {
                destinationNameSpaceImports.set(option.moduleSpecifier, {names: [], option: option});
            }
            let name = importName;
            if (option.originalName) {
                name = option.originalName + ' as ' + importName;
            }
            let existing = destinationNameSpaceImports.get(option.moduleSpecifier);
            if (option.end > existing.option.end) {
                existing.names = [];
                existing.option = option;
            }
            existing.names.push(name);
        }
    }

    for (let importName in srcFileImports) {
        if (destinationFileImports.hasOwnProperty(importName)) {
            continue;
        }
        if (keep.has(importName)) {
            let option = srcFileImports[importName];
            if (option.defaultImport || option.namespace) {
                importsToAdd.push({names: [importName], options: srcFileImports[importName]});
            } else {
                const name = (option.originalName ? (option.originalName + ' as ') : '') + importName
                let found = false;
                for (let i = 0; i < importsToAdd.length; i++) {
                    if (importsToAdd[i].options.path == option.path && !importsToAdd[i].options.defaultImport &&
                        !importsToAdd[i].options.namespace) {
                        importsToAdd[i].names.push(name);
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    importsToAdd.push({names: [name], options: option});
                }
            }
        }
    }

    if (importsToAdd.length > 0) {
        let lastImport: vscode.Position = null;
        let lastImportPos = 0;

        for (let importName in destinationFileImports) {
            let info = destinationFileImports[importName];
            if (info.isImport && info.end > lastImportPos) {
                lastImportPos = info.end;
                lastImport = editor.document.positionAt(info.end);
            }
        }

        let importStatements = [];

        let replacements: {range: vscode.Range, value: string}[] = [];

        let spacesBetweenBraces = getExtensionConfig('space-between-braces', false);
        let doubleQuotes = getExtensionConfig('double-quotes', false);

        let optSpace = spacesBetweenBraces ? ' ' : '';
        let quote = doubleQuotes ? '"' : '\'';

        importsToAdd.forEach(i => {
            let statement = 'import ';
            let specifier = removeExtension(getRelativePath(editor.document.fileName, i.options.path));
            if (i.options.namespace) {
                statement += '* as ' + i.names[0];
            } else if (i.options.defaultImport) {
                statement += i.names[0];
            } else {
                if (destinationNameSpaceImports.has(specifier)) {
                    // add to existing imports
                    const existing = destinationNameSpaceImports.get(specifier);
                    const allNames = existing.names.concat(i.names);
                    let range = new vscode.Range(
                        editor.document.positionAt(existing.option.node.getStart()),
                        editor.document.positionAt(existing.option.node.getEnd())
                    )
                    replacements.push({
                        range: range,
                        value:
                            `import {${optSpace}${allNames.join(', ')}${optSpace}} from ${quote}${specifier}${quote};`,
                    });
                    return;
                } else {
                    statement += `{${optSpace}${i.names.join(', ')}${optSpace}}`;
                }
            }

            statement += ` from ${quote}${specifier}${quote};`
            importStatements.push(statement);
        });

        editor.edit(builder => {
            if (importStatements.length > 0) {
                builder.insert(
                    new vscode.Position(lastImport ? lastImport.line + 1 : 0, 0), importStatements.join('\n') + '\n'
                );
            }
            replacements.forEach(r => {
                builder.replace(r.range, r.value);
            });
        }, {undoStopBefore: true, undoStopAfter: true});
    }
}

export function activate(context: vscode.ExtensionContext) {
    let lastSave = {
        text: [''],
        location: '',
    };

    function saveLastCopy(e: vscode.TextEditor) {
        const doc = e.document;

        lastSave.text = e.selections.map(selection => {
            let text = doc.getText(new vscode.Range(selection.start, selection.end));
            if (text.length == 0) {
                // copying the whole line.
                text = doc.lineAt(selection.start.line).text + '\n';
            }
            return text;
        });

        lastSave.location = doc.fileName;
    }

    context.subscriptions
        .push(vscode.commands.registerTextEditorCommand('copy-with-imports.copy', (editor: vscode.TextEditor, edit) => {
            vscode.commands.executeCommand('editor.action.clipboardCopyAction');
            saveLastCopy(vscode.window.activeTextEditor);
        }));

    context.subscriptions
        .push(vscode.commands.registerTextEditorCommand('copy-with-imports.cut', (editor: vscode.TextEditor, edit) => {
            saveLastCopy(vscode.window.activeTextEditor);
            vscode.commands.executeCommand('editor.action.clipboardCutAction');
        }));

    context.subscriptions.push(vscode.commands.registerTextEditorCommand('copy-with-imports.paste', (editor, edit) => {
        let doc = vscode.window.activeTextEditor.document;
        let selections = vscode.window.activeTextEditor.selections.slice().sort((a, b) => a.start.compareTo(b.start));

        vscode.commands.executeCommand('editor.action.clipboardPasteAction').then(() => {
            if (lastSave.location && vscode.window.activeTextEditor.document.fileName != lastSave.location) {
                let shouldBringImports = false;
                if (selections.length == 1 || selections.length != lastSave.text.length) {
                    let selection = selections[0];
                    let pasted =
                        doc.getText(new vscode.Range(selection.start, vscode.window.activeTextEditor.selection.start));
                    // replace whitespace in case of auto formatter.
                    if (pasted.replace(/\s/g, '') == lastSave.text.join('').replace(/\s/g, '')) {
                        shouldBringImports = true;
                    }
                } else {
                    let copied = new Set<string>(lastSave.text.map(text => text.replace(/\s/g, '')));
                    let currentSelections =
                        vscode.window.activeTextEditor.selections.slice().sort((a, b) => a.start.compareTo(b.start));
                    shouldBringImports = true;
                    for (let i = 0; i < selections.length; i++) {
                        let pasted = doc.getText(new vscode.Range(selections[i].start, currentSelections[i].start));
                        if (!copied.has(pasted.replace(/\s/g, ''))) {
                            shouldBringImports = false;
                            break;
                        }
                    }
                }
                if (shouldBringImports) {
                    bringInImports(lastSave.location, vscode.window.activeTextEditor, lastSave.text.join('\n'), edit);
                }
            }
        });
    }))
}

// this method is called when your extension is deactivated
export function deactivate() {
}