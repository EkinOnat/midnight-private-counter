import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ContractAddress } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { ephemeralPrivateStateProvider } from '../../src/lib/ephemeral-private-state.js';

const counterClientSource = readFileSync(
  resolve(process.cwd(), 'src', 'lib', 'counter-client.ts'),
  'utf8',
);
const browserSource = [
  'src/App.tsx',
  'src/components/CircuitCall.tsx',
  'src/components/WalletConnect.tsx',
  'src/hooks/useMidnight.ts',
  'src/lib/counter-client.ts',
  'src/lib/ephemeral-private-state.ts',
  'src/witnesses.ts',
]
  .map((file) => readFileSync(resolve(process.cwd(), file), 'utf8'))
  .join('\n');

describe('browser private-input boundary', () => {
  it('does not log, persist, place in URLs, or expose full private transaction results', () => {
    expect(browserSource).not.toMatch(/\bconsole\.(?:log|debug|info|warn|error)\b/);
    expect(browserSource).not.toMatch(/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/);
    expect(browserSource).not.toMatch(/\bURLSearchParams\b|location\.(?:hash|search)/);
    expect(counterClientSource).not.toMatch(
      /result\.private|JSON\.stringify\s*\(\s*result/,
    );
    expect(counterClientSource).not.toMatch(/new URL\s*\([^)]*\bnonce\b/);
  });

  it('uses a cryptographic RNG and explicitly zeroes the nonce buffer', () => {
    expect(counterClientSource).toContain('crypto.getRandomValues(new Uint8Array(32))');
    expect(counterClientSource).toContain('nonce.fill(0)');
    expect(counterClientSource).toContain(
      'privateStateProvider.remove(PRIVATE_STATE_ID)',
    );
  });

  it('treats the wallet usage hint as optional for Lace Preview compatibility', () => {
    expect(counterClientSource).toContain(
      "typeof connectedApi.hintUsage === 'function'",
    );
  });

  it('uses only the required local prover instead of Lace’s deprecated URI', () => {
    expect(counterClientSource).toContain(
      'requireLocalProofServer(MIDNIGHT_CONFIG.proofServerUrl)',
    );
    expect(counterClientSource).not.toContain('configuration.proverServerUri ??');
  });

  it('offers no private-state export path and destroys volatile state', async () => {
    type TestStateId = 'privateCounterState';
    interface TestState {
      nonce: Uint8Array;
    }

    const provider = ephemeralPrivateStateProvider<TestStateId, TestState>();
    const address = '00'.repeat(32) as ContractAddress;
    const privateValue = new Uint8Array(32).fill(173);
    provider.setContractAddress(address);
    await provider.set('privateCounterState', { nonce: privateValue });

    await expect(provider.exportPrivateStates()).rejects.toThrow(
      'Private-state export is disabled',
    );
    provider.destroy();

    expect(() => provider.get('privateCounterState')).toThrow(
      'Contract address has not been scoped',
    );
  });
});
