export type CounterClientErrorCode =
  | 'wallet_connection_lost'
  | 'network_mismatch'
  | 'local_proof_server_required'
  | 'proof_server_unreachable'
  | 'proof_generation_failed'
  | 'wallet_transaction_cancelled'
  | 'wallet_balance_failed'
  | 'transaction_submission_failed'
  | 'transaction_confirmation_failed'
  | 'contract_not_found'
  | 'contract_read_failed'
  | 'contract_initialization_failed'
  | 'zk_assets_unavailable'
  | 'private_input_generation_failed';

const COUNTER_ERROR_COPY: Record<CounterClientErrorCode, string> = {
  wallet_connection_lost:
    'Lace stopped responding. Reconnect the wallet, then try again.',
  network_mismatch:
    'Lace is no longer on Midnight Preview. Disconnect, switch networks, and reconnect.',
  local_proof_server_required:
    'This dApp proves locally only. Start proof server 8.1.0 at http://127.0.0.1:6300, then retry.',
  proof_server_unreachable:
    'The local proof server did not respond. Confirm proof server 8.1.0 is running on port 6300, then retry.',
  proof_generation_failed:
    'Proof generation failed before submission. Restart the local proof server, keep this tab open, and retry.',
  wallet_transaction_cancelled:
    'Transaction preparation was cancelled in Lace. Nothing was submitted; retry when ready.',
  wallet_balance_failed:
    'Lace could not prepare the transaction. Unlock Lace and confirm the wallet has generated tDUST, then retry.',
  transaction_submission_failed:
    'Lace could not submit the proved transaction. Confirm Lace is connected to Preview, then retry.',
  transaction_confirmation_failed:
    'The transaction was submitted, but finalization could not be confirmed. Do not resubmit. Check Lace activity; once Lace shows finalized or discarded, reload this dApp.',
  contract_not_found:
    'The Counter contract was not found at the verified Preview address. Check the network and reload the page.',
  contract_read_failed:
    'The verified contract could not be read from the Preview indexer. Check your connection and retry.',
  contract_initialization_failed:
    'The Counter contract could not be prepared. Reload the dApp; if this continues, verify Preview and the local proof assets.',
  zk_assets_unavailable:
    'The local proof assets could not be loaded. Reload the dApp and confirm the production build includes the Counter ZK assets.',
  private_input_generation_failed:
    'This browser could not securely generate a private input. Use an up-to-date secure browser and retry.',
};

export class CounterClientError extends Error {
  readonly code: CounterClientErrorCode;

  constructor(code: CounterClientErrorCode) {
    // Provider errors can contain transaction internals. Only this public code
    // is allowed to cross from the client into application error handling.
    super(code);
    this.name = 'CounterClientError';
    this.code = code;
  }
}

export const createCounterClientError = (
  code: CounterClientErrorCode,
): CounterClientError => new CounterClientError(code);

export const isCounterClientError = (
  cause: unknown,
): cause is CounterClientError => cause instanceof CounterClientError;

export const safeCounterErrorText = (cause: unknown): string =>
  cause instanceof Error ? `${cause.name} ${cause.message}`.toLowerCase() : '';

export function counterClientErrorCode(
  cause: unknown,
): CounterClientErrorCode | null {
  if (!cause || typeof cause !== 'object' || !('code' in cause)) return null;
  const code = (cause as { code?: unknown }).code;
  return typeof code === 'string' && Object.hasOwn(COUNTER_ERROR_COPY, code)
    ? (code as CounterClientErrorCode)
    : null;
}

export function friendlyCounterClientError(cause: unknown): string {
  const code = counterClientErrorCode(cause);
  if (code) return COUNTER_ERROR_COPY[code];

  // Keep compatibility with mocked or older clients while returning only
  // static copy. Raw provider messages are inspected locally, never rendered.
  const message = safeCounterErrorText(cause);
  if (message.includes('network_mismatch')) {
    return COUNTER_ERROR_COPY.network_mismatch;
  }
  if (message.includes('local_proof_server_required')) {
    return COUNTER_ERROR_COPY.local_proof_server_required;
  }
  if (/proof|prover|6300|fetch/.test(message)) {
    return 'Proof generation failed before submission. Confirm proof server 8.1.0 is running on port 6300, then retry.';
  }
  if (/reject|declin|denied|cancel/.test(message)) {
    return COUNTER_ERROR_COPY.wallet_transaction_cancelled;
  }
  if (/balance|dust|fund/.test(message)) {
    return COUNTER_ERROR_COPY.wallet_balance_failed;
  }
  if (/submit|transaction|mempool/.test(message)) {
    return 'The proved transaction could not be submitted. Confirm Lace is connected to Preview, then retry.';
  }
  return 'The private call could not be completed. Check Lace, Preview, and the local proof server, then retry.';
}
