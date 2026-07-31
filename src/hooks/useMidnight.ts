import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConnectedAPI, InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import semver from 'semver';
import { MIDNIGHT_CONFIG } from '../config.js';

export type WalletStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface MidnightWalletState {
  status: WalletStatus;
  connectedApi: ConnectedAPI | null;
  address: string | null;
  walletName: string | null;
  networkId: string | null;
  error: string | null;
  connect(): Promise<void>;
  disconnect(): void;
}

const normalizeNetwork = (networkId: string): string =>
  networkId.toLowerCase().replace(/[^a-z0-9]/g, '');

type LaceDiscovery =
  | { wallet: InitialAPI; problem: null }
  | { wallet: null; problem: 'missing' | 'unsupported' };

function discoverLace(): LaceDiscovery {
  const wallets = window.midnight;
  if (!wallets) return { wallet: null, problem: 'missing' };

  const laceCandidates = Object.entries(wallets)
    .filter(
      ([key, wallet]) =>
        key === 'mnLace' || /lace/i.test(`${wallet?.rdns ?? ''} ${wallet?.name ?? ''}`),
    )
    .map(([, wallet]) => wallet)
    .filter(
    (wallet): wallet is InitialAPI =>
      Boolean(wallet) &&
      typeof wallet.connect === 'function' &&
      typeof wallet.apiVersion === 'string',
  );

  const compatible = laceCandidates.find((wallet) =>
    semver.satisfies(wallet.apiVersion, '4.x'),
  );
  if (compatible) return { wallet: compatible, problem: null };
  return {
    wallet: null,
    problem: laceCandidates.length > 0 ? 'unsupported' : 'missing',
  };
}

function friendlyConnectionError(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (/reject|declin|denied|cancel/.test(message)) {
    return 'Connection was cancelled in Lace. You can try again when ready.';
  }
  if (/network_mismatch|network|preprod/.test(message)) {
    return 'Network mismatch. Switch Lace to Midnight Preprod, then reconnect.';
  }
  if (/lock/.test(message)) {
    return 'Lace is locked. Unlock the wallet, then try connecting again.';
  }
  if (/timeout|timed out|respond/.test(message)) {
    return 'Lace did not respond. Keep the extension open, then try connecting again.';
  }
  return 'Lace could not authorize this connection. Open the wallet, confirm Preprod, and try again.';
}

export function useMidnight(): MidnightWalletState {
  const [status, setStatus] = useState<WalletStatus>('disconnected');
  const [connectedApi, setConnectedApi] = useState<ConnectedAPI | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [walletName, setWalletName] = useState<string | null>(null);
  const [networkId, setNetworkId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const connectionPending = useRef(false);

  const disconnect = useCallback(() => {
    requestId.current += 1;
    connectionPending.current = false;
    setConnectedApi(null);
    setAddress(null);
    setWalletName(null);
    setNetworkId(null);
    setError(null);
    setStatus('disconnected');
  }, []);

  const connect = useCallback(async () => {
    if (connectionPending.current) return;

    const discovery = discoverLace();
    const wallet = discovery.wallet;
    if (!wallet) {
      setStatus('error');
      setError(
        discovery.problem === 'unsupported'
          ? 'This dApp requires the Lace Midnight API 4.x. Update Lace, enable Midnight support, then refresh this page.'
          : 'Lace with Midnight support was not found. Install or enable Lace, then refresh this page.',
      );
      return;
    }

    const activeRequest = ++requestId.current;
    connectionPending.current = true;
    setStatus('connecting');
    setError(null);

    try {
      // Keep connect() in the user click call stack so the browser does not
      // block Lace's authorization popup.
      const api = await wallet.connect(MIDNIGHT_CONFIG.networkId);
      const [connection, configuration, addressResult] = await Promise.all([
        api.getConnectionStatus(),
        api.getConfiguration(),
        api.getUnshieldedAddress(),
      ]);

      if (activeRequest !== requestId.current) return;
      if (
        connection.status !== 'connected' ||
        normalizeNetwork(connection.networkId) !== MIDNIGHT_CONFIG.networkId ||
        normalizeNetwork(configuration.networkId) !== MIDNIGHT_CONFIG.networkId
      ) {
        throw new Error('NETWORK_MISMATCH');
      }

      setConnectedApi(api);
      setAddress(addressResult.unshieldedAddress);
      setWalletName(wallet.name);
      setNetworkId(connection.networkId);
      setStatus('connected');
    } catch (cause: unknown) {
      if (activeRequest !== requestId.current) return;
      setConnectedApi(null);
      setAddress(null);
      setWalletName(null);
      setNetworkId(null);
      setStatus('error');
      setError(friendlyConnectionError(cause));
    } finally {
      if (activeRequest === requestId.current) {
        connectionPending.current = false;
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      requestId.current += 1;
      connectionPending.current = false;
    };
  }, []);

  return {
    status,
    connectedApi,
    address,
    walletName,
    networkId,
    error,
    connect,
    disconnect,
  };
}
