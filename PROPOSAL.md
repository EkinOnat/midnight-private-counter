# Product Proposal

## What is the product, and who uses it?

**Selected challenge idea:** Anonymous Feedback / Survey — verifiable
participation, private responses.

Midnight Private Counter is the participation layer for a privacy-preserving
feedback and survey product. Community organizers, event hosts, educators, and
workplace teams can publish a survey and obtain a publicly verifiable
participation total without asking participants to publish the private input
used for their submission.

The current Level 3 dApp implements that foundation end to end on Preview: a
participant connects Lace, the browser generates a fresh private 32-byte input,
the Compact circuit proves the expected state transition, and the public
participation counter increases by one. Only a one-way commitment is published.
The raw input remains in volatile local state and is erased after the call.

The product path for later challenge levels is to associate this participation
proof with a survey identifier and a private response. Organizers would learn
the aggregate result they need, while individual responses would not be exposed
on the public ledger. The current prototype does not yet claim voter
eligibility, one-person-one-response enforcement, or wallet-level anonymity;
those controls are explicit milestones rather than hidden assumptions.

## Why Midnight specifically?

A transparent blockchain is useful for an auditable participation total, but it
is a poor place to publish individual survey answers or the private values used
to authorize a response. Putting those values on-chain would make them
permanent, searchable, and potentially linkable to other activity. Moving the
entire survey to a conventional private database would avoid public exposure
but would require participants to trust the organizer's tally.

Midnight provides the missing middle ground. Compact witnesses allow the dApp
to supply private data locally, while a zero-knowledge circuit proves that the
required rules were followed. The contract can then update a public counter and
publish only a deliberately disclosed commitment. Observers can verify the
public state transition without receiving the raw witness.

In this Level 3 contract, the proof establishes that a valid 32-byte witness was
used to derive the published commitment and that the counter advanced by
exactly one. It does not prove that the browser generated the value randomly or
that a person has not participated before. Later versions will add a
survey-scoped nullifier or private membership proof so duplicate prevention can
be verified without revealing participant identity.

## Data Model

| Data Point | Type | Disclosed To |
|---|---|---|
| Participation count | Public ledger state | Everyone |
| Latest one-way input commitment | Public ledger state | Everyone |
| Transaction identifier, finalized block, and ordinary protocol metadata | Public transaction data | Network observers |
| Raw 32-byte per-call input | Private Compact witness | Caller, local proving flow, and no public observer |
| In-memory nonce queue and consumption index | Private application state | Caller's browser only; removed after the call |
| Proof that the commitment and one-step increment are valid | Zero-knowledge proof | Verifiable by the network without revealing the raw input |
| Survey identifier | Planned public configuration | Everyone |
| Individual survey response | Planned private witness | Participant only; not published individually |
| Survey-scoped nullifier or membership proof | Planned privacy-preserving anti-duplication data | Only the minimum public nullifier/proof needed to reject duplicates |
| Aggregate survey result | Planned disclosed output | Organizer and/or everyone, according to the survey's published policy |

## Mainnet Feasibility

Yes, if the product remains deliberately narrow. The deployed Preview contract,
Lace integration, local proof flow, deterministic contract tests, frontend
tests, and CI pipeline already demonstrate the core execution path. Reaching a
credible Mainnet candidate by Level 6 is realistic with the following scoped
milestones:

1. Add survey identifiers, lifecycle rules, and clearly defined organizer
   permissions.
2. Add a survey-scoped nullifier or private allowlist proof to prevent duplicate
   participation without publishing identity.
3. Add a constrained private response format and disclose only the aggregate
   result promised by the survey.
4. Expand adversarial tests for duplicate submissions, invalid proofs,
   lifecycle transitions, privacy leakage, and failed transaction recovery.
5. Complete threat modeling, an external contract review, accessibility and
   mobile testing, and a staged Preview/Preprod release before Mainnet.

The project should not reach Mainnet merely by reusing the current counter. A
Mainnet release requires explicit anti-abuse rules, a precise disclosure
policy, reviewed upgrade/administration choices, and evidence that neither the
frontend nor its operational services leak private response data.
