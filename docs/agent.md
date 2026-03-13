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

## Private Messaging (NIP-59 & NIP-17)

nostr-core supports multi-layer encrypted messaging:

| Module | Description |
|--------|-------------|
| `nip59` | Gift Wrap - wraps events in 3 encryption layers (rumor → seal → gift wrap) to hide sender identity |
| `nip17` | Private DMs - end-to-end encrypted direct messages with sender anonymity, built on NIP-59 |

See the API docs for [NIP-59](/api/nip59) and [NIP-17](/api/nip17).

## Claude Code Plugin

nostr-core is also available as a **Claude Code plugin** with 4 agent skills for building Lightning-enabled applications:

| Skill | Command | Description |
|-------|---------|-------------|
| NWC Integration | `/nwc-integrate` | Set up nostr-core and connect to any NWC wallet |
| Lightning Payments | `/lightning-pay` | Pay invoices, Lightning Addresses, fiat, and keysend |
| Wallet Monitor | `/wallet-monitor` | Real-time notifications, transaction history, analytics |
| Nostr Primitives | `/nostr-primitives` | Low-level keys, events, relays, encryption, encoding |

### Install the plugin

```
/plugin install nostr-core-org/nostr-core
```

See the [Skills documentation](/skills) for full details and usage examples.
