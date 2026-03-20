<p align="center">
  <img src="/headers/blog-03-build-a-nostr-client.svg" alt="Build a Nostr Client From Scratch" width="100%">
</p>

# Build a Nostr Client From Scratch

**Everything you need for a social client lives in one import. Keys, events, relays, encryption, threads, reactions. All typed, all ready.**

---

## Start With Keys

Every Nostr identity is a keypair. nostr-core generates them from audited cryptography:

```ts
import { generateSecretKey, getPublicKey } from 'nostr-core'

const sk = generateSecretKey()
const pk = getPublicKey(sk)
```

That's your user. The secret key signs events. The public key is their identity. No accounts, no registration, no server.

If you want human-readable identifiers, NIP-19 encoding is built in:

```ts
import { nip19 } from 'nostr-core'

const npub = nip19.npubEncode(pk)   // npub1...
const nsec = nip19.nsecEncode(sk)   // nsec1...
```

For users who want to import from a mnemonic phrase, NIP-06 handles BIP-39 derivation. For browser extensions, NIP-07 provides a signer interface that never exposes the private key to your app.

## Connect to Relays

Nostr is a relay network. Your client needs to talk to relays to publish and receive events.

```ts
import { Relay, RelayPool } from 'nostr-core'

// Single relay
const relay = new Relay('wss://relay.damus.io')
await relay.connect()

// Or a pool of relays
const pool = new RelayPool(['wss://relay.damus.io', 'wss://nos.lol'])
```

Publish events, subscribe to filters, handle connections. The relay abstraction manages the WebSocket lifecycle so you can focus on your application logic.

## Sign and Publish Events

Events are the atoms of Nostr. A social post is a kind-1 event. A reaction is kind-7. A repost is kind-6. nostr-core gives you typed event creation for all of them.

```ts
import { finalizeEvent } from 'nostr-core'

const event = finalizeEvent({
  kind: 1,
  content: 'Hello from nostr-core',
  created_at: Math.floor(Date.now() / 1000),
  tags: [],
}, sk)
```

`finalizeEvent` signs the event, computes the hash, and returns a complete, valid Nostr event ready to publish.

## Threads and Mentions

Social apps need threading. NIP-10 defines how replies reference parent events:

```ts
import { nip10 } from 'nostr-core'

// Parse thread references from an event
const refs = nip10.parse(event)
// refs.root - the top-level event
// refs.reply - the immediate parent
// refs.mentions - other referenced events
```

Build reply chains, render conversation trees, show quoted posts. The tag parsing is handled for you.

## Reactions and Reposts

NIP-25 reactions let users respond to content:

```ts
import { nip25 } from 'nostr-core'

const reaction = nip25.createReaction(originalEvent, '+')
const signed = finalizeEvent(reaction, sk)
```

NIP-18 reposts work the same way: create the event template, sign it, publish it. The NIP modules give you correctly structured events every time.

## Encrypted Messages

Private messaging is where nostr-core's encryption stack comes together. NIP-17 provides fully sealed, metadata-protected messages using gift wrapping:

```ts
import { nip17 } from 'nostr-core'

const wrapped = await nip17.wrapEvent(senderSk, recipientPk, 'secret message')
```

Under the hood, this uses NIP-44 encryption (ChaCha20-Poly1305) and NIP-59 gift wrapping to protect both the content and the metadata. The recipient unwraps it with their key. Relays see nothing useful.

For simpler use cases, NIP-04 encryption is also available, though NIP-44 is recommended for new applications.

## Long-Form Content

Building a blog platform or article reader? NIP-23 handles long-form content with metadata:

```ts
import { nip23 } from 'nostr-core'

const article = nip23.createArticle({
  title: 'My First Post',
  content: 'Full markdown content here...',
  summary: 'A brief summary',
  image: 'https://example.com/header.jpg',
  publishedAt: Math.floor(Date.now() / 1000),
  tags: ['nostr', 'development'],
  slug: 'my-first-post',
})
```

Titles, summaries, images, tags, slugs. Everything a publishing platform needs.

## Payments Built In

Your social client probably wants zaps. nostr-core's NWC class handles wallet integration:

```ts
import { NWC, nip57 } from 'nostr-core'

const nwc = new NWC('nostr+walletconnect://...')
await nwc.connect()

// Pay an invoice from a zap flow
await nwc.payInvoice(zapInvoice)
```

NIP-57 zap requests and receipts are also exported, so you can build the full zap UI: request creation, receipt verification, zap counts on posts.

## The Point

A Nostr client needs a lot of protocol pieces. Key management, relay connections, event signing, threading, reactions, encryption, payments. In most ecosystems, that's five or six different libraries with incompatible types and different release cycles.

With nostr-core, it's one package. The pieces are designed to work together because they were built together. Types flow through naturally. Modules compose without adapters.

You focus on what makes your client unique. nostr-core handles the protocol.

---

**Start building.** `npm install nostr-core` and go.

**[GitHub](https://github.com/nostr-core-org/nostr-core)** · **[Demo](https://nostr-core-demo.netlify.app/)**
