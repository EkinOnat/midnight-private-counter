import { CircuitCall } from './components/CircuitCall.js';
import { WalletConnect } from './components/WalletConnect.js';
import { MIDNIGHT_CONFIG } from './config.js';
import { useMidnight } from './hooks/useMidnight.js';

export default function App() {
  const wallet = useMidnight();

  return (
    <main>
      <header className="hero">
        <div className="topline">
          <a className="wordmark" href="/" aria-label="Midnight Private Counter home">
            <span aria-hidden="true">M·</span> Private Counter
          </a>
          <span className="network-pill">
            <span className="network-pulse" aria-hidden="true" />
            Preview
          </span>
        </div>

        <div className="hero-grid">
          <div>
            <p className="eyebrow">Midnight Builder Challenge / Level 3</p>
            <h1>
              Participation,
              <br />
              <em>minus the exposure.</em>
            </h1>
          </div>
          <div className="hero-aside">
            <p>
              Increment a public counter while a one-call private input stays local. Midnight
              verifies the proof—not the raw input.
            </p>
            <div className="contract-chip">
              <span>Verified contract</span>
              <code>{MIDNIGHT_CONFIG.contractAddress}</code>
            </div>
          </div>
        </div>
      </header>

      <div className="workspace">
        <WalletConnect wallet={wallet} />
        <CircuitCall connectedApi={wallet.connectedApi} />
      </div>

      <section className="privacy-strip" aria-labelledby="privacy-heading">
        <div>
          <p className="eyebrow">The privacy boundary</p>
          <h2 id="privacy-heading">Small public signal. Strong private proof.</h2>
        </div>
        <dl>
          <div>
            <dt>Public</dt>
            <dd>Counter, one-way commitment, transaction ID, and block height</dd>
          </div>
          <div>
            <dt>Private</dt>
            <dd>
              A fresh 32-byte input generated for one call, used only in volatile local state, and
              never displayed or persisted by this dApp
            </dd>
          </div>
          <div>
            <dt>Proved without revealing</dt>
            <dd>
              The commitment derives from that input and the public counter advances exactly once
            </dd>
          </div>
        </dl>
      </section>

      <footer>
        <span>Built with Compact + Midnight.js</span>
        <a
          href="https://github.com/EkinOnat/midnight-private-counter"
          target="_blank"
          rel="noreferrer"
        >
          View source ↗
        </a>
      </footer>
    </main>
  );
}
