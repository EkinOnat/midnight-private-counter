import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import {
  incrementCounter,
  queryPublicCounterState,
  type IncrementPhase,
  type IncrementResult,
} from '../lib/counter-client.js';
import {
  counterClientErrorCode,
  friendlyCounterClientError,
} from '../lib/counter-errors.js';

interface CircuitCallProps {
  connectedApi: ConnectedAPI | null;
}

type CallStatus = 'idle' | IncrementPhase | 'success' | 'error';
type ReadStatus = 'loading' | 'ready' | 'error';

const PENDING_PHASES = new Set<CallStatus>([
  'preparing',
  'proving',
  'balancing',
  'submitting',
  'confirming',
  'refreshing',
]);

const PHASE_BUTTON_LABEL: Record<IncrementPhase, string> = {
  preparing: 'Generating proof & submitting',
  proving: 'Generating proof',
  balancing: 'Waiting for Lace',
  submitting: 'Submitting transaction',
  confirming: 'Confirming transaction',
  refreshing: 'Refreshing public count',
};

const PHASE_STATUS_COPY: Record<IncrementPhase, string> = {
  preparing: 'Checking Lace, the Preprod network, and the verified contract.',
  proving: 'Generating a zero-knowledge proof with your local proof server. Keep this tab open.',
  balancing: 'Proof complete. Approve transaction preparation in Lace.',
  submitting: 'Lace is submitting the proved transaction to Midnight Preprod.',
  confirming: 'Submitted. Waiting for on-chain finalization.',
  refreshing: 'Finalized. Reading the updated public counter from Preprod.',
};

const readErrorCopy =
  'Could not read the public counter from the Preprod indexer. Check your connection, then retry.';

const missingStateCopy =
  'The verified contract has no readable public state on Preprod. Check the network, then retry.';

const finalizedReadErrorCopy =
  'Transaction finalized, but the latest public count could not be read. Refresh the public count before starting another increment.';

const uncertainReadErrorCopy =
  'The displayed count may be stale while Lace determines finalization. You may refresh it for visibility, but do not submit again until Lace shows a final outcome and you reload this dApp.';

