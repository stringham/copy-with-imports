'use strict';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as ts from 'typescript';
import {walk} from './walk';

interface ImportOptions {
    path: string;
    namespace?: boolean;
    defaultImport?: boolean;
    originalName?: string;
}
const configs: {[key: string]: any} = {};

function getImports(src: string, filePath: string) {
    let file = ts.createSourceFile(filePath, src, ts.ScriptTarget.Latest, true);

    let importNames: {[key: string]: ImportOptions} = {};
    const config = getTsConfig(filePath);
    walk(file, (node) => {
        if (node.kind == ts.SyntaxKind.ImportDeclaration) {
            let i = node as ts.ImportDeclaration;
            let specifier = (i.moduleSpecifier as ts.StringLiteral).text;

            let resolved = resolveImport(specifier, filePath, config);

            if (i.importClause) {
                if (i.importClause.name) {
                    importNames[i.importClause.name.getText()] = {path: resolved, defaultImport: true};
                }
                if (i.importClause.namedBindings) {
                    let bindings = i.importClause.namedBindings;
                    if (bindings.kind == ts.SyntaxKind.NamedImports) {
                        let namedImports = bindings as ts.NamedImports;
                        namedImports.elements.forEach(a => {
                            importNames[a.name.getText()] = {
                                path: resolved,
                                originalName: a.propertyName ? a.propertyName.getText() : undefined,
                            };
                        });
                    } else if (bindings.kind == ts.SyntaxKind.NamespaceImport) {
                        importNames[(bindings as ts.NamespaceImport).name.getText()] = {
                            path: resolved,
                            namespace: true
                        };
                    } else {
                        console.log('unexpected..');
                    }
                }
            }
        }
    });
    return importNames;
}

function getTsConfig(filePath: string) {
    for (let key in configs) {
        if (!path.relative(path.dirname(key), filePath).startsWith('..')) {
            return configs[key];
        }
    }
    let dir = path.dirname(filePath);
    while (dir != '/') {
        let tsConfigPath = dir + '/tsconfig.json';
        if (fs.existsSync(tsConfigPath)) {
            configs[tsConfigPath] =
                ts.parseConfigFileTextToJson(tsConfigPath, fs.readFileSync(tsConfigPath).toString());
            configs[tsConfigPath].path = tsConfigPath;
            return configs[tsConfigPath];
        }
        dir = path.dirname(dir);
    }
    return false;
}

function resolveImport(importSpecifier: string, filePath: string, config: any): string {
    if (importSpecifier.startsWith('.')) {
        return path.resolve(path.dirname(filePath), importSpecifier) + '.ts';
    }
    if (config.config.compilerOptions && config.config.compilerOptions.paths) {
        for (let p in config.config.compilerOptions.paths) {
            if (p.endsWith('*') && importSpecifier.startsWith(p.replace('*', ''))) {
                if (config.config.compilerOptions.paths[p].length == 1) {
                    let mapped = config.config.compilerOptions.paths[p][0].replace('*', '');
                    let mappedDir = path.resolve(path.dirname(config.path), mapped);
                    return mappedDir + '/' + importSpecifier.substr(p.replace('*', '').length) + '.ts';
                }
            }
        }
    }
    return importSpecifier;
}

function isPathToAnotherDir(path: string) {
    return path.startsWith('../') || path.startsWith('..\\');
}

function isInDir(dir: string, p: string) {
    let relative = path.relative(dir, p);
    return !isPathToAnotherDir(relative);
}

function removeExtension(filePath: string): string {
    let ext = path.extname(filePath);
    let extensions = ['.ts', '.tsx'];
    if (ext == '.ts' && filePath.endsWith('.d.ts')) {
        ext = '.d.ts';
    }
    if (extensions.indexOf(ext) >= 0) {
        return filePath.slice(0, -ext.length);
    }
    return filePath;
}

