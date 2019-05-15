import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

export function getTsConfig(filePath: string) {
    let dir = path.dirname(filePath);
    let prevDir = filePath;
    while (dir != filePath) {
        const tsConfigPaths = [dir + '/tsconfig.build.json', dir + '/tsconfig.json'];
        const tsConfigPath = tsConfigPaths.find(p => fs.existsSync(p));
        if (fs.existsSync(tsConfigPath)) {
            let config: any = ts.parseConfigFileTextToJson(tsConfigPath, fs.readFileSync(tsConfigPath).toString());
            config.path = tsConfigPath;
            return config;
        }
        dir = path.dirname(dir);
    }
    return false;
}