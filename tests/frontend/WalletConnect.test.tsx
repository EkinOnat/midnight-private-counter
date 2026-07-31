/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WalletConnect } from '../../src/components/WalletConnect.js';
import type {
  MidnightWalletState,
  WalletStatus,
} from '../../src/hooks/useMidnight.js';

function walletState(
  status: WalletStatus,
  overrides: Partial<MidnightWalletState> = {},
): MidnightWalletState {
  return {
    status,
    connectedApi: null,
    address: null,
    walletName: null,
    networkId: null,
    error: null,
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(),
    ...overrides,
  };
}

afterEach(cleanup);

describe('WalletConnect', () => {
  it('calls connect from the disconnected state', async () => {
    const wallet = walletState('disconnected');

    render(<WalletConnect wallet={wallet} />);
    await userEvent.click(
      screen.getByRole('button', { name: /connect lace/i }),
    );

    expect(wallet.connect).toHaveBeenCalledTimes(1);
  });

  it('calls disconnect from the connected state', async () => {
    const wallet = walletState('connected', {
      address: 'mn_addr_preprod1public',
      walletName: 'Lace',
      networkId: 'preprod',
    });

    render(<WalletConnect wallet={wallet} />);
    await userEvent.click(
      screen.getByRole('button', { name: /disconnect/i }),
    );

    expect(wallet.disconnect).toHaveBeenCalledTimes(1);
  });

  it('disables the busy connect button and suppresses duplicate connection requests', async () => {
    const wallet = walletState('connecting');

    render(<WalletConnect wallet={wallet} />);
    const button = screen.getByRole('button', { name: /waiting for lace/i });

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    expect(wallet.connect).not.toHaveBeenCalled();
  });

  it('announces wallet progress and restores keyboard focus after connect and disconnect', () => {
    const { rerender } = render(
      <WalletConnect wallet={walletState('connecting')} />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(/waiting for lace/i);
    expect(screen.getByRole('button', { name: /waiting for lace/i })).toHaveAttribute(
      'aria-busy',
      'true',
    );

    rerender(
      <WalletConnect
        wallet={walletState('connected', {
          address: 'mn_addr_preprod1public',
          walletName: 'Lace',
          networkId: 'preprod',
        })}
      />,
    );
    expect(screen.getByRole('button', { name: /disconnect/i })).toHaveFocus();

    rerender(<WalletConnect wallet={walletState('disconnected')} />);
    expect(screen.getByRole('button', { name: /connect lace/i })).toHaveFocus();
  });

  it('focuses and announces a static wallet error', () => {
    const { rerender } = render(
      <WalletConnect wallet={walletState('disconnected')} />,
    );

    rerender(
      <WalletConnect
        wallet={walletState('error', {
          error: 'Network mismatch. Switch Lace to Midnight Preprod, then reconnect.',
        })}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(/needs attention/i);
    expect(screen.getByRole('alert')).toHaveFocus();
  });
});