export function CircuitCall({ connectedApi }: CircuitCallProps) {
  const [status, setStatus] = useState<CallStatus>('idle');
  const [publicCount, setPublicCount] = useState<string | null>(null);
  const [readStatus, setReadStatus] = useState<ReadStatus>('loading');
  const [readError, setReadError] = useState<string | null>(null);
  const [requiresReadRecovery, setRequiresReadRecovery] = useState(false);
  const [submissionUncertain, setSubmissionUncertain] = useState(false);
  const [operationLocked, setOperationLocked] = useState(false);
  const [result, setResult] = useState<IncrementResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const operationId = useRef(0);
  const readRequestId = useRef(0);
  const operationPending = useRef(false);
  const readPending = useRef(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const mounted = useRef(true);

  const refreshCount = useCallback(async () => {
    if (readPending.current) return;
    const activeRequest = ++readRequestId.current;
    readPending.current = true;
    setReadStatus('loading');
    setReadError(null);

    try {
      const state = await queryPublicCounterState();
      if (activeRequest !== readRequestId.current) return;
      if (!state) {
        setPublicCount(null);
        setReadStatus('error');
        setReadError(missingStateCopy);
        return;
      }

      setPublicCount(state.count);
      setReadStatus('ready');
      setRequiresReadRecovery(false);
    } catch {
      if (activeRequest !== readRequestId.current) return;
      setPublicCount(null);
      setReadStatus('error');
      setReadError(readErrorCopy);
    } finally {
      if (activeRequest === readRequestId.current) {
        readPending.current = false;
      }
    }
  }, []);

  useEffect(() => {
    void refreshCount();
    return () => {
      readRequestId.current += 1;
      readPending.current = false;
    };
  }, [refreshCount]);

  useEffect(() => {
    if (!connectedApi && !operationLocked) {
      setStatus('idle');
      setResult(null);
      setError(null);
    }
  }, [connectedApi, operationLocked]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      operationId.current += 1;
    };
  }, []);

  useEffect(() => {
    if (status === 'success') resultRef.current?.focus();
    if (status === 'error') errorRef.current?.focus();
  }, [status]);

  const increment = async () => {
    if (
      !connectedApi ||
      operationPending.current ||
      requiresReadRecovery ||
      submissionUncertain
    ) {
      return;
    }
    const activeOperation = ++operationId.current;
    operationPending.current = true;
    setOperationLocked(true);
    readRequestId.current += 1;
    readPending.current = false;
    setStatus('preparing');
    setResult(null);
    setError(null);

    try {
      const next = await incrementCounter(connectedApi, {
        onProgress(phase) {
          if (activeOperation === operationId.current) setStatus(phase);
        },
      });
      if (activeOperation !== operationId.current) return;

      setResult(next);
      if (next.count !== null) {
        setPublicCount(next.count);
        setReadStatus('ready');
        setReadError(null);
        setRequiresReadRecovery(false);
      } else {
        setPublicCount(null);
        setReadStatus('error');
        setReadError(finalizedReadErrorCopy);
        setRequiresReadRecovery(true);
      }
      setStatus('success');
    } catch (cause: unknown) {
      if (activeOperation !== operationId.current) return;
      if (counterClientErrorCode(cause) === 'transaction_confirmation_failed') {
        setSubmissionUncertain(true);
        setPublicCount(null);
        setReadStatus('error');
        setReadError(uncertainReadErrorCopy);
        setRequiresReadRecovery(true);
      }
      setStatus('error');
      setError(friendlyCounterClientError(cause));
      if (readStatus === 'loading') void refreshCount();
    } finally {
      operationPending.current = false;
      if (mounted.current) setOperationLocked(false);
    }
  };

  const isPending = PENDING_PHASES.has(status);
  const phase = isPending ? (status as IncrementPhase) : null;

  return (
    <section
      className="circuit-panel"
      aria-labelledby="circuit-title"
      aria-busy={operationLocked}
    >
      <div className="section-heading">
        <span className="eyebrow">02 / Prove</span>
        <span className="privacy-label">
          <span aria-hidden="true">✓</span> Proved without revealing your input
        </span>
      </div>

      <div
        className="counter-readout"
        aria-live="polite"
        aria-busy={readStatus === 'loading'}
      >
        <span id="public-count-label">Public / on-chain participation count</span>
        <strong aria-labelledby="public-count-label">{publicCount ?? '—'}</strong>
      </div>

      <h2 id="circuit-title">Add one, privately.</h2>
      <p className="section-copy" id="circuit-description">
        A fresh private input is generated for this call and sent only to your local proof server.
        The ledger receives the public count and one-way commitment—not the raw input.
      </p>

      <button
        className="button button--signal"
        type="button"
        onClick={() => void increment()}
        disabled={
          !connectedApi ||
          operationLocked ||
          requiresReadRecovery ||
          submissionUncertain
        }
        aria-describedby={
          submissionUncertain
            ? 'circuit-description uncertain-submission-copy'
            : 'circuit-description'
        }
      >
        {phase ? (
          <>
            <span className="spinner spinner--dark" aria-hidden="true" />
            {PHASE_BUTTON_LABEL[phase]}
          </>
        ) : submissionUncertain ? (
          'Submission outcome unknown'
        ) : (
          'Increment counter'
        )}
      </button>

      {phase && (
        <p className="inline-message inline-message--pending" role="status" aria-live="polite">
          {PHASE_STATUS_COPY[phase]}
        </p>
      )}

      {!connectedApi && (
        <p className="inline-message" role="status">
          Connect Lace on Preprod to enable the circuit.
        </p>
      )}

      {result && (
        <div
          className="transaction-result async-outcome"
          role="status"
          aria-live="polite"
          tabIndex={-1}
          ref={resultRef}
        >
          <p className="result-heading">Counter increment finalized</p>
          <div>
            <span>Public / finalized</span>
            <strong>Block {result.blockHeight.toLocaleString()}</strong>
          </div>
          <div>
            <span>Public transaction ID</span>
            <code>{result.txId}</code>
          </div>
        </div>
      )}

      {error && (
        <p
          className="inline-message inline-message--error async-outcome"
          role="alert"
          tabIndex={-1}
          ref={errorRef}
        >
          {error}
        </p>
      )}

      {submissionUncertain && (
        <section
          className="uncertain-submission"
          aria-labelledby="uncertain-submission-title"
        >
          <h3 id="uncertain-submission-title">Submission outcome unknown</h3>
          <p id="uncertain-submission-copy">
            Do not submit another increment yet. Check the transaction in Lace activity. If it is
            still pending, wait. Once Lace shows it as finalized or discarded, reload this dApp to
            reconcile public state before another call.
          </p>
          <button
            className="button button--quiet button--small"
            type="button"
            onClick={() => window.location.reload()}
          >
            Reload after checking Lace
          </button>
        </section>
      )}

      {readStatus === 'loading' && (
        <p className="inline-message read-status" role="status" aria-live="polite">
          <span className="spinner spinner--light" aria-hidden="true" />
          Reading public contract state from Preprod
        </p>
      )}

      {readStatus === 'error' && readError && (
        <div className="read-error" role="alert">
          <p className="inline-message inline-message--error">{readError}</p>
          <button
            className="button button--quiet button--small"
            type="button"
            onClick={() => void refreshCount()}
            disabled={readPending.current || isPending}
          >
            Refresh public count
          </button>
        </div>
      )}
    </section>
  );
}
