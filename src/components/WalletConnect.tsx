import { useEffect, useRef } from 'react';
import type { MidnightWalletState } from '../hooks/useMidnight.js';

interface WalletConnectProps {
  wallet: MidnightWalletState;
}

export function WalletConnect({ wallet }: WalletConnectProps) {
  const isConnected = wallet.status === 'connected' && wallet.address;
  const connectButtonRef = useRef<HTMLButtonElement>(null);
  const disconnectButtonRef = useRef<HTMLButtonElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const previousStatus = useRef(wallet.status);

  useEffect(() => {
    const previous = previousStatus.current;
    if (previous === 'connecting' && wallet.status === 'connected') {
      disconnectButtonRef.current?.focus();
    } else if (wallet.status === 'error') {
      errorRef.current?.focus();
    } else if (previous === 'connected' && wallet.status === 'disconnected') {
      connectButtonRef.current?.focus();
    }
    previousStatus.current = wallet.status;
  }, [wallet.status]);

  const statusLabel = {
    disconnected: 'Not connected',
    connecting: 'Waiting for Lace',
    connected: 'Connected',
    error: 'Needs attention',
  }[wallet.status];

  return (
    <section
      className="wallet-panel"
      aria-labelledby="wallet-title"
      aria-busy={wallet.status === 'connecting'}
    >
      <div className="section-heading">
        <span className="eyebrow">01 / Wallet</span>
        <span className="wallet-status" role="status" aria-live="polite">
          <span className={`status-dot status-dot--${wallet.status}`} aria-hidden="true" />
          {statusLabel}
        </span>
      </div>

      <h2 id="wallet-title">{isConnected ? 'Lace connected' : 'Connect your wallet'}</h2>
      <p className="section-copy" id="wallet-description">
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
                <span className="network-pill">Preview</span>
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
          <button
            className="button button--quiet"
            type="button"
            onClick={wallet.disconnect}
            aria-describedby="wallet-description"
            ref={disconnectButtonRef}
          >
            Disconnect
          </button>
        </>
      ) : (
        <button
          className="button button--primary"
          type="button"
          onClick={() => void wallet.connect()}
          disabled={wallet.status === 'connecting'}
          aria-busy={wallet.status === 'connecting'}
          aria-describedby="wallet-description"
          ref={connectButtonRef}
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
        <p
          className="inline-message inline-message--error async-outcome"
          role="alert"
          tabIndex={-1}
          ref={errorRef}
        >
          {wallet.error}
        </p>
      )}
    </section>
  );
}
