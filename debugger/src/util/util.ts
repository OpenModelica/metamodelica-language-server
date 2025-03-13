
import path from 'path';

export function isMetaModelicaFile(file: string): boolean {
    return path.extname(file) === ".mo";
}
