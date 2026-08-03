const VERIFIED_PREVIEW_ADDRESS =
  '6d0a101573fc319dc46889f21caa157b71b7080ba3c5f954498840d04db84952';

const configuredAddress =
  import.meta.env.VITE_COUNTER_CONTRACT_ADDRESS?.trim() || VERIFIED_PREVIEW_ADDRESS;
const configuredNetwork = import.meta.env.VITE_NETWORK_ID?.trim().toLowerCase() || 'preview';

if (!/^[0-9a-f]{64}$/.test(configuredAddress)) {
  throw new Error('VITE_COUNTER_CONTRACT_ADDRESS must be a 64-character hexadecimal address.');
}

if (configuredNetwork !== 'preview') {
  throw new Error('This deployment requires VITE_NETWORK_ID=preview.');
}

export const MIDNIGHT_CONFIG = Object.freeze({
  networkId: 'preview',
  contractAddress: configuredAddress,
  indexerHttpUrl: 'https://indexer.preview.midnight.network/api/v4/graphql',
  indexerWsUrl: 'wss://indexer.preview.midnight.network/api/v4/graphql/ws',
  proofServerUrl: 'http://127.0.0.1:6300',
});
