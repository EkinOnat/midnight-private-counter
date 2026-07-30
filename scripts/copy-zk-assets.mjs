import { cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = resolve(root, 'managed', 'counter');
const target = resolve(root, 'public');

await mkdir(target, { recursive: true });
await Promise.all([
  cp(resolve(source, 'keys'), resolve(target, 'keys'), {
    recursive: true,
    force: true,
  }),
  cp(resolve(source, 'zkir'), resolve(target, 'zkir'), {
    recursive: true,
    force: true,
  }),
]);

console.log('Copied Counter proving and ZKIR assets into public/.');
