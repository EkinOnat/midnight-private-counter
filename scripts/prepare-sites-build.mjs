import { cp, mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = process.cwd();
const distDirectory = resolve(projectRoot, 'dist');
const clientDirectory = resolve(distDirectory, 'client');
const serverDirectory = resolve(distDirectory, 'server');
const hostingDirectory = resolve(distDirectory, '.openai');

await mkdir(clientDirectory, { recursive: true });

for (const entry of await readdir(distDirectory, { withFileTypes: true })) {
  if (entry.name === 'client' || entry.name === 'server' || entry.name === '.openai') {
    continue;
  }
  await rename(resolve(distDirectory, entry.name), resolve(clientDirectory, entry.name));
}

await rm(serverDirectory, { recursive: true, force: true });
await mkdir(serverDirectory, { recursive: true });
await writeFile(
  resolve(serverDirectory, 'index.js'),
  [
    'export default {',
    '  async fetch(request, env) {',
    '    const url = new URL(request.url);',
    '    let response = await env.ASSETS.fetch(request);',
    '',
    "    if (response.status === 404 && request.headers.get('accept')?.includes('text/html')) {",
    "      response = await env.ASSETS.fetch(new Request(new URL('/index.html', request.url), request));",
    '    }',
    '',
    "    if (url.pathname.startsWith('/keys/') || url.pathname.startsWith('/zkir/')) {",
    '      response = new Response(response.body, response);',
    "      response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');",
    '    }',
    '',
    '    return response;',
    '  },',
    '};',
    '',
  ].join('\n'),
);

await rm(hostingDirectory, { recursive: true, force: true });
await mkdir(hostingDirectory, { recursive: true });
await cp(
  resolve(projectRoot, '.openai', 'hosting.json'),
  resolve(hostingDirectory, 'hosting.json'),
);

console.log('Prepared the validated static build for Sites hosting.');
