import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = join(__dirname, '..', 'src', 'data');
const dest = join(__dirname, '..', 'dist', 'data');

mkdirSync(dest, { recursive: true });
if (existsSync(src)) {
  cpSync(src, dest, { recursive: true });
}
