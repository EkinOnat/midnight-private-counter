import type { Witnesses } from '../managed/counter/contract/index.js';

/**
 * Local-only state consumed by the privateNonce witness.
 *
 * None of these fields are part of the Compact ledger. A real UI would fill
 * this queue from a wallet/CSPRNG immediately before submitting a transaction.
 */
export interface CounterPrivateState {
  readonly nonces: readonly Uint8Array[];
  readonly nextNonceIndex: number;
}

export const counterWitnesses: Witnesses<CounterPrivateState> = {
  privateNonce({ privateState }) {
    const nonce = privateState.nonces[privateState.nextNonceIndex];

    if (!nonce) {
      throw new Error('No private nonce is available for this increment.');
    }
    if (nonce.length !== 32) {
      throw new Error('A Counter nonce must contain exactly 32 bytes.');
    }

    return [
      {
        ...privateState,
        nextNonceIndex: privateState.nextNonceIndex + 1,
      },
      nonce,
    ];
  },
};
