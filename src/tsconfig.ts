import { promises as fs } from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

export async function getTsConfig(filePath: string) {
    let dir = path.dirname(filePath);
    let lastDir = filePath;
    while (dir != lastDir) {
        const tsConfigPaths = [dir + '/tsconfig.build.json', dir + '/tsconfig.json'];

        let tsConfigPath: string | undefined;
        for (const p of tsConfigPaths) {
            try {
                await fs.stat(p);
                tsConfigPath = p;
                break;
            } catch {
                // File does not exist, continue.
            }
        }

        if (tsConfigPath) {
            const fileContent = await fs.readFile(tsConfigPath, 'utf8');
            const config: any = ts.parseConfigFileTextToJson(tsConfigPath, fileContent);
            config.path = tsConfigPath;
            return config;
        }
        lastDir = dir;
        dir = path.dirname(dir);
    }
    return false;
}
