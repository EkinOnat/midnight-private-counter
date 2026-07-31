/** @vitest-environment jsdom */

import { StrictMode } from 'react';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import type {
  IncrementOptions,
  IncrementResult,
} from '../../src/lib/counter-client.js';

const clientMocks = vi.hoisted(() => ({
  incrementCounter: vi.fn(),
  queryPublicCounterState: vi.fn(),
}));

vi.mock('../../src/lib/counter-client.js', () => clientMocks);

import { CircuitCall } from '../../src/components/CircuitCall.js';

const connectedApi = {} as ConnectedAPI;
const publicState = {
  count: '12',
  lastCommitment: '00'.repeat(32),
};

const finalizedResult = (count: string | null = '13'): IncrementResult => ({
  txId: 'public-transaction-id',
  blockHeight: 42,
  count,
  publicStateAvailable: count !== null,
});

beforeEach(() => {
  clientMocks.incrementCounter.mockReset();
  clientMocks.queryPublicCounterState.mockReset();
  clientMocks.queryPublicCounterState.mockResolvedValue(publicState);
});

afterEach(cleanup);

describe('CircuitCall', () => {
  it('shows the exact privacy label, proof loading state, and public result', async () => {
    let finish!: (value: IncrementResult) => void;
    clientMocks.incrementCounter.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );

    render(<CircuitCall connectedApi={connectedApi} />);
    expect(
      screen.getByText('Proved without revealing your input'),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('12')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /increment counter/i }));
    expect(
      screen.getByRole('button', { name: /generating proof & submitting/i }),
    ).toBeDisabled();

    await act(async () => {
      finish(finalizedResult());
    });

    expect(screen.getByText('13')).toBeInTheDocument();
    expect(screen.getByText('public-transaction-id')).toBeInTheDocument();
    expect(screen.getByText(/block 42/i)).toBeInTheDocument();
    expect(
      screen.getByText('Counter increment finalized').closest('[role="status"]'),
    ).toHaveFocus();
  });

  it('clears transaction application state when the wallet disconnects', async () => {
    clientMocks.incrementCounter.mockResolvedValue(finalizedResult());
    const { rerender } = render(<CircuitCall connectedApi={connectedApi} />);

    await userEvent.click(screen.getByRole('button', { name: /increment counter/i }));
    await waitFor(() =>
      expect(screen.getByText('public-transaction-id')).toBeInTheDocument(),
    );

    rerender(<CircuitCall connectedApi={null} />);
    expect(screen.queryByText('public-transaction-id')).not.toBeInTheDocument();
    expect(screen.getByText(/connect lace on preprod/i)).toBeInTheDocument();
  });

  it('reports each operation phase and blocks duplicate clicks before React can rerender', async () => {
    let finish!: (value: IncrementResult) => void;
    clientMocks.incrementCounter.mockImplementation(
      (_api: ConnectedAPI, options: IncrementOptions) => {
        options.onProgress?.('submitting');
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
    );

    render(<CircuitCall connectedApi={connectedApi} />);
    await waitFor(() => expect(screen.getByText('12')).toBeInTheDocument());
    const button = screen.getByRole('button', { name: /increment counter/i });

    act(() => {
      button.click();
      button.click();
    });

    expect(clientMocks.incrementCounter).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: /submitting transaction/i }),
    ).toBeDisabled();
    expect(screen.getByText(/submitting the proved transaction to midnight preprod/i))
      .toBeInTheDocument();

    await act(async () => {
      finish(finalizedResult());
    });
  });

  it('keeps the transaction lock through disconnect and fast reconnect', async () => {
    let finish!: (value: IncrementResult) => void;
    clientMocks.incrementCounter.mockImplementation(
      (_api: ConnectedAPI, options: IncrementOptions) => {
        options.onProgress?.('proving');
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
    );
    const reconnectedApi = { reconnected: true } as unknown as ConnectedAPI;
    const { rerender } = render(<CircuitCall connectedApi={connectedApi} />);
    await waitFor(() => expect(screen.getByText('12')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /increment counter/i }));
    expect(screen.getByRole('button', { name: /generating proof/i })).toBeDisabled();

    rerender(<CircuitCall connectedApi={null} />);
    expect(screen.getByRole('button', { name: /generating proof/i })).toBeDisabled();
    expect(screen.getByText(/generating a zero-knowledge proof/i)).toBeInTheDocument();

    rerender(<CircuitCall connectedApi={reconnectedApi} />);
    const lockedButton = screen.getByRole('button', { name: /generating proof/i });
    expect(lockedButton).toBeDisabled();
    lockedButton.click();
    expect(clientMocks.incrementCounter).toHaveBeenCalledTimes(1);

    await act(async () => {
      finish(finalizedResult());
    });

    expect(screen.getByText('public-transaction-id')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /increment counter/i })).toBeEnabled();
  });

  it('releases the pending lock after settlement under React StrictMode', async () => {
    let finish!: (value: IncrementResult) => void;
    clientMocks.incrementCounter.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );

    render(
      <StrictMode>
        <CircuitCall connectedApi={connectedApi} />
      </StrictMode>,
    );
    await waitFor(() => expect(screen.getByText('12')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /increment counter/i }));
    expect(
      screen.getByRole('button', { name: /generating proof & submitting/i }),
    ).toBeDisabled();

    await act(async () => {
      finish(finalizedResult());
    });

    expect(screen.getByRole('button', { name: /increment counter/i })).toBeEnabled();
  });

  it('restarts an invalidated initial read when the increment fails', async () => {
    let finishInitialRead!: (value: typeof publicState) => void;
    clientMocks.queryPublicCounterState
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishInitialRead = resolve;
          }),
      )
      .mockResolvedValueOnce(publicState);
    clientMocks.incrementCounter.mockRejectedValue(
      Object.assign(new Error('provider-private-detail'), {
        code: 'proof_generation_failed',
      }),
    );

    render(<CircuitCall connectedApi={connectedApi} />);
    await userEvent.click(screen.getByRole('button', { name: /increment counter/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /proof generation failed before submission/i,
    );
    await waitFor(() =>
      expect(clientMocks.queryPublicCounterState).toHaveBeenCalledTimes(2),
    );
    expect(await screen.findByText('12')).toBeInTheDocument();

    await act(async () => {
      finishInitialRead(publicState);
    });
  });

  it('shows an actionable public-read error, sanitizes it, and retries successfully', async () => {
    const privateDetail = 'private-indexer-debug-detail';
    clientMocks.queryPublicCounterState
      .mockRejectedValueOnce(new Error(`GraphQL failure: ${privateDetail}`))
      .mockResolvedValueOnce(publicState);

    render(<CircuitCall connectedApi={connectedApi} />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not read the public counter from the preprod indexer/i);
    expect(alert).not.toHaveTextContent(privateDetail);

    await userEvent.click(
      screen.getByRole('button', { name: /refresh public count/i }),
    );

    await waitFor(() => expect(screen.getByText('12')).toBeInTheDocument());
    expect(screen.queryByText(/could not read the public counter/i)).not.toBeInTheDocument();
  });

  it('handles missing public state on initial load and retries successfully', async () => {
    clientMocks.queryPublicCounterState
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        ...publicState,
        count: '7',
      });

    render(<CircuitCall connectedApi={connectedApi} />);

    expect(await screen.findByText('—')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      /verified contract has no readable public state on preprod/i,
    );

    await userEvent.click(
      screen.getByRole('button', { name: /refresh public count/i }),
    );

    await waitFor(() =>
      expect(clientMocks.queryPublicCounterState).toHaveBeenCalledTimes(2),
    );
    expect(await screen.findByText('7')).toBeInTheDocument();
  });

  it('prevents concurrent public refreshes while a read is pending', async () => {
    let finishRefresh!: (value: typeof publicState) => void;
    clientMocks.queryPublicCounterState
      .mockResolvedValueOnce(null)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishRefresh = resolve;
          }),
      );

    render(<CircuitCall connectedApi={connectedApi} />);

    const refreshButton = await screen.findByRole('button', {
      name: /refresh public count/i,
    });
    act(() => {
      refreshButton.click();
      refreshButton.click();
      refreshButton.click();
    });

    expect(clientMocks.queryPublicCounterState).toHaveBeenCalledTimes(2);

    await act(async () => {
      finishRefresh(publicState);
    });
    expect(await screen.findByText('12')).toBeInTheDocument();
  });

  it('keeps a finalized transaction successful when its follow-up read fails', async () => {
    clientMocks.queryPublicCounterState
      .mockResolvedValueOnce(publicState)
      .mockResolvedValueOnce({
        ...publicState,
        count: '13',
      });
    clientMocks.incrementCounter.mockResolvedValue(finalizedResult(null));

    render(<CircuitCall connectedApi={connectedApi} />);
    await waitFor(() => expect(screen.getByText('12')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /increment counter/i }));

    expect(await screen.findByText('public-transaction-id')).toBeInTheDocument();
    expect(
      screen.getByText(/transaction finalized, but the latest public count could not be read/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /increment counter/i })).toBeDisabled();

    await userEvent.click(
      screen.getByRole('button', { name: /refresh public count/i }),
    );
    await waitFor(() => expect(screen.getByText('13')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /increment counter/i })).toBeEnabled();
  });

  it('keeps increment disabled when a submitted transaction has an unknown outcome', async () => {
    const privateDetail = 'private-confirmation-provider-detail';
    clientMocks.queryPublicCounterState
      .mockResolvedValueOnce(publicState)
      .mockResolvedValueOnce({
        ...publicState,
        count: '13',
      });
    clientMocks.incrementCounter.mockImplementation(
      (_api: ConnectedAPI, options: IncrementOptions) => {
        options.onProgress?.('confirming');
        return Promise.reject(
          Object.assign(new Error(privateDetail), {
            code: 'transaction_confirmation_failed',
          }),
        );
      },
    );

    const { rerender } = render(<CircuitCall connectedApi={connectedApi} />);
    await waitFor(() => expect(screen.getByText('12')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /increment counter/i }));

    const alert = await screen.findByText(
      /transaction was submitted, but finalization could not be confirmed/i,
    );
    expect(alert).toHaveTextContent(/do not resubmit.*reload this dapp/i);
    expect(alert).not.toHaveTextContent(privateDetail);
    expect(
      screen.getByRole('button', { name: /submission outcome unknown/i }),
    ).toBeDisabled();
    expect(screen.getByText(/check the transaction in lace activity/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /reload after checking lace/i }),
    ).toBeEnabled();

    await userEvent.click(
      screen.getByRole('button', { name: /refresh public count/i }),
    );
    await waitFor(() => expect(screen.getByText('13')).toBeInTheDocument());
    expect(
      screen.getByRole('button', { name: /submission outcome unknown/i }),
    ).toBeDisabled();
    expect(clientMocks.incrementCounter).toHaveBeenCalledTimes(1);

    rerender(<CircuitCall connectedApi={null} />);
    expect(screen.getByText(/check the transaction in lace activity/i)).toBeInTheDocument();
    rerender(<CircuitCall connectedApi={connectedApi} />);
    expect(
      screen.getByRole('button', { name: /submission outcome unknown/i }),
    ).toBeDisabled();
  });

  it('renders only a static actionable transaction error and focuses it', async () => {
    const privateDetail = 'private-witness-debug-value';
    const providerError = Object.assign(new Error(privateDetail), {
      code: 'proof_generation_failed',
    });
    clientMocks.incrementCounter.mockRejectedValue(providerError);

    render(<CircuitCall connectedApi={connectedApi} />);
    await waitFor(() => expect(screen.getByText('12')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /increment counter/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/proof generation failed before submission/i);
    expect(alert).not.toHaveTextContent(privateDetail);
    expect(document.body).not.toHaveTextContent(privateDetail);
    expect(alert).toHaveFocus();
  });
});
