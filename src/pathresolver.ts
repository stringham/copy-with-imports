import * as path from 'path';

import {getExtensionConfig} from './config';
import {getTsConfig} from './tsconfig';

export const tsExtensions = new Set(['.ts', '.tsx']);
export const jsExtensions = new Set(['.js', '.jsx']);

function isPathToAnotherDir(path: string) {
    return path.startsWith('../') || path.startsWith('..\\');
}

function isInDir(dir: string, p: string) {
    let relative = path.relative(dir, p);
    return !isPathToAnotherDir(relative);
}

export function removeExtension(filePath: string): string {
    let ext = path.extname(filePath);
    let extensions = new Set([...tsExtensions, ...jsExtensions]);
    if (ext == '.ts' && filePath.endsWith('.d.ts')) {
        ext = '.d.ts';
    }
    if (extensions.has(ext)) {
        return filePath.slice(0, -ext.length);
    }
    return filePath;
}

export function getRelativePath(fromPath: string, specifier: string): string {
    if (tsExtensions.has(path.extname(fromPath))) {
        const config = getTsConfig(fromPath);
        if (config && config.config && config.config.compilerOptions && config.config.compilerOptions.paths) {
            for (let p in config.config.compilerOptions.paths) {
                if (p.indexOf('*') !== -1) {
                    const mapped = config.config.compilerOptions.paths[p][0].replace('*', '');
                    const mappedDir = path.resolve(path.dirname(config.path), mapped);
                    if (isInDir(mappedDir, specifier)) {
                        return p.replace('*', '') + path.relative(mappedDir, specifier);
                    }
                } else {
                    const mapped = config.config.compilerOptions.paths[p][0];
                    const mappedDir = path.resolve(path.dirname(config.path), mapped);

                    if (mappedDir === specifier) {
                        return p;
                    }
                }
            }
        }
        if (config && config.config && isInDir(path.dirname(config.path), specifier) &&
            getExtensionConfig('path-relative-from-tsconfig', false)) {
            return path.relative(path.dirname(config.path), specifier);
        }
    }

    if (!path.isAbsolute(specifier)) {
        return specifier;
    }

    let relative = path.relative(path.dirname(fromPath), specifier);
    relative = relative.replace(/\\/g, '/');
    if (!relative.startsWith('.')) {
        relative = './' + relative;
    }
    return relative;
}