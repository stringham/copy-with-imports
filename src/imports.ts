import * as path from 'path';
import * as ts from 'typescript';

import {getTsConfig} from './tsconfig';
import {walk} from './walk';

export interface ImportOptions {
    path: string;
    isImport: boolean;
    end: number;
    node: ts.Node;
    moduleSpecifier?: string;
    namespace?: boolean;
    defaultImport?: boolean;
    originalName?: string;
}

export function getImports(src: string, filePath: string) {
    let file = ts.createSourceFile(filePath, src, ts.ScriptTarget.Latest, true);

    let importNames: {[key: string]: ImportOptions} = {};
    const config = getTsConfig(filePath);
    walk(file, (node) => {
        if (ts.isImportDeclaration(node)) {
            if (ts.isStringLiteral(node.moduleSpecifier)) {
                let specifier = node.moduleSpecifier.text;
                let resolved = resolveImport(specifier, filePath, config);

                if (node.importClause) {
                    if (node.importClause.name) {
                        importNames[node.importClause.name.getText()] = {
                            path: resolved,
                            defaultImport: true,
                            isImport: true,
                            end: node.getEnd(),
                            node: node,
                        };
                    }
                    if (node.importClause.namedBindings) {
                        let bindings = node.importClause.namedBindings;
                        if (ts.isNamedImports(bindings)) {
                            bindings.elements.forEach(a => {
                                importNames[a.name.getText()] = {
                                    path: resolved,
                                    originalName: a.propertyName ? a.propertyName.getText() : undefined,
                                    moduleSpecifier: (node.moduleSpecifier as ts.StringLiteral).text,
                                    isImport: true,
                                    end: node.getEnd(),
                                    node: node,
                                };
                            });
                        } else if (ts.isNamespaceImport(bindings)) {
                            importNames[bindings.name.getText()] = {
                                path: resolved,
                                namespace: true,
                                isImport: true,
                                end: node.getEnd(),
                                node: node,
                            };
                        } else {
                            console.log('unexpected..');
                        }
                    }
                }
            }
        }

        if (node.kind == ts.SyntaxKind.ExportKeyword) {
            const parent = node.parent;

            if (parent) {
                if (ts.isClassDeclaration(parent)) {
                    if (parent.name) {
                        importNames[parent.name.getText()] = {
                            path: filePath,
                            isImport: false,
                            end: -1,
                            node: parent,
                        };
                    }
                } else if (ts.isVariableStatement(parent)) {
                    parent.declarationList.declarations.forEach(declaration => {
                        importNames[declaration.name.getText()] = {
                            path: filePath,
                            isImport: false,
                            end: -1,
                            node: parent,
                        };
                    });
                } else if (ts.isInterfaceDeclaration(parent)) {
                    importNames[parent.name.getText()] = {
                        path: filePath,
                        isImport: false,
                        end: -1,
                        node: parent,
                    };
                } else if (ts.isEnumDeclaration(parent)) {
                    importNames[parent.name.getText()] = {
                        path: filePath,
                        isImport: false,
                        end: -1,
                        node: parent,
                    };
                } else if (ts.isTypeAliasDeclaration(parent)) {
                    importNames[parent.name.getText()] = {
                        path: filePath,
                        isImport: false,
                        end: -1,
                        node: parent,
                    };
                } else if (ts.isModuleDeclaration(parent)) {
                    importNames[parent.name.getText()] = {
                        path: filePath,
                        isImport: false,
                        end: -1,
                        node: parent,
                    };
                } else if (ts.isFunctionDeclaration(parent)) {
                    importNames[parent.name.getText()] = {
                        path: filePath,
                        isImport: false,
                        end: -1,
                        node: parent,
                    };
                }
            }
        }
    });
    return importNames;
}

export function resolveImport(importSpecifier: string, filePath: string, config: any): string {
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