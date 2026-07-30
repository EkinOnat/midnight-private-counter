import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import {
  Binding,
  type CoinPublicKey,
  type EncPublicKey,
  type FinalizedTransaction,
  Proof,
  SignatureEnabled,
  Transaction,
  type TransactionId,
} from '@midnight-ntwrk/midnight-js-protocol/ledger';
import {
  fromHex,
  toHex,
  type ContractAddress,
} from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import type { UnboundTransaction } from '@midnight-ntwrk/midnight-js-types';
import {
  Contract as CounterContract,
  ledger as decodeCounterLedger,
} from '../../managed/counter/contract/index.js';
import { counterWitnesses, type CounterPrivateState } from '../witnesses.js';
import { MIDNIGHT_CONFIG } from '../config.js';
import { ephemeralPrivateStateProvider } from './ephemeral-private-state.js';

const PRIVATE_STATE_ID = 'privateCounterState';
type CounterCircuitKey = 'increment';

const compiledCounter = CompiledContract.make('private-counter', CounterContract).pipe(
  CompiledContract.withWitnesses(counterWitnesses),
  CompiledContract.withCompiledFileAssets('./managed/counter'),
);

export interface PublicCounterState {
  count: string;
  lastCommitment: string;
}

export interface IncrementResult {
  txId: string;
  blockHeight: number;
  count: string | null;
}

const normalizeNetwork = (networkId: string): string =>
  networkId.toLowerCase().replace(/[^a-z0-9]/g, '');

function requireLocalProofServer(uri: string | undefined): string {
  if (!uri) {
    throw new Error('LOCAL_PROOF_SERVER_REQUIRED');
  }

  const url = new URL(uri);
  const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  if (url.protocol !== 'http:' || !loopbackHosts.has(url.hostname)) {
    throw new Error('LOCAL_PROOF_SERVER_REQUIRED');
  }

  return url.toString();
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

export async function queryPublicCounterState(): Promise<PublicCounterState | null> {
  const provider = indexerPublicDataProvider(
    MIDNIGHT_CONFIG.indexerHttpUrl,
    MIDNIGHT_CONFIG.indexerWsUrl,
  );
  const state = await provider.queryContractState(
    MIDNIGHT_CONFIG.contractAddress as ContractAddress,
  );

  if (!state) return null;
  const ledger = decodeCounterLedger(state.data);
  return {
    count: ledger.count.toString(),
    lastCommitment: bytesToHex(ledger.lastCommitment),
  };
}

export async function incrementCounter(
  connectedApi: ConnectedAPI,
): Promise<IncrementResult> {
  const connection = await connectedApi.getConnectionStatus();
  const configuration = await connectedApi.getConfiguration();
  if (
    connection.status !== 'connected' ||
    normalizeNetwork(connection.networkId) !== MIDNIGHT_CONFIG.networkId ||
    normalizeNetwork(configuration.networkId) !== MIDNIGHT_CONFIG.networkId
  ) {
    throw new Error('NETWORK_MISMATCH');
  }

  // DApp Connector 4.x defines hintUsage(), but some Lace Midnight Preview
  // builds do not expose it at runtime. It is only an optimization hint, so
  // continue safely when the wallet omits it.
  if (typeof connectedApi.hintUsage === 'function') {
    await connectedApi.hintUsage([
      'getConfiguration',
      'getShieldedAddresses',
      'balanceUnsealedTransaction',
      'submitTransaction',
    ]);
  }

  setNetworkId(MIDNIGHT_CONFIG.networkId);
  // This challenge intentionally supports local proving only. Connector 4.x
  // deprecates the wallet-reported prover URI, and Lace builds variously omit
  // it or return a non-local placeholder. Use the verified loopback endpoint
  // directly so private proof inputs can never be sent to a remote prover.
  const proofServerUri = requireLocalProofServer(MIDNIGHT_CONFIG.proofServerUrl);
  const shielded = await connectedApi.getShieldedAddresses();
  const privateStateProvider = ephemeralPrivateStateProvider<
    typeof PRIVATE_STATE_ID,
    CounterPrivateState
  >();
  privateStateProvider.setContractAddress(
    MIDNIGHT_CONFIG.contractAddress as ContractAddress,
  );

  const zkBaseUrl = new URL(import.meta.env.BASE_URL, window.location.origin).toString();
  const zkConfigProvider = new FetchZkConfigProvider<CounterCircuitKey>(
    zkBaseUrl,
    window.fetch.bind(window),
  );
  const publicDataProvider = indexerPublicDataProvider(
    configuration.indexerUri,
    configuration.indexerWsUri,
  );
  const providers = {
    privateStateProvider,
    publicDataProvider,
    zkConfigProvider,
    proofProvider: httpClientProofProvider(proofServerUri, zkConfigProvider),
    walletProvider: {
      getCoinPublicKey: () =>
        shielded.shieldedCoinPublicKey as unknown as CoinPublicKey,
      getEncryptionPublicKey: () =>
        shielded.shieldedEncryptionPublicKey as unknown as EncPublicKey,
      balanceTx: async (
        tx: UnboundTransaction,
        _ttl?: Date,
      ): Promise<FinalizedTransaction> => {
        const balanced = await connectedApi.balanceUnsealedTransaction(
          toHex(tx.serialize()),
        );
        return Transaction.deserialize<SignatureEnabled, Proof, Binding>(
          'signature',
          'proof',
          'binding',
          fromHex(balanced.tx),
        );
      },
    },
    midnightProvider: {
      submitTx: async (tx: FinalizedTransaction): Promise<TransactionId> => {
        await connectedApi.submitTransaction(toHex(tx.serialize()));
        return tx.identifiers()[0];
      },
    },
  };

  const emptyState: CounterPrivateState = {
    nonces: [],
    nextNonceIndex: 0,
  };
  const deployed = await findDeployedContract(providers, {
    contractAddress: MIDNIGHT_CONFIG.contractAddress as ContractAddress,
    compiledContract: compiledCounter,
    privateStateId: PRIVATE_STATE_ID,
    initialPrivateState: emptyState,
  });

  const nonce = crypto.getRandomValues(new Uint8Array(32));
  await privateStateProvider.set(PRIVATE_STATE_ID, {
    nonces: [nonce],
    nextNonceIndex: 0,
  });

  try {
    // Only destructure the explicitly public fields. The returned object also
    // contains privacy-sensitive transaction data and must never be logged.
    const result = await deployed.callTx.increment();
    const txId = result.public.txId.toString();
    const blockHeight = result.public.blockHeight;
    const current = await publicDataProvider.queryContractState(
      MIDNIGHT_CONFIG.contractAddress as ContractAddress,
    );
    return {
      txId,
      blockHeight,
      count: current ? decodeCounterLedger(current.data).count.toString() : null,
    };
  } finally {
    await privateStateProvider.remove(PRIVATE_STATE_ID);
    nonce.fill(0);
    privateStateProvider.destroy();
  }
}
