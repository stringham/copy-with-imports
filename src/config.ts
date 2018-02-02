import * as vscode from 'vscode';

export function getExtensionConfig<T>(property: string, defaultValue: T) {
    return vscode.workspace.getConfiguration('copy-with-imports').get<T>(property, defaultValue);
}