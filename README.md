# Midnight Private Counter

> A Midnight smart contract that increments a public counter while proving knowledge of a private nonce without publishing that nonce.

## Contract Address

| Network | Address |
|---|---|
| Preview | `6d0a101573fc319dc46889f21caa157b71b7080ba3c5f954498840d04db84952` |
| Preprod | `[NOT DEPLOYED — PASTE ADDRESS AFTER DEPLOY]` |

The Preview deployment was completed on July 30, 2026. Local deployment
metadata and wallet material are intentionally excluded from Git.

## What This Does

Each successful `increment()` call advances the public counter by exactly one.
The caller supplies a fresh 32-byte nonce through a private Compact witness.
The contract hashes that nonce and deliberately discloses only the resulting
32-byte commitment. Anyone can see the counter and commitment, while the value
used to produce the commitment remains private.

This small contract demonstrates the core Midnight pattern of combining useful
public state transitions with private inputs and a zero-knowledge proof.

## Privacy Model

- **What is PUBLIC (on-chain, visible to anyone):** the current `count`, the
  latest `lastCommitment`, the contract address, and normal transaction
  metadata.
- **What is PRIVATE (private witness, never on-chain):** the raw 32-byte nonce
  returned by `privateNonce()` and the local nonce queue/index used by the
  TypeScript witness provider.
- **What the user PROVES without revealing:** that the circuit received a
  valid 32-byte witness, derived the published commitment from it, and applied
  the contract's fixed one-step counter transition. The raw nonce is not
  written to the ledger or returned as a public circuit result.

The `disclose()` in `contracts/counter.compact` is deliberate: it crosses the
privacy boundary only for the one-way hash commitment, not for the witness
itself.

## Tech Stack

- Midnight Preview network
- Compact language and Compact developer tools 0.5.1
- Compact compiler 0.31.1 and runtime 0.16.0
- Midnight.js 4.1.1
- Node.js v22
- TypeScript and Vitest
- Docker with proof server 8.1.0
- WSL2 on Windows (Midnight's supported Windows development path)

## Prerequisites

- Git
- Node.js 22 and npm
- Docker Desktop or Docker Engine with Compose
- Compact developer tools with compiler 0.31.1 available as `compact`
- On Windows, WSL2 with a Linux distribution
- A funded Preview testnet wallet when deploying (the setup waits and prints
  the address that must be funded)

Use the
[official Midnight installation guide](https://docs.midnight.network/getting-started/installation)
and
[compatibility matrix](https://docs.midnight.network/relnotes/support-matrix)
to confirm the currently supported versions before upgrading.

## Setup

Clone the repository (replace the repository name if you publish it under a
different name):

```bash
git clone https://github.com/EkinOnat/REPOSITORY_NAME.git
cd REPOSITORY_NAME
npm install
```

Compile the Compact source and generate the TypeScript contract, ZKIR, prover
key, and verifier key under `managed/counter`:

```bash
npm run compile
```

Start the proof server:

```bash
docker compose up -d
docker compose ps
```

Select Preview and deploy:

```bash
npm run network preview
npm run deploy -- --network preview
```

On the first public-network deployment, the script prints a wallet address and
waits for test tNIGHT. Fund that address using the Preview faucet printed by
the script. Never commit `.midnight-state.json`,
`.midnight-wallet-state/`, or any wallet seed.

## Run Tests

Run the three contract tests:

```bash
npm test
```

The suite covers circuit behavior, sequential state transitions, and the
absence of the raw private nonce from public ledger state. Run the TypeScript
check separately:

```bash
npm run typecheck
```

## Project Structure

```text
contracts/counter.compact       Compact source
managed/counter/                Generated contract, circuits, and keys
src/witnesses.ts                Private witness implementation
src/deploy.ts                   Preview/Preprod deployment entry point
src/network.ts                  Network selection and local deployment record
src/wallet.ts                   Wallet/provider setup
tests/counter.test.ts           Three privacy and state tests
.github/workflows/              Reserved for Level 3 CI/CD
```

## Author

[EkinOnat on GitHub](https://github.com/EkinOnat)

## Initial Idea

I want to build a privacy-preserving participation counter for events,
communities, and online campaigns. Participants submit a private nonce that is
never published on-chain. The contract increments a public participation count
and publishes only a one-way commitment derived from the private input. This
Level 1 prototype demonstrates the public/private boundary; future versions
will add a user interface, unique nullifiers to prevent duplicate
participation, and optional eligibility proofs.

## Screenshots

### Compact compilation

![Successful Compact compilation with generated circuit and keys](screenshots/01-compact-compile.png)

### Preview deployment

![Midnight Preview network and deployed Counter contract address](screenshots/02-preview-contract-address.png)
