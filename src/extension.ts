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
    if(!sourceFile.endsWith('.ts') && !sourceFile.endsWith('.tsx')) {
        return;
    }
    if(!editor.document.fileName.endsWith('.ts') && !editor.document.fileName.endsWith('.tsx')) {
        return;
    }
    let srcFileText = fs.readFileSync(sourceFile, 'utf8').toString();
    const srcFileImports = getImports(srcFileText, sourceFile);

    let destinationFileText = editor.document.getText();
    const destinationFileImports = getImports(destinationFileText, editor.document.fileName);

    const importsToAdd: {name: string, options: ImportOptions}[] = [];

    for (let importName in srcFileImports) {
        if (destinationFileImports.hasOwnProperty(importName)) {
            continue;
        }
        if (text.indexOf(importName) >= 0) {
            importsToAdd.push({name: importName, options: srcFileImports[importName]});
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
            let statement = 'import';
            if (i.options.namespace) {
                statement += ' * as ' + i.name;
            } else if (i.options.defaultImport) {
                statement += ' ' + i.name;
            } else {
                statement += '{' + i.name + '}'
            }

            statement += ' from \'' + removeExtension(getRelativePath(editor.document.fileName, i.options.path)) + '\';'
            importStatements.push(statement);
        });

        editor.edit(builder => {
            builder.insert(new vscode.Position(lastImport ? lastImport.line + 1 : 0, 0), importStatements.join('\n'));
        }, {undoStopBefore: true, undoStopAfter: true});
    }
}

export function activate(context: vscode.ExtensionContext) {
    let lastSave = {
        text: '',
        location: '',
    };

    function saveLastCopy(e: vscode.TextEditor) {
        const doc = e.document;
        const selection = e.selection;
        let text = doc.getText(new vscode.Range(selection.start, selection.end));

        if (text.length == 0) {
            // copying the whole line.
            text = doc.lineAt(selection.start.line).text + '\n';
        }

        lastSave.text = text;
        lastSave.location = doc.fileName;
    }

    context.subscriptions
        .push(vscode.commands.registerTextEditorCommand('copy-with-imports.copy', (editor: vscode.TextEditor, edit) => {
            vscode.commands.executeCommand('editor.action.clipboardCopyAction');
            saveLastCopy(vscode.window.activeTextEditor);
        }));

    context.subscriptions.push(vscode.commands.registerTextEditorCommand('copy-with-imports.paste', (editor, edit) => {
        let doc = vscode.window.activeTextEditor.document;
        let selection = vscode.window.activeTextEditor.selection;

        vscode.commands.executeCommand('editor.action.clipboardPasteAction').then(() => {
            if (lastSave.location && vscode.window.activeTextEditor.document.fileName != lastSave.location) {
                let pasted =
                    doc.getText(new vscode.Range(selection.start, vscode.window.activeTextEditor.selection.start));
                if (pasted == lastSave.text) {
                    bringInImports(lastSave.location, vscode.window.activeTextEditor, pasted, edit)
                }
            }
        });

    }))
}

// this method is called when your extension is deactivated
export function deactivate() {
}