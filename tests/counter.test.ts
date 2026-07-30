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
  it('runs the circuit logic and publishes a commitment', () => {
    const { contract, context } = createCounter([nonce(0x11)]);

    const result = contract.impureCircuits.increment(context);
    const state = publicLedger(result.context);

    expect(state.count).toBe(1n);
    expect(state.lastCommitment).toHaveLength(32);
    expect(state.lastCommitment).not.toEqual(new Uint8Array(32));
    expect(result.context.currentPrivateState.nextNonceIndex).toBe(1);
  });

  it('applies two valid state transitions in sequence', () => {
    const { contract, context } = createCounter([
      nonce(0x22),
      nonce(0x33),
    ]);

    const first = contract.impureCircuits.increment(context);
    const firstState = publicLedger(first.context);
    const second = contract.impureCircuits.increment(first.context);
    const secondState = publicLedger(second.context);

    expect(firstState.count).toBe(1n);
    expect(secondState.count).toBe(2n);
    expect(secondState.lastCommitment).not.toEqual(
      firstState.lastCommitment,
    );
    expect(second.context.currentPrivateState.nextNonceIndex).toBe(2);
  });

  it('never exposes the private nonce in public ledger state', () => {
    const privateNonce = nonce(0xa5);
    const { contract, context } = createCounter([privateNonce]);

    const result = contract.impureCircuits.increment(context);
    const state = publicLedger(result.context);
    const publicProjection = JSON.stringify(state, (_key, value) =>
      typeof value === 'bigint'
        ? value.toString()
        : value instanceof Uint8Array
          ? Buffer.from(value).toString('hex')
          : value,
    );

    expect(Object.keys(state).sort()).toEqual([
      'count',
      'lastCommitment',
    ]);
    expect(state.lastCommitment).not.toEqual(privateNonce);
    expect(publicProjection).not.toContain(
      Buffer.from(privateNonce).toString('hex'),
    );
    expect(result.context.currentPrivateState.nonces[0]).toEqual(
      privateNonce,
    );
  });
});
