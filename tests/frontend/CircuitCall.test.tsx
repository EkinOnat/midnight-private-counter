/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';

const clientMocks = vi.hoisted(() => ({
  incrementCounter: vi.fn(),
  queryPublicCounterState: vi.fn(),
}));

vi.mock('../../src/lib/counter-client.js', () => clientMocks);

import { CircuitCall } from '../../src/components/CircuitCall.js';

const connectedApi = {} as ConnectedAPI;

beforeEach(() => {
  clientMocks.queryPublicCounterState.mockResolvedValue({
    count: '12',
    lastCommitment: '00'.repeat(32),
  });
});

afterEach(cleanup);

describe('CircuitCall', () => {
  it('shows the exact privacy label, proof loading state, and public result', async () => {
    let finish!: (value: {
      txId: string;
      blockHeight: number;
      count: string;
    }) => void;
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
      finish({
        txId: 'public-transaction-id',
        blockHeight: 42,
        count: '13',
      });
    });

    expect(screen.getByText('13')).toBeInTheDocument();
    expect(screen.getByText('public-transaction-id')).toBeInTheDocument();
    expect(screen.getByText(/block 42/i)).toBeInTheDocument();
  });

  it('clears transaction application state when the wallet disconnects', async () => {
    clientMocks.incrementCounter.mockResolvedValue({
      txId: 'public-transaction-id',
      blockHeight: 42,
      count: '13',
    });
    const { rerender } = render(<CircuitCall connectedApi={connectedApi} />);

    await userEvent.click(screen.getByRole('button', { name: /increment counter/i }));
    await waitFor(() =>
      expect(screen.getByText('public-transaction-id')).toBeInTheDocument(),
    );

    rerender(<CircuitCall connectedApi={null} />);
    expect(screen.queryByText('public-transaction-id')).not.toBeInTheDocument();
    expect(screen.getByText(/connect lace on preprod/i)).toBeInTheDocument();
  });
});
