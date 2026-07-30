import type { MidnightWalletState } from '../hooks/useMidnight.js';

interface WalletConnectProps {
  wallet: MidnightWalletState;
}

export function WalletConnect({ wallet }: WalletConnectProps) {
  const isConnected = wallet.status === 'connected' && wallet.address;

  return (
    <section className="wallet-panel" aria-labelledby="wallet-title">
      <div className="section-heading">
        <span className="eyebrow">01 / Wallet</span>
        <div className={`status-dot status-dot--${wallet.status}`} aria-hidden="true" />
      </div>

      <h2 id="wallet-title">{isConnected ? 'Lace connected' : 'Connect your wallet'}</h2>
      <p className="section-copy">
        {isConnected
          ? 'Authorization is active for this browser session.'
          : 'Authorize Lace to balance and submit your Counter transaction.'}
      </p>

      {isConnected ? (
        <>
          <dl className="wallet-details">
            <div>
              <dt>Network</dt>
              <dd>
                <span className="network-pill">Preprod</span>
              </dd>
            </div>
            <div>
              <dt>Wallet</dt>
              <dd>{wallet.walletName}</dd>
            </div>
            <div>
              <dt>Address</dt>
              <dd>
                <code>{wallet.address}</code>
              </dd>
            </div>
          </dl>
          <button className="button button--quiet" type="button" onClick={wallet.disconnect}>
            Disconnect
          </button>
        </>
      ) : (
        <button
          className="button button--primary"
          type="button"
          onClick={() => void wallet.connect()}
          disabled={wallet.status === 'connecting'}
        >
          {wallet.status === 'connecting' ? (
            <>
              <span className="spinner" aria-hidden="true" />
              Waiting for Lace
            </>
          ) : (
            'Connect Lace'
          )}
        </button>
      )}

      {wallet.error && (
        <p className="inline-message inline-message--error" role="alert">
          {wallet.error}
        </p>
      )}
    </section>
  );
}
