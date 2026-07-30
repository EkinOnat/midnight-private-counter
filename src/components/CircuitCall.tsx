import { useCallback, useEffect, useState } from 'react';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import {
  incrementCounter,
  queryPublicCounterState,
  type IncrementResult,
} from '../lib/counter-client.js';

interface CircuitCallProps {
  connectedApi: ConnectedAPI | null;
}

type CallStatus = 'idle' | 'proving' | 'success' | 'error';

function friendlyCircuitError(cause: unknown): string {
  const message = cause instanceof Error ? cause.message.toLowerCase() : '';
  if (message.includes('network_mismatch')) {
    return 'Lace is no longer connected to Preprod. Disconnect and reconnect.';
  }
  if (message.includes('local_proof_server_required')) {
    return 'Set Lace’s Midnight proof server to Local (http://localhost:6300) and keep Docker running.';
  }
  if (/proof|prover|6300|fetch/.test(message)) {
    return 'Local proof generation failed. Confirm proof server 8.1.0 is running on port 6300.';
  }
  if (/balance|dust|fund/.test(message)) {
    return 'Lace could not balance the transaction. Confirm the wallet has generated tDUST.';
  }
  return 'The transaction could not be completed. Check Lace, Preprod, and the local proof server.';
}

export function CircuitCall({ connectedApi }: CircuitCallProps) {
  const [status, setStatus] = useState<CallStatus>('idle');
  const [publicCount, setPublicCount] = useState<string | null>(null);
  const [result, setResult] = useState<IncrementResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshCount = useCallback(async () => {
    try {
      const state = await queryPublicCounterState();
      setPublicCount(state?.count ?? null);
    } catch {
      setPublicCount(null);
    }
  }, []);

  useEffect(() => {
    void refreshCount();
  }, [refreshCount]);

  useEffect(() => {
    if (!connectedApi) {
      setStatus('idle');
      setResult(null);
      setError(null);
    }
  }, [connectedApi]);

  const increment = async () => {
    if (!connectedApi || status === 'proving') return;
    setStatus('proving');
    setResult(null);
    setError(null);

    try {
      const next = await incrementCounter(connectedApi);
      setResult(next);
      setPublicCount(next.count);
      setStatus('success');
    } catch (cause: unknown) {
      setStatus('error');
      setError(friendlyCircuitError(cause));
    }
  };

  return (
    <section className="circuit-panel" aria-labelledby="circuit-title">
      <div className="section-heading">
        <span className="eyebrow">02 / Prove</span>
        <span className="privacy-label">
          <span aria-hidden="true">✓</span> Proved without revealing your input
        </span>
      </div>

      <div className="counter-readout" aria-live="polite">
        <span>Public participation count</span>
        <strong>{publicCount ?? '—'}</strong>
      </div>

      <h2 id="circuit-title">Add one, privately.</h2>
      <p className="section-copy">
        Your browser creates a fresh private input, proves the Counter transition locally, and
        reveals only a one-way commitment.
      </p>

      <button
        className="button button--signal"
        type="button"
        onClick={() => void increment()}
        disabled={!connectedApi || status === 'proving'}
      >
        {status === 'proving' ? (
          <>
            <span className="spinner spinner--dark" aria-hidden="true" />
            Generating proof &amp; submitting
          </>
        ) : (
          'Increment counter'
        )}
      </button>

      {!connectedApi && (
        <p className="inline-message">Connect Lace on Preprod to enable the circuit.</p>
      )}

      {result && (
        <div className="transaction-result" role="status">
          <div>
            <span>Finalized</span>
            <strong>Block {result.blockHeight.toLocaleString()}</strong>
          </div>
          <div>
            <span>Transaction ID</span>
            <code>{result.txId}</code>
          </div>
        </div>
      )}

      {error && (
        <p className="inline-message inline-message--error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
