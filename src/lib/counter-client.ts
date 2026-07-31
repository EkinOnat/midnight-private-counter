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
import {
  createCounterClientError as publicError,
  isCounterClientError,
  safeCounterErrorText as safeErrorText,
} from './counter-errors.js';
import { ephemeralPrivateStateProvider } from './ephemeral-private-state.js';

export {
  CounterClientError,
  type CounterClientErrorCode,
} from './counter-errors.js';

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
  publicStateAvailable: boolean;
}

export type IncrementPhase =
  | 'preparing'
  | 'proving'
  | 'balancing'
  | 'submitting'
  | 'confirming'
  | 'refreshing';

export interface IncrementOptions {
  onProgress?(phase: IncrementPhase): void;
}

const normalizeNetwork = (networkId: string): string =>
  networkId.toLowerCase().replace(/[^a-z0-9]/g, '');

const isWalletCancellation = (cause: unknown): boolean =>
  /reject|declin|denied|cancel/.test(safeErrorText(cause));

function requireLocalProofServer(uri: string | undefined): string {
  if (!uri) {
    throw publicError('local_proof_server_required');
  }

  try {
    const url = new URL(uri);
    const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
    if (url.protocol !== 'http:' || !loopbackHosts.has(url.hostname)) {
      throw publicError('local_proof_server_required');
    }

    return url.toString();
  } catch (cause: unknown) {
    if (isCounterClientError(cause)) throw cause;
    throw publicError('local_proof_server_required');
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

export async function queryPublicCounterState(): Promise<PublicCounterState | null> {
  try {
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
  } catch {
    throw publicError('contract_read_failed');
  }
}

export async function incrementCounter(
  connectedApi: ConnectedAPI,
  options: IncrementOptions = {},
): Promise<IncrementResult> {
  const progress: { phase: IncrementPhase } = { phase: 'preparing' };
  const reportProgress = (nextPhase: IncrementPhase): void => {
    progress.phase = nextPhase;
    options.onProgress?.(nextPhase);
  };

  reportProgress('preparing');

  let connection: Awaited<ReturnType<ConnectedAPI['getConnectionStatus']>>;
  let configuration: Awaited<ReturnType<ConnectedAPI['getConfiguration']>>;
  try {
    [connection, configuration] = await Promise.all([
      connectedApi.getConnectionStatus(),
      connectedApi.getConfiguration(),
    ]);
  } catch {
    throw publicError('wallet_connection_lost');
  }

  if (
    connection.status !== 'connected' ||
    normalizeNetwork(connection.networkId) !== MIDNIGHT_CONFIG.networkId ||
    normalizeNetwork(configuration.networkId) !== MIDNIGHT_CONFIG.networkId
  ) {
    throw publicError('network_mismatch');
  }

  // DApp Connector 4.x defines hintUsage(), but some Lace Midnight Preview
  // builds do not expose it at runtime. It is only an optimization hint, so
  // continue safely when the wallet omits it.
  if (typeof connectedApi.hintUsage === 'function') {
    try {
      await connectedApi.hintUsage([
        'getConfiguration',
        'getShieldedAddresses',
        'balanceUnsealedTransaction',
        'submitTransaction',
      ]);
    } catch {
      // This API is only an optimization hint and must not block a valid call.
    }
  }

  setNetworkId(MIDNIGHT_CONFIG.networkId);
  // This challenge intentionally supports local proving only. Connector 4.x
  // deprecates the wallet-reported prover URI, and Lace builds variously omit
  // it or return a non-local placeholder. Use the verified loopback endpoint
  // directly so private proof inputs can never be sent to a remote prover.
  const proofServerUri = requireLocalProofServer(MIDNIGHT_CONFIG.proofServerUrl);
  let shielded: Awaited<ReturnType<ConnectedAPI['getShieldedAddresses']>>;
  try {
    shielded = await connectedApi.getShieldedAddresses();
  } catch {
    throw publicError('wallet_connection_lost');
  }

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
  const baseProofProvider = httpClientProofProvider(proofServerUri, zkConfigProvider);
  const providers = {
    privateStateProvider,
    publicDataProvider,
    zkConfigProvider,
    proofProvider: {
      proveTx: async (
        ...args: Parameters<typeof baseProofProvider.proveTx>
      ): ReturnType<typeof baseProofProvider.proveTx> => {
        reportProgress('proving');
        try {
          return await baseProofProvider.proveTx(...args);
        } catch (cause: unknown) {
          if (/fetch|network|econnrefused|connection|6300/.test(safeErrorText(cause))) {
            throw publicError('proof_server_unreachable');
          }
          throw publicError('proof_generation_failed');
        }
      },
    },
    walletProvider: {
      getCoinPublicKey: () =>
        shielded.shieldedCoinPublicKey as unknown as CoinPublicKey,
      getEncryptionPublicKey: () =>
        shielded.shieldedEncryptionPublicKey as unknown as EncPublicKey,
      balanceTx: async (
        tx: UnboundTransaction,
        _ttl?: Date,
      ): Promise<FinalizedTransaction> => {
        reportProgress('balancing');
        try {
          const balanced = await connectedApi.balanceUnsealedTransaction(
            toHex(tx.serialize()),
          );
          return Transaction.deserialize<SignatureEnabled, Proof, Binding>(
            'signature',
            'proof',
            'binding',
            fromHex(balanced.tx),
          );
        } catch (cause: unknown) {
          throw publicError(
            isWalletCancellation(cause)
              ? 'wallet_transaction_cancelled'
              : 'wallet_balance_failed',
          );
        }
      },
    },
    midnightProvider: {
      submitTx: async (tx: FinalizedTransaction): Promise<TransactionId> => {
        reportProgress('submitting');
        try {
          await connectedApi.submitTransaction(toHex(tx.serialize()));
          reportProgress('confirming');
          return tx.identifiers()[0];
        } catch {
          throw publicError('transaction_submission_failed');
        }
      },
    },
  };

  const emptyState: CounterPrivateState = {
    nonces: [],
    nextNonceIndex: 0,
  };
  let nonce: Uint8Array | null = null;

  try {
    const deployed = await findDeployedContract(providers, {
      contractAddress: MIDNIGHT_CONFIG.contractAddress as ContractAddress,
      compiledContract: compiledCounter,
      privateStateId: PRIVATE_STATE_ID,
      initialPrivateState: emptyState,
    }).catch((cause: unknown): never => {
      const message = safeErrorText(cause);
      if (/no contract deployed|contract address/.test(message)) {
        throw publicError('contract_not_found');
      }
      if (/verifier|zkir|zk config|404|not found/.test(message)) {
        throw publicError('zk_assets_unavailable');
      }
      if (/fetch|network|indexer|graphql|websocket/.test(message)) {
        throw publicError('contract_read_failed');
      }
      throw publicError('contract_initialization_failed');
    });

    try {
      nonce = crypto.getRandomValues(new Uint8Array(32));
    } catch {
      throw publicError('private_input_generation_failed');
    }

    await privateStateProvider.set(PRIVATE_STATE_ID, {
      nonces: [nonce],
      nextNonceIndex: 0,
    });

    // Only destructure the explicitly public fields. The returned object also
    // contains privacy-sensitive transaction data and must never be logged.
    reportProgress('proving');
    const result = await deployed.callTx.increment().catch((cause: unknown): never => {
      if (isCounterClientError(cause)) throw cause;
      if (progress.phase === 'confirming') {
        throw publicError('transaction_confirmation_failed');
      }
      if (progress.phase === 'submitting') {
        throw publicError('transaction_submission_failed');
      }
      if (progress.phase === 'balancing') {
        throw publicError('wallet_balance_failed');
      }
      throw publicError('proof_generation_failed');
    });

    const txId = result.public.txId.toString();
    const blockHeight = result.public.blockHeight;
    reportProgress('refreshing');
    let count: string | null = null;
    let publicStateAvailable = false;
    try {
      const current = await publicDataProvider.queryContractState(
        MIDNIGHT_CONFIG.contractAddress as ContractAddress,
      );
      if (current) {
        count = decodeCounterLedger(current.data).count.toString();
        publicStateAvailable = true;
      }
    } catch {
      // The transaction is already finalized. Return its public receipt and let
      // the UI offer a separate, safe public-state retry.
    }

    return {
      txId,
      blockHeight,
      count,
      publicStateAvailable,
    };
  } finally {
    try {
      if (nonce) {
        try {
          await privateStateProvider.remove(PRIVATE_STATE_ID);
        } finally {
          nonce.fill(0);
        }
      }
    } finally {
      privateStateProvider.destroy();
    }
  }
}
