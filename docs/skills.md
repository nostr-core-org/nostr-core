---
outline: deep
---

# Agent Skills (Claude Code Plugin)

nostr-core ships as a **Claude Code plugin** with 4 agent skills that teach AI agents how to build Lightning-enabled applications. Skills can be invoked manually via slash commands or auto-detected by Claude based on context.

## Installing the Plugin

### From GitHub

```
/plugin install nostr-core-org/nostr-core
```

### From a local clone

If you've cloned the repository, the skills are available automatically when you open the project in Claude Code.

### For your team

Add to your project's `.claude/settings.json`:

```json
{
  "enabledPlugins": {
    "nostr-core": true
  }
}
```

## Available Skills

### `/nwc-integrate` - NWC Wallet Integration

Set up a project with nostr-core and connect to any NWC-compatible Lightning wallet. Covers:

- Package installation and ESM configuration
- Connection string handling and security
- Connect/operate/close lifecycle
- Capability detection via `getInfo()`
- Error handling scaffold with typed errors
- TypeScript types for full type safety

```
/nwc-integrate payment bot for my Discord server
```

---

### `/lightning-pay` - Lightning Payments

Execute all types of Lightning payments. Covers:

- Pay BOLT-11 invoices (`payInvoice`)
- Pay Lightning Addresses in sats (`payLightningAddress`)
- Pay Lightning Addresses in fiat (`payLightningAddressFiat`)
- Keysend payments with TLV records (`payKeysend`)
- Pre-payment balance and budget checks
- User confirmation patterns
- Payment error handling

```
/lightning-pay lnbc10u1pj...
/lightning-pay hello@getalby.com 100 sats
```

---

### `/wallet-monitor` - Wallet Monitoring & Analytics

Monitor wallet activity and analyze transaction history. Covers:

- Create invoices for receiving payments (`makeInvoice`)
- Check invoice status (`lookupInvoice`)
- Query and filter transaction history (`listTransactions`)
- Real-time payment notifications (event emitter + subscription patterns)
- Message signing (`signMessage`)
- Analytics patterns (daily summaries, fiat conversion, payment frequency)

```
/wallet-monitor listen
/wallet-monitor history last 7 days
/wallet-monitor create-invoice 1000 sats
```

---

### `/nostr-primitives` - Nostr Protocol Building Blocks

Comprehensive Nostr protocol toolkit (39 NIPs) for custom application development. Covers:

- Key generation, management, and BIP-39 mnemonic derivation (NIP-06)
- Event creation, signing, and verification
- Unified `Signer` interface (`createSecretKeySigner`, `Nip07Signer`, `NostrConnect`)
- Browser extension signing (NIP-07) via `window.nostr`
- Remote signing (NIP-46) via Nostr Connect
- Relay connections (single + pool), relay info (NIP-11), relay auth (NIP-42)
- NIP-04 and NIP-44 encryption
- NIP-59 gift wrapping (multi-layer metadata protection)
- NIP-65 relay list metadata (user relay preferences for read/write routing)
- NIP-17 private direct messages (end-to-end encrypted DMs)
- NIP-19 bech32 encoding/decoding, NIP-21 nostr: URI scheme
- Follow list / contact list (NIP-02)
- DNS-based verification (NIP-05)
- Event deletion (NIP-09), reactions (NIP-25), threads (NIP-10)
- Proof of work (NIP-13), reposts (NIP-18)
- Comments (NIP-22), long-form content (NIP-23), extra metadata (NIP-24)
- Text note references (NIP-27), public chat channels (NIP-28), custom emoji (NIP-30), alt tags (NIP-31)
- Content warnings (NIP-36), expiration timestamps (NIP-40)
- Proxy tags for bridged events (NIP-48), search (NIP-50)
- Lists with encrypted private items (NIP-51)
- Reporting (NIP-56), Lightning zaps (NIP-57), badges (NIP-58)
- Calendar events, calendars, RSVP (NIP-52)
- Relay-based groups (NIP-29)
- Zap goals with beneficiaries (NIP-75)
- HTTP authentication (NIP-98)
- LNURL protocol (LUD-01/03/06/09/10/12/17/18/20/21) - encoding, pay requests, withdraw requests, success actions
- Event filtering and matching
- NWC protocol internals

```
/nostr-primitives keys
/nostr-primitives encryption
/nostr-primitives giftwrap
/nostr-primitives relaylist
/nostr-primitives dm
/nostr-primitives relays
/nostr-primitives signer
/nostr-primitives nip07
/nostr-primitives nip46
/nostr-primitives deletion
/nostr-primitives threads
/nostr-primitives reactions
/nostr-primitives comments
/nostr-primitives articles
/nostr-primitives lists
/nostr-primitives zaps
/nostr-primitives badges
/nostr-primitives groups
/nostr-primitives dns
/nostr-primitives auth
/nostr-primitives emoji
/nostr-primitives uri
/nostr-primitives follows
/nostr-primitives pow
/nostr-primitives repost
/nostr-primitives channels
/nostr-primitives content-warning
/nostr-primitives expiration
/nostr-primitives proxy
/nostr-primitives search
/nostr-primitives report
/nostr-primitives calendars
/nostr-primitives zapgoals
/nostr-primitives lnurl
/nostr-primitives lnurl-pay
/nostr-primitives lnurl-withdraw
```

## How Skills Work

**Automatic invocation:** Claude reads the skill descriptions and loads them automatically when relevant. For example, if you ask "help me connect to a Lightning wallet", Claude will load the `nwc-integrate` skill.

**Manual invocation:** Type `/skill-name` followed by optional arguments:

```
/lightning-pay send 500 sats to hello@getalby.com
```

**Skill chaining:** Skills build on each other. Start with `/nwc-integrate` to set up the connection, then use `/lightning-pay` or `/wallet-monitor` for specific operations. Use `/nostr-primitives` only when building custom Nostr applications beyond NWC.

## Publishing Your Own Marketplace

To distribute these skills via a marketplace:

1. Fork or reference the `nostr-core-org/nostr-core` repository
2. Users add it with: `/plugin install nostr-core-org/nostr-core`
3. Or create a marketplace `marketplace.json` that includes this plugin

See the [Claude Code plugin docs](https://code.claude.com/docs/en/plugins) for details.
