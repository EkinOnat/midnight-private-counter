import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'src', 'lib', 'counter-client.ts'),
  'utf8',
);

describe('browser private-input boundary', () => {
  it('does not log, persist, place in URLs, or expose full private transaction results', () => {
    expect(source).not.toMatch(/\bconsole\.(?:log|debug|info|warn|error)\b/);
    expect(source).not.toMatch(/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/);
    expect(source).not.toMatch(/\bURLSearchParams\b|location\.(?:hash|search)/);
    expect(source).not.toMatch(/result\.private|JSON\.stringify\s*\(\s*result/);
  });

  it('uses a cryptographic RNG and explicitly zeroes the nonce buffer', () => {
    expect(source).toContain('crypto.getRandomValues(new Uint8Array(32))');
    expect(source).toContain('nonce.fill(0)');
    expect(source).toContain('privateStateProvider.remove(PRIVATE_STATE_ID)');
  });

  it('treats the wallet usage hint as optional for Lace Preview compatibility', () => {
    expect(source).toContain("typeof connectedApi.hintUsage === 'function'");
  });

  it('uses only the required local prover instead of Lace’s deprecated URI', () => {
    expect(source).toContain(
      'requireLocalProofServer(MIDNIGHT_CONFIG.proofServerUrl)',
    );
    expect(source).not.toContain('configuration.proverServerUri ??');
  });
});
