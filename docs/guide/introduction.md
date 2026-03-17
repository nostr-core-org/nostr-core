# Introduction

## What is NWC?

**Nostr Wallet Connect (NWC)** is a protocol ([NIP-47](https://github.com/nostr-protocol/nips/blob/master/47.md)) that lets applications interact with Lightning wallets over the Nostr network. Instead of each wallet providing its own proprietary API, NWC defines a standard set of operations - pay invoices, check balances, create invoices - that any wallet can implement.

The communication happens through Nostr relays using encrypted events, so your app never needs direct access to the wallet. The user simply shares a **connection string** and your app can start making requests.

## Why nostr-core?

Existing NWC libraries tend to be either:

- **Vendor-specific** - tightly coupled to one wallet provider's SDK
- **Heavy** - pulling in large Nostr client frameworks when you only need wallet operations
- **Incomplete** - missing encryption support, error handling, or TypeScript types

**nostr-core** takes a different approach:

- **Single connection string** - pass in a `nostr+walletconnect://` URI and start making calls
- **Full NIP-47 coverage** - every method (`pay_invoice`, `get_balance`, `make_invoice`, `list_transactions`, etc.)
- **Auto-encryption** - detects whether the wallet supports NIP-04 or NIP-44 and handles it transparently
- **Typed errors** - specific error classes for timeouts, connection failures, wallet errors, and decryption issues
- **Zero framework deps** - built on audited [noble](https://paulmillr.com/noble/) cryptography libraries only
- **ESM-only** - tree-shakeable, modern JavaScript

## What's Included

Beyond the NWC client, nostr-core exports a comprehensive set of Nostr protocol primitives covering **39 NIPs**:

| Category | Modules | Description |
|----------|---------|-------------|
| **Wallet** | `NWC` | High-level NIP-47 wallet client (all 10 methods) |
| **Networking** | `Relay` / `RelayPool` | WebSocket relay connections |
| **Events** | `finalizeEvent` / `verifyEvent` | Event signing and verification |
| **Keys** | `generateSecretKey` / `getPublicKey` | Key generation |
| **Encryption** | `nip04`, `nip44` | AES-256-CBC and ChaCha20 encryption |
| **Encoding** | `nip19`, `nip21` | Bech32 encoding, `nostr:` URI scheme |
| **Identity** | `nip02`, `nip05`, `nip06`, `nip07`, `nip24` | Follow lists, DNS identifiers, key derivation, browser signer, metadata |
| **Social** | `nip09`, `nip10`, `nip22`, `nip25`, `nip18` | Deletions, threads, comments, reactions, reposts |
| **Content** | `nip23`, `nip27`, `nip30`, `nip31`, `nip36` | Long-form, references, emoji, alt tags, content warnings |
| **Messaging** | `nip17`, `nip28`, `nip59` | Private DMs (gift wrap), public chat channels |
| **Discovery** | `nip50`, `nip51`, `nip65` | Search, lists, relay lists |
| **Moderation** | `nip56` | Reporting |
| **Badges** | `nip58` | Badge definitions, awards, profiles, request flow with proofs |
| **Calendar** | `nip52` | Date-based events, time-based events, calendars, RSVP |
| **Groups** | `nip29` | Relay-based group chat |
| **Auth** | `nip42`, `nip46`, `nip98` | Relay auth, remote signing, HTTP auth |
| **Utility** | `nip13`, `nip40`, `nip48`, `nip57` | Proof of work, expiration, proxy tags, zaps |
| **Fundraising** | `nip75` | Zap goals with beneficiaries and progress tracking |
| **LNURL** | `lnurl` | Pay requests, withdraw requests, bech32 encoding, success actions (LUD-01/03/06/09/10/12/17/18/20/21) |
| **Filtering** | `Filter` / `matchFilter` | Event filtering |

These are the same primitives used internally by the NWC client, exposed so you can build complete Nostr applications without pulling in another library.

## Coming from @getalby/sdk?

If you've been using the Alby JS SDK, nostr-core gives you the same NWC protocol coverage with fewer dependencies, no vendor lock-in, typed errors, and cross-runtime support. See the [comparison guide](./comparison.md) for a detailed breakdown.
