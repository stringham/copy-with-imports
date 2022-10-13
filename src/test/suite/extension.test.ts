import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import {getImports} from '../../imports';
// import * as myExtension from '../../extension';

suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    test('Sample test', () => {
        assert.strictEqual(-1, [1, 2, 3].indexOf(5));
        assert.strictEqual(-1, [1, 2, 3].indexOf(0));
    });

    test('imports', () => {
    vscode.window.showInformationMessage('Start imports tests.');

        const fileContents = `import {foo} from './foo';
import {baz as bar} from './baz';
import {one, two, three as four} from './numbers';
import * as namespaceImport from './namespace';
import defaultImport from './defaultImport';
import nonRelative from '@this/is/not/relative';


export {ReExport} from 'otherfile';
export class MyClass {}

export const myConst = 4;
export let myLet = 3;
export var myVar = 2;
export interface myInterface {}
export enum myEnum {}
export type myType = 4|3|2|1;
export function myFunction() {}
export namespace myModule {}
`;
        const imports = getImports(fileContents, '/this/is/a/file.ts');

        console.log(imports, imports);

        const expectation: Record<string, string> = {
            bar: '/this/is/a/baz.ts',
            defaultImport: '/this/is/a/defaultImport.ts',
            foo: '/this/is/a/foo.ts',
            four: '/this/is/a/numbers.ts',
            MyClass: '/this/is/a/file.ts',
            myConst: '/this/is/a/file.ts',
            myEnum: '/this/is/a/file.ts',
            myFunction: '/this/is/a/file.ts',
            myModule: '/this/is/a/file.ts',
            ReExport: '/this/is/a/file.ts',
            myInterface: '/this/is/a/file.ts',
            myLet: '/this/is/a/file.ts',
            myType: '/this/is/a/file.ts',
            myVar: '/this/is/a/file.ts',
            namespaceImport: '/this/is/a/namespace.ts',
            nonRelative: '@this/is/not/relative',
            one: '/this/is/a/numbers.ts',
            two: '/this/is/a/numbers.ts',
        };

        for(const key in expectation) {
            assert.strictEqual(key in imports, true, key + ' not found');
            assert.strictEqual(imports[key].path, expectation[key]);
        }
    });
});
