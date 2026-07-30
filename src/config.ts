const VERIFIED_PREPROD_ADDRESS =
  '516b830d25b61b83abd63488618a8dc45e4aecc1a04da18377e467792bdeed62';

const configuredAddress =
  import.meta.env.VITE_COUNTER_CONTRACT_ADDRESS?.trim() || VERIFIED_PREPROD_ADDRESS;
const configuredNetwork = import.meta.env.VITE_NETWORK_ID?.trim().toLowerCase() || 'preprod';

if (!/^[0-9a-f]{64}$/.test(configuredAddress)) {
  throw new Error('VITE_COUNTER_CONTRACT_ADDRESS must be a 64-character hexadecimal address.');
}

if (configuredNetwork !== 'preprod') {
  throw new Error('This deployment requires VITE_NETWORK_ID=preprod.');
}

export const MIDNIGHT_CONFIG = Object.freeze({
  networkId: 'preprod',
  contractAddress: configuredAddress,
  indexerHttpUrl: 'https://indexer.preprod.midnight.network/api/v4/graphql',
  indexerWsUrl: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
  proofServerUrl: 'http://127.0.0.1:6300',
});
