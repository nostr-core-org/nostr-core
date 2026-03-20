<p align="center">
  <img src="/headers/blog-05-forty-eight-nips.svg" alt="Forty-Eight NIPs, One Import" width="100%">
</p>

# Forty-Eight NIPs, One Import

**Most Nostr libraries give you the basics. nostr-core gives you the protocol.**

---

## The NIP Problem

Every Nostr app starts simple. You need events, keys, and a relay connection. Any library can do that.

Then your app grows. You need encrypted DMs. You need zaps. You need relay list management. You need calendar events for that community feature someone requested. You need badge verification for that trust system you're building.

Each NIP is a separate capability. In most ecosystems, that means a separate dependency, or implementing it yourself from the spec. You end up with a patchwork of libraries at different versions with different conventions, or a growing folder of hand-rolled protocol code.

## One Package, Forty-Eight NIPs

nostr-core ships forty-eight NIP implementations in a single package. Not wrappers around other libraries. Not partial implementations. Complete, typed modules that work together.

Here's a sample of what's available by category:

**Core protocol:** NIP-01 events, NIP-02 contact lists, NIP-09 deletions, NIP-10 threads, NIP-13 proof of work, NIP-42 relay auth

**Identity:** NIP-05 DNS verification, NIP-06 mnemonic keys, NIP-07 browser extensions, NIP-19 bech32 encoding, NIP-46 remote signers

**Encryption:** NIP-04 (AES-CBC), NIP-44 (ChaCha20-Poly1305), NIP-59 gift wrapping, NIP-17 private messages

**Social:** NIP-18 reposts, NIP-22 comments, NIP-23 long-form content, NIP-25 reactions, NIP-27 text references, NIP-28 channels, NIP-29 groups

**Payments:** NIP-47 wallet connect, NIP-57 zaps, NIP-75 zap goals, Lightning addresses, LNURL, fiat conversion

**Lists & metadata:** NIP-24 extended metadata, NIP-30 custom emoji, NIP-31 alt text, NIP-36 content warnings, NIP-40 expiration, NIP-51 lists, NIP-65 relay lists

**Community:** NIP-52 calendar events, NIP-56 reporting, NIP-58 badges

**Infrastructure:** NIP-11 relay info, NIP-48 proxy, NIP-50 search, NIP-98 HTTP auth

Every module exports typed functions. Every function produces valid Nostr events. Every event works with the relay and signer abstractions in the same package.

## Why This Matters

**No version conflicts.** When NIP-57 zaps need NIP-01 events and NIP-19 encoding, they're all at the same version, built from the same types. No compatibility matrix to manage.

**Discoverability.** Need calendar events? It's `nip52`. Need badges? It's `nip58`. The naming is the NIP number. You don't search npm for "nostr calendar" and hope you find a maintained package.

**Composability.** NIPs reference each other constantly. Gift wrapping (NIP-59) uses encryption (NIP-44). Zaps (NIP-57) use events and encoding. Private lists (NIP-51) use encryption for private items. When these all live in one package, composition is natural, not an integration project.

**Tree-shaking.** ESM-only means your bundler only includes what you import. Using three NIPs? You ship three NIPs. The other forty-five don't touch your bundle.

## What "Protocol Complete" Means

It means you can build any Nostr application from a single dependency. A social client. A wallet. A relay management tool. A marketplace. A calendar app. A badge system. A community platform.

It also means when a new feature requires a NIP you haven't used yet, you don't go shopping for a new library. You add an import line.

```ts
// Today: social client
import { finalizeEvent, nip10, nip25, Relay } from 'nostr-core'

// Tomorrow: add zaps
import { finalizeEvent, nip10, nip25, nip57, NWC, Relay } from 'nostr-core'

// Next week: add calendar events
import { finalizeEvent, nip10, nip25, nip57, nip52, NWC, Relay } from 'nostr-core'
```

Same package. Same types. Same patterns. Your dependency list doesn't grow with your feature set.

## Not Every NIP Is Finished

Nostr is an evolving protocol. Some NIPs are stable and battle-tested. Others are newer, still being refined by the community. nostr-core tracks the specs as they develop.

If a NIP changes, nostr-core updates. One package to update, one changelog to read, one set of breaking changes to handle. That's simpler than tracking fifteen separate libraries.

## The Alternative

You could assemble your own stack. Pick a core library for events. Find a separate package for NIP-44 encryption. Another for NIP-19 encoding. Write your own NIP-52 calendar implementation because nobody published one. Hope they all use compatible types.

That works. People do it. But it's more work, more risk, and more maintenance for the same result.

Or you can install nostr-core and start building.

---

**Forty-eight NIPs. One package. Zero assembly required.**

**[GitHub](https://github.com/nostr-core-org/nostr-core)** · **[API Reference](https://github.com/nostr-core-org/nostr-core/tree/main/docs/api)**
