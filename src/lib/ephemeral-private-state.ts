import type {
  ExportPrivateStatesOptions,
  ExportSigningKeysOptions,
  ImportPrivateStatesOptions,
  ImportPrivateStatesResult,
  ImportSigningKeysOptions,
  ImportSigningKeysResult,
  PrivateStateExport,
  PrivateStateId,
  PrivateStateProvider,
  SigningKeyExport,
} from '@midnight-ntwrk/midnight-js-types';
import type {
  ContractAddress,
  SigningKey,
} from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';

export interface EphemeralPrivateStateProvider<PSI extends PrivateStateId, PS>
  extends PrivateStateProvider<PSI, PS> {
  destroy(): void;
}

/**
 * Session-only private state. It intentionally has no export/import path, so
 * witness material cannot be persisted or copied out of the browser session.
 */
export function ephemeralPrivateStateProvider<
  PSI extends PrivateStateId,
  PS,
>(): EphemeralPrivateStateProvider<PSI, PS> {
  const states = new Map<ContractAddress, Map<PSI, PS>>();
  const signingKeys = new Map<ContractAddress, SigningKey>();
  let activeAddress: ContractAddress | null = null;

  const requireAddress = (): ContractAddress => {
    if (activeAddress === null) {
      throw new Error('Contract address has not been scoped.');
    }
    return activeAddress;
  };

  const scopedStates = (): Map<PSI, PS> => {
    const address = requireAddress();
    let scoped = states.get(address);
    if (!scoped) {
      scoped = new Map<PSI, PS>();
      states.set(address, scoped);
    }
    return scoped;
  };

  const disabled = (operation: string): Promise<never> =>
    Promise.reject(new Error(`${operation} is disabled for ephemeral private state.`));

  return {
    setContractAddress(address) {
      activeAddress = address;
    },
    set(id, state) {
      scopedStates().set(id, state);
      return Promise.resolve();
    },
    get(id) {
      return Promise.resolve(scopedStates().get(id) ?? null);
    },
    remove(id) {
      scopedStates().delete(id);
      return Promise.resolve();
    },
    clear() {
      states.delete(requireAddress());
      return Promise.resolve();
    },
    setSigningKey(address, key) {
      signingKeys.set(address, key);
      return Promise.resolve();
    },
    getSigningKey(address) {
      return Promise.resolve(signingKeys.get(address) ?? null);
    },
    removeSigningKey(address) {
      signingKeys.delete(address);
      return Promise.resolve();
    },
    clearSigningKeys() {
      signingKeys.clear();
      return Promise.resolve();
    },
    exportPrivateStates(_options?: ExportPrivateStatesOptions): Promise<PrivateStateExport> {
      return disabled('Private-state export');
    },
    importPrivateStates(
      _data: PrivateStateExport,
      _options?: ImportPrivateStatesOptions,
    ): Promise<ImportPrivateStatesResult> {
      return disabled('Private-state import');
    },
    exportSigningKeys(_options?: ExportSigningKeysOptions): Promise<SigningKeyExport> {
      return disabled('Signing-key export');
    },
    importSigningKeys(
      _data: SigningKeyExport,
      _options?: ImportSigningKeysOptions,
    ): Promise<ImportSigningKeysResult> {
      return disabled('Signing-key import');
    },
    destroy() {
      states.clear();
      signingKeys.clear();
      activeAddress = null;
    },
  };
}
