<p align="center">
  <img src="/headers/blog-01-what-nostr-core-actually-is.svg" alt="What nostr-core Actually Is" width="100%">
</p>

# What nostr-core Actually Is

**You want to build on Nostr. You don't want to fight the protocol to get there.**

---

## The Problem Is Familiar

You've seen Nostr. You like the idea: decentralized social, payments over Lightning, identity without platforms. You want to build something.

So you look at the ecosystem. There are libraries, but they tend to fall into two camps: minimal utilities that leave you wiring things together yourself, or vendor-specific SDKs that come with someone else's opinions baked in.

You just want the protocol. All of it. In one package. With types.

## That's nostr-core

nostr-core is a JavaScript/TypeScript toolkit that implements 48 NIPs in a single package. Core protocol, encryption, encoding, social features, payments, identity, calendar events, badges, moderation. It's all there.

One install. One import. The protocol is ready to use.

```ts
import { NWC, nip19, finalizeEvent, Relay } from 'nostr-core'
```

That gives you wallet payments, bech32 encoding, event signing, and relay connections. No glue code. No adapter packages. No "install these seven other things first."

## Who It's For

Developers building Nostr applications. That's broad on purpose.

If you're building a social client, you need events, reactions, reposts, threads, long-form content, encrypted DMs, relay management. nostr-core has all of that.

If you're building a payment flow, you need NWC, Lightning addresses, zaps, invoices, fiat conversion. nostr-core has all of that too.

If you're building something weird that touches badges and calendar events and proof of work? Still covered.

The point is: whatever combination of NIPs your app needs, they're already here, already typed, already working together.

## What It's Built On

The cryptography comes from Paul Miller's noble libraries, the same audited primitives the wider Bitcoin ecosystem trusts. secp256k1, schnorr signatures, SHA-256, ChaCha20, AES-CBC. Peer-reviewed, minimal, no surprises.

The rest is protocol implementation. Each NIP is its own module, but they share types and compose naturally. NIP-59 gift wrapping uses NIP-44 encryption. NIP-57 zaps use events and relays. Everything connects because it was designed to.

## What It Doesn't Do

nostr-core is headless. No UI components, no framework bindings, no opinions about how your app should look or work. It gives you the protocol layer and gets out of the way.

It also doesn't phone home, require API keys, or depend on any specific service. It connects to whatever relays you point it at, signs with whatever keys you give it, and talks to whatever NWC wallet you configure.

If your app needs React components or a specific hosting platform, that's your call. nostr-core just handles the Nostr part.

## The Shape of the API

The high-level entry point is the `NWC` class. One connection string, and you have a working wallet interface. Pay invoices, create invoices, check balances, listen for payments.

Below that, everything is exported as building blocks. Key generation, event signing, relay connections, encryption, encoding. Use the high-level class or reach for the primitives directly. Both paths are supported and typed.

```ts
// High level
const nwc = new NWC('nostr+walletconnect://...')
await nwc.connect()
await nwc.payInvoice('lnbc...')

// Low level
const sk = generateSecretKey()
const event = finalizeEvent({ kind: 1, content: 'hello', ... }, sk)
```

## Try It

```sh
npm install nostr-core
```

Node 18+, Deno, Bun, Cloudflare Workers. ESM-only, tree-shakeable, fully typed.

Read the code, check the types, build something. The protocol is ready when you are.

---

**[GitHub](https://github.com/nostr-core-org/nostr-core)** · **[Demo](https://nostr-core-demo.netlify.app/)**
