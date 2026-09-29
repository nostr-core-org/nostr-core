---
date: 2026-08-17T21:00:00+02:00
---

<p align="center">
  <img src="/headers/blog-19-app-data.svg" alt="Your Settings Follow Your Keys" width="100%">
</p>

# Your Settings Follow Your Keys

**Kind 30078 turns relays into a personal database. Preferences on every device, no account system.**

---

## Every App Grows a Backend

It starts with one support message: "why are my muted words not on my laptop?" Your Nostr client is beautifully serverless, keys in the user's hands, events on relays. And then theme choices, muted words, draft state, and column layouts pile up in local storage, chained to one browser on one machine.

So you do what every app eventually does. You stand up a little sync service. Which needs accounts. Which needs auth, and backups, and a privacy policy, and a monthly bill. All of it to move a JSON blob between two devices owned by the same person, for an app whose entire point was not having a backend.

NIP-78 is the escape hatch: the user already has an identity and already has relays. Let their settings live where their events do.

## One Document, One Event

Kind 30078 is addressable app data. The `d` tag names your document, conventionally `<app>/<context>` so apps stay out of each other's way, and the newest event wins. For anything private there is an encrypted variant, NIP-44 to yourself:

```ts
import { nip78 } from 'nostr-core'

// Save
await pool.publish(relays, nip78.createEncryptedAppDataJsonEvent(
  'my-app/prefs',
  { theme: 'dark', locale: 'en', mutedWords: ['pump', 'airdrop'] },
  secretKey,
))

// Load, on any device holding the same keys
const events = await pool.querySync(relays, nip78.getAppDataFilter(pubkey, 'my-app/prefs'))
const newest = events.sort((a, b) => b.created_at - a.created_at)[0]
const prefs = newest ? nip78.parseEncryptedAppDataJson(newest, secretKey) : defaults
```

That is the whole sync engine. Save is a publish, load is a query, conflict resolution is "newest wins", and the account system is the keypair the user walked in with.

## The Relay Sees Only the Label

With the encrypted variant, the content is opaque ciphertext. The one thing that stays public is the `d` tag itself, and that deserves a moment of thought. `mail/folders` is a fine label. `mail/folders/alice@example.com` is a data leak wearing a label's clothes. Name your documents like the filenames are public, because they are.

## Not Everything Is a Setting

Two boundaries worth knowing. For append-only data, logs, entries, anything where replacing would destroy history, kind 78 is the regular-event sibling: publish many, tag them your own way. And for data other apps should understand, follow lists, mute lists, bookmarks, use the standardized NIP-51 lists instead. Kind 30078 is deliberately unstandardized, a private drawer rather than a shared shelf. That is its weakness across apps and exactly its strength within yours.

The best backend is the one you never built, never secured, and never got paged about. Your users' settings can follow their keys instead.

---

**[GitHub](https://github.com/nostr-core-org/nostr-core)** · **[NIP-78 API](/api/nip78)** · **[NIP-44 Encryption](/api/nip44)**
