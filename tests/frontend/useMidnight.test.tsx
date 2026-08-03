/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConnectedAPI, InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import { useMidnight } from '../../src/hooks/useMidnight.js';

function connectedApi(networkId = 'preview'): ConnectedAPI {
  return {
    getConnectionStatus: vi.fn().mockResolvedValue({
      status: 'connected',
      networkId,
    }),
    getConfiguration: vi.fn().mockResolvedValue({
      indexerUri: 'https://indexer.preview.midnight.network/api/v4/graphql',
      indexerWsUri: 'wss://indexer.preview.midnight.network/api/v4/graphql/ws',
      proverServerUri: 'http://localhost:6300',
      substrateNodeUri: 'wss://rpc.preview.midnight.network',
      networkId,
    }),
    getUnshieldedAddress: vi.fn().mockResolvedValue({
      unshieldedAddress: 'mn_addr_preview1testaddress',
    }),
  } as unknown as ConnectedAPI;
}

function installLace(
  api: ConnectedAPI,
  connectError?: Error,
  apiVersion = '4.0.1',
): InitialAPI {
  const wallet = {
    rdns: 'io.lace.midnight',
    name: 'Lace',
    icon: 'data:image/svg+xml,<svg/>',
    apiVersion,
    connect: connectError
      ? vi.fn().mockRejectedValue(connectError)
      : vi.fn().mockResolvedValue(api),
  } satisfies InitialAPI;

  Object.defineProperty(window, 'midnight', {
    configurable: true,
    value: { mnLace: wallet },
  });
  return wallet;
}

afterEach(() => {
  Object.defineProperty(window, 'midnight', {
    configurable: true,
    value: undefined,
  });
});

describe('useMidnight', () => {
  it('connects Lace to Preview and clears all application state on disconnect', async () => {
    const api = connectedApi();
    const wallet = installLace(api);
    const { result } = renderHook(() => useMidnight());

    await act(async () => {
      await result.current.connect();
    });

    expect(wallet.connect).toHaveBeenCalledWith('preview');
    expect(result.current.status).toBe('connected');
    expect(result.current.address).toBe('mn_addr_preview1testaddress');
    expect(result.current.networkId).toBe('preview');

    act(() => result.current.disconnect());
    expect(result.current.status).toBe('disconnected');
    expect(result.current.connectedApi).toBeNull();
    expect(result.current.address).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('rejects a wallet connected to the wrong network', async () => {
    installLace(connectedApi('preprod'));
    const { result } = renderHook(() => useMidnight());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.connectedApi).toBeNull();
    expect(result.current.error).toMatch(/network mismatch/i);
  });

  it('reports a user-cancelled authorization without exposing the raw error', async () => {
    const privateDetail = 'sensitive-provider-debug-detail';
    installLace(connectedApi(), new Error(`User rejected: ${privateDetail}`));
    const { result } = renderHook(() => useMidnight());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toMatch(/cancelled/i);
    expect(result.current.error).not.toContain(privateDetail);
  });

  it('shows a clear error when Lace is not installed', async () => {
    const { result } = renderHook(() => useMidnight());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toMatch(/not found/i);
  });

  it('requires the supported Lace API instead of attempting an incompatible connection', async () => {
    const wallet = installLace(connectedApi(), undefined, '3.2.0');
    const { result } = renderHook(() => useMidnight());

    await act(async () => {
      await result.current.connect();
    });

    expect(wallet.connect).not.toHaveBeenCalled();
    expect(result.current.status).toBe('error');
    expect(result.current.error).toMatch(/api 4\.x/i);
  });

  it('prevents duplicate wallet authorization prompts in the same render', async () => {
    const api = connectedApi();
    let finishConnection!: (value: ConnectedAPI) => void;
    const wallet = installLace(api);
    vi.mocked(wallet.connect).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishConnection = resolve;
        }),
    );
    const { result } = renderHook(() => useMidnight());

    await act(async () => {
      const first = result.current.connect();
      const duplicate = result.current.connect();
      expect(wallet.connect).toHaveBeenCalledTimes(1);
      finishConnection(api);
      await Promise.all([first, duplicate]);
    });

    expect(result.current.status).toBe('connected');
  });
});
