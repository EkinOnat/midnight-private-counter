import {
  createCircuitContext,
  createConstructorContext,
  dummyContractAddress,
} from '@midnight-ntwrk/compact-runtime';
import { describe, expect, it } from 'vitest';

import {
  Contract,
  ledger,
  type Ledger,
} from '../managed/counter/contract/index.js';
import {
  counterWitnesses,
  type CounterPrivateState,
} from '../src/witnesses.js';

const TEST_COIN_PUBLIC_KEY = '00'.repeat(32);

const nonce = (byte: number): Uint8Array => new Uint8Array(32).fill(byte);
const bytesFromHex = (hex: string): Uint8Array =>
  Uint8Array.from(Buffer.from(hex, 'hex'));

// Fixed Compact hash vectors keep the expected values independent of the
// generated contract's persistentHash call.
const CIRCUIT_COMMITMENT = bytesFromHex(
  '02d449a31fbb267c8f352e9968a79e3e5fc95c1bbeaa502fd6454ebde5a4bedc',
);
const TRANSITION_COMMITMENT = bytesFromHex(
  '9f72ea0cf49536e3c66c787f705186df9a4378083753ae9536d65b3ad7fcddc4',
);
const PRIVACY_COMMITMENT = bytesFromHex(
  'fc8b64001c5fdd0f2f40fb67dae4a865a2c5bd17836676d6d5b58b7917e33717',
);

function containsByteSequence(
  value: unknown,
  expected: Uint8Array,
  seen = new WeakSet<object>(),
): boolean {
  if (ArrayBuffer.isView(value)) {
    const bytes = new Uint8Array(
      value.buffer,
      value.byteOffset,
      value.byteLength,
    );

    return bytes.some(
      (_byte, start) =>
        start + expected.length <= bytes.length &&
        expected.every(
          (expectedByte, offset) => bytes[start + offset] === expectedByte,
        ),
    );
  }
  if (value instanceof ArrayBuffer) {
    return containsByteSequence(new Uint8Array(value), expected, seen);
  }
  if (value === null || typeof value !== 'object') {
    return false;
  }
  if (seen.has(value)) {
    return false;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.some((entry) => containsByteSequence(entry, expected, seen));
  }

  return Object.values(value).some((entry) =>
    containsByteSequence(entry, expected, seen),
  );
}

function serializePublicOutputs(value: unknown): string {
  return JSON.stringify(value, (_key, entry) => {
    if (typeof entry === 'bigint') {
      return entry.toString();
    }
    if (entry instanceof Uint8Array) {
      return Buffer.from(entry).toString('hex');
    }
    return entry;
  });
}

function createCounter(nonces: readonly Uint8Array[]) {
  const privateState: CounterPrivateState = {
    nonces,
    nextNonceIndex: 0,
  };
  const contract = new Contract<CounterPrivateState>(counterWitnesses);
  const initial = contract.initialState(
    createConstructorContext(privateState, TEST_COIN_PUBLIC_KEY),
  );
  const context = createCircuitContext(
    dummyContractAddress(),
    initial.currentZswapLocalState,
    initial.currentContractState,
    initial.currentPrivateState,
  );

  return { contract, context };
}

function publicLedger(
  context: ReturnType<typeof createCounter>['context'],
): Ledger {
  return ledger(context.currentQueryContext.state);
}

describe('private Counter contract', () => {
  it('executes the circuit and produces exact deterministic public values', () => {
    const privateNonce = nonce(0x11);
    const { contract, context } = createCounter([privateNonce]);

    const call = contract.impureCircuits.increment(context);
    const state = publicLedger(call.context);

    expect(call.result).toEqual([]);
    expect(state.count).toBe(1n);
    expect(state.lastCommitment).toEqual(CIRCUIT_COMMITMENT);
  });

  it('applies the exact ledger transition for one valid call', () => {
    const privateNonce = nonce(0x22);
    const { contract, context } = createCounter([privateNonce]);
    const before = publicLedger(context);

    expect({
      count: before.count,
      lastCommitment: before.lastCommitment,
    }).toEqual({
      count: 0n,
      lastCommitment: new Uint8Array(32),
    });

    const call = contract.impureCircuits.increment(context);
    const after = publicLedger(call.context);

    expect(Object.keys(after).sort()).toEqual(['count', 'lastCommitment']);
    expect({
      count: after.count,
      lastCommitment: after.lastCommitment,
    }).toEqual({
      count: 1n,
      lastCommitment: TRANSITION_COMMITMENT,
    });
    expect(call.context.currentPrivateState.nextNonceIndex).toBe(1);
  });

  it('supports two sequential public state transitions', () => {
    const { contract, context } = createCounter([
      nonce(0x33),
      nonce(0x44),
    ]);

    const firstCall = contract.impureCircuits.increment(context);
    const firstState = publicLedger(firstCall.context);
    const firstCount = firstState.count;
    const firstCommitment = firstState.lastCommitment;

    const secondCall = contract.impureCircuits.increment(firstCall.context);
    const secondState = publicLedger(secondCall.context);

    expect(firstCount).toBe(1n);
    expect(secondState.count).toBe(2n);
    expect(secondState.lastCommitment).not.toEqual(firstCommitment);
    expect(secondCall.context.currentPrivateState.nextNonceIndex).toBe(2);
  });

  it('keeps the nonce out of every public circuit output', () => {
    const privateNonce = nonce(0xa5);
    const { contract, context } = createCounter([privateNonce]);

    const call = contract.impureCircuits.increment(context);
    const state = publicLedger(call.context);
    const encodedLedgerState =
      call.context.currentQueryContext.state.state.encode();
    const protocolPublicOutputs = {
      ledger: {
        count: state.count,
        lastCommitment: state.lastCommitment,
      },
      encodedLedgerState,
      disclosedValues: call.proofData.publicTranscript,
      gasCost: call.gasCost,
    };
    const additionalCheckedSurfaces = {
      circuitReturn: call.result,
      proofInput: call.proofData.input,
      proofOutput: call.proofData.output,
    };
    const localPrivateOutputs = {
      privateState: call.context.currentPrivateState,
      privateTranscript: call.proofData.privateTranscriptOutputs,
    };

    // Prove the detector reaches the witness in local-only proof data before
    // applying it to the protocol-public and other checked call surfaces.
    expect(
      containsByteSequence(
        call.proofData.privateTranscriptOutputs,
        privateNonce,
      ),
    ).toBe(true);
    expect(containsByteSequence(localPrivateOutputs, privateNonce)).toBe(true);
    expect(containsByteSequence(protocolPublicOutputs, privateNonce)).toBe(
      false,
    );
    expect(containsByteSequence(additionalCheckedSurfaces, privateNonce)).toBe(
      false,
    );
    expect(serializePublicOutputs(protocolPublicOutputs)).not.toContain(
      Buffer.from(privateNonce).toString('hex'),
    );
    expect(serializePublicOutputs(additionalCheckedSurfaces)).not.toContain(
      Buffer.from(privateNonce).toString('hex'),
    );
    expect(state.lastCommitment).toEqual(PRIVACY_COMMITMENT);
    expect(state.lastCommitment).not.toEqual(privateNonce);
    expect(
      containsByteSequence(
        call.proofData.publicTranscript,
        PRIVACY_COMMITMENT,
      ),
    ).toBe(true);
    expect(
      containsByteSequence(encodedLedgerState, PRIVACY_COMMITMENT),
    ).toBe(true);
  });
});
