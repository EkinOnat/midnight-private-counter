import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const COMPILER_VERSION = '0.31.1';
const CONTRACT_SOURCE = 'contracts/counter.compact';
const OUTPUT_DIRECTORY = 'managed/counter';
const projectRoot = resolve(import.meta.dirname, '..');

function toWslPath(windowsPath) {
  const normalized = windowsPath.replaceAll('\\', '/');
  const match = /^([A-Za-z]):\/(.*)$/.exec(normalized);

  if (!match) {
    throw new Error(`Cannot translate the project path for WSL: ${windowsPath}`);
  }

  return `/mnt/${match[1].toLowerCase()}/${match[2]}`;
}

const invocation =
  process.platform === 'win32'
    ? {
        command: 'wsl.exe',
        args: [
          '--exec',
          'bash',
          '-lc',
          `cd "$1"\nexec compact compile +${COMPILER_VERSION} "$2" "$3"`,
          'midnight-compile',
          toWslPath(projectRoot),
          CONTRACT_SOURCE,
          OUTPUT_DIRECTORY,
        ],
        cwd: projectRoot,
      }
    : {
        command: 'compact',
        args: [
          'compile',
          `+${COMPILER_VERSION}`,
          CONTRACT_SOURCE,
          OUTPUT_DIRECTORY,
        ],
        cwd: projectRoot,
      };

const result = spawnSync(invocation.command, invocation.args, {
  cwd: invocation.cwd,
  stdio: 'inherit',
  shell: false,
});

if (result.error) {
  const platformHint =
    process.platform === 'win32'
      ? 'Install Compact 0.31.1 in the default WSL distribution.'
      : 'Install Compact devtools and compiler 0.31.1 on PATH.';
  console.error(`Unable to start the Compact compiler. ${platformHint}`);
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
