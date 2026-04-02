---
outline: false
---

# Agent & AI Documentation

Use these resources to feed nostr-core documentation into your AI agent, LLM, or coding assistant.

## Agent Integration

Ready-made files for AI agents to discover, understand, and integrate with nostr-core:

| File | Description |
|------|-------------|
| [`/llms.txt`](/llms.txt) | Discovery index - structured overview of all docs, following the [llms.txt standard](https://llmstxt.org/) |
| [`AGENT_README.md`](https://github.com/nostr-core-org/nostr-core/blob/main/AGENT_README.md) | Full integration guide - every method with request/response examples, error handling, agent tips |
| [`integration-prompt.md`](https://github.com/nostr-core-org/nostr-core/blob/main/docs/llm/integration-prompt.md) | Copy-paste system prompt and code templates for wiring agents to nostr-core |

## Quick Copy

Copy the full documentation as a single markdown file to paste into your LLM context:

<a href="/llms-full.txt" target="_blank" style="display:inline-block;padding:10px 20px;background:var(--vp-c-brand-1);color:var(--vp-c-white);border-radius:8px;text-decoration:none;font-weight:600;margin:8px 0;">Open llms-full.txt</a>

## Machine-Readable Index

The `llms.txt` file provides a structured index of all documentation pages:

<a href="/llms.txt" target="_blank" style="display:inline-block;padding:10px 20px;background:var(--vp-c-brand-1);color:var(--vp-c-white);border-radius:8px;text-decoration:none;font-weight:600;margin:8px 0;">Open llms.txt</a>

## What's Included

| File | Size | Description |
|------|------|-------------|
| [`/llms.txt`](/llms.txt) | ~1 KB | Structured index with page descriptions - point your agent here first |
| [`/llms-full.txt`](/llms-full.txt) | ~25 KB | Complete documentation in a single file - all guides + full API reference |
| [`AGENT_README.md`](https://github.com/nostr-core-org/nostr-core/blob/main/AGENT_README.md) | ~8 KB | Agent integration guide with examples and error tables |
| [`integration-prompt.md`](https://github.com/nostr-core-org/nostr-core/blob/main/docs/llm/integration-prompt.md) | ~6 KB | System prompt, code templates, MCP config, validation checklist |

## Usage with AI Tools

### Claude / ChatGPT / Cursor / Copilot

1. Open [`/llms-full.txt`](/llms-full.txt)
2. Select all and copy (`Ctrl+A`, `Ctrl+C`)
3. Paste into your AI chat or attach as context

### Agents & Automated Tools

Point your agent to fetch:

```
https://your-docs-site.com/llms.txt
```

The `llms.txt` file links to all documentation pages so agents can fetch only what they need.

### Claude Code / Aider / Other CLI Tools

```sh
curl -s https://your-docs-site.com/llms-full.txt | pbcopy
# Full docs are now in your clipboard
```

## Signer Abstraction (NIP-07 & NIP-46)

nostr-core provides a unified `Signer` interface for delegating event signing to different backends:

| Signer | Description |
|--------|-------------|
| `createSecretKeySigner(sk)` | Sign with a raw secret key |
| `Nip07Signer` | Delegate to a browser extension (`window.nostr`) |
| `NostrConnect` | Remote signing via NIP-46 (`nostrconnect://` URI) |

All three implement the same `Signer` interface (`getPublicKey()`, `signEvent()`, optional `nip04`, optional `getRelays()`), making them interchangeable in application code.

See the API docs for [Signer](/api/signer), [NIP-07](/api/nip07), and [NIP-46](/api/nip46).

## eCash Wallets (NIP-60)

nostr-core supports Cashu eCash wallets stored on Nostr:

| Module | Description |
|--------|-------------|
| `nip60` | Cashu wallet management - wallet metadata, token proof storage, spending history, quote tracking |

All wallet data is NIP-44 encrypted to self. See the API docs for [NIP-60](/api/nip60).

## BOLT-11 Invoice Decoding

Decode Lightning invoices to extract amount, payment hash, description, expiry, route hints, and payee node key:

| Module | Description |
|--------|-------------|
| `bolt11` | BOLT-11 decoder - supports mainnet/testnet/signet/regtest, uppercase QR codes, lightning: URIs |

See the API docs for [BOLT-11](/api/bolt11).

## Blossom Media (NIP-B7)

Upload, download, and manage media on content-addressable Blossom servers:

| Module | Description |
|--------|-------------|
| `blossom` | Full Blossom client - server lists (BUD-03), auth tokens (BUD-11), upload/download/delete/list/mirror |

See the API docs for [Blossom](/api/blossom).

## Private Messaging (NIP-59 & NIP-17)

nostr-core supports multi-layer encrypted messaging:

| Module | Description |
|--------|-------------|
| `nip59` | Gift Wrap - wraps events in 3 encryption layers (rumor → seal → gift wrap) to hide sender identity |
| `nip17` | Private DMs - end-to-end encrypted direct messages with sender anonymity, built on NIP-59 |

See the API docs for [NIP-59](/api/nip59) and [NIP-17](/api/nip17).

## Claude Code Plugin

nostr-core is also available as a **Claude Code plugin** with 10 agent skills for building Lightning-enabled applications:

| Skill | Command | Description |
|-------|---------|-------------|
| Navigate Nostr | `/navigate-nostr` | Find the right NIPs, LNURL LUDs, Cashu NUTs, Blossom BUDs, and map them to nostr-core modules |
| Nostr Identity | `/nostr-identity` | Generate keypairs, derive from mnemonic, verify NIP-05, set up signers (NIP-07, NIP-46) |
| Nostr Messaging | `/nostr-messaging` | Private DMs (NIP-17), public notes, channels (NIP-28), groups (NIP-29), subscriptions |
| Nostr Social | `/nostr-social` | Threads, reactions, reposts, articles, follows, badges, calendar, zaps, moderation |
| Lightning Agent | `/lightning-agent` | Copy-paste agent class with wallet, messaging, identity, and payments |
| LNbits MCP | `/lnbits-mcp` | Connect to LNbits via NWC + MCP Server for conversational wallet control |
| NWC Integration | `/nwc-integrate` | Set up nostr-core and connect to any NWC wallet |
| Lightning Payments | `/lightning-pay` | Pay invoices, Lightning Addresses, fiat, and keysend |
| Wallet Monitor | `/wallet-monitor` | Real-time notifications, transaction history, analytics |
| Nostr Primitives | `/nostr-primitives` | Low-level keys, events, relays, encryption, encoding |

### Install the plugin

```
/plugin install nostr-core-org/nostr-core
```

See the [Skills documentation](/skills) for full details and usage examples.