function getRelativePath(fromPath: string, specifier: string): string {
    const config = getTsConfig(fromPath);
    if (config && config.config && config.config.compilerOptions && config.config.compilerOptions.paths) {
        for (let p in config.config.compilerOptions.paths) {
            if (config.config.compilerOptions.paths[p].length == 1) {
                let mapped = config.config.compilerOptions.paths[p][0].replace('*', '');
                let mappedDir = path.resolve(path.dirname(config.path), mapped);
                if (isInDir(mappedDir, specifier)) {
                    return p.replace('*', '') + path.relative(mappedDir, specifier);
                }
            }
        }
    }

    if (!specifier.startsWith('/')) {
        return specifier;
    }

    let relative = path.relative(path.dirname(fromPath), specifier);
    relative = relative.replace(/\\/g, '/');
    if (!relative.startsWith('.')) {
        relative = './' + relative;
    }
    return relative;
}

function bringInImports(sourceFile: string, editor: vscode.TextEditor, text: string, edit: vscode.TextEditorEdit) {
    if (!sourceFile.endsWith('.ts') && !sourceFile.endsWith('.tsx')) {
        return;
    }
    if (!editor.document.fileName.endsWith('.ts') && !editor.document.fileName.endsWith('.tsx')) {
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
        if (node.kind == ts.SyntaxKind.Identifier) {
            keep.add(node.getText());
        }
    });


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
        console.log('need to add imports...');
        var importRegExp = /\bimport\s+(?:({?)\s*(.+?)\s*}?\s+from\s+)?[\'"]([^"\']+)["\']\s*;?/g;
        var lastImport: vscode.Position = null;
        var matches: string[];
        var lastImport: vscode.Position = null;

        let edit: vscode.WorkspaceEdit;

        while (matches = importRegExp.exec(destinationFileText)) {
            lastImport = editor.document.positionAt(destinationFileText.indexOf(matches[0]));
        }

        let importStatements = [];

        importsToAdd.forEach(i => {
            let statement = 'import ';
            if (i.options.namespace) {
                statement += '* as ' + i.names[0];
            } else if (i.options.defaultImport) {
                statement += i.names[0];
            } else {
                statement += '{' + i.names.join(', ') + '}';
            }

            statement += ' from \'' + removeExtension(getRelativePath(editor.document.fileName, i.options.path)) + '\';'
            importStatements.push(statement);
        });

        editor.edit(builder => {
            builder.insert(new vscode.Position(lastImport ? lastImport.line + 1 : 0, 0), importStatements.join('\n') + '\n');
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
        let selections = vscode.window.activeTextEditor.selections.slice().sort((a,b) => a.start.compareTo(b.start));

        vscode.commands.executeCommand('editor.action.clipboardPasteAction').then(() => {
            if (lastSave.location && vscode.window.activeTextEditor.document.fileName != lastSave.location) {
                let shouldBringImports = false;
                if(selections.length == 1 || selections.length != lastSave.text.length) {
                    let selection = selections[0];
                    let pasted =
                        doc.getText(new vscode.Range(selection.start, vscode.window.activeTextEditor.selection.start));
                    // replace whitespace in case of auto formatter.
                    if (pasted.replace(/\s/g, '') == lastSave.text.join('').replace(/\s/g, '')) {
                        shouldBringImports = true;
                    }
                } else {
                    let copied = new Set<string>(lastSave.text.map(text => text.replace(/\s/g,'')));
                    let currentSelections = vscode.window.activeTextEditor.selections.slice().sort((a,b) => a.start.compareTo(b.start));
                    shouldBringImports = true;
                    for(let i=0; i<selections.length; i++) {
                        let pasted =
                        doc.getText(new vscode.Range(selections[i].start, currentSelections[i].start));
                        if(!copied.has(pasted.replace(/\s/g,''))) {
                            shouldBringImports = false;
                            break;
                        }
                    }
                }
                if(shouldBringImports) {
                    bringInImports(lastSave.location, vscode.window.activeTextEditor, lastSave.text.join('\n'), edit);
                }
            }
        });
    }))
}

// this method is called when your extension is deactivated
export function deactivate() {
}