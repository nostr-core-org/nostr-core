<p align="center">
  <img src="/headers/blog-09-two-wallets.svg" alt="Two Wallets, One Protocol" width="100%">
</p>

# Two Wallets, One Protocol

**NIP-47 connects you to a remote wallet. NIP-60 carries one with you. Together they cover every payment scenario on Nostr.**

---

## Different Problems, Same Network

Payments on Nostr have two shapes.

Sometimes you need to talk to a wallet that lives somewhere else. Send a command, get a result. That's NIP-47. Nostr Wallet Connect.

Sometimes you need the wallet right here. Tokens you hold, ready to spend, no remote call. That's NIP-60. Ecash on Nostr.

These aren't competing approaches. They solve different things.

## NIP-47: The Remote Wallet

NWC is how you reach Lightning infrastructure you don't run yourself. A wallet provider, a self-hosted node, or a Cashu mint bridged through [NUTbits](https://github.com/DoktorShift/NUTbits). Your app sends requests over Nostr relays. The wallet executes them.

```ts
const nwc = new NWC('nostr+walletconnect://...')
await nwc.connect()
await nwc.payInvoice('lnbc...')
```

Pay invoices. Create invoices. Check balances. Listen for incoming payments. Lightning Address resolution and fiat conversion built in. The NWC class handles encryption negotiation, request matching, typed errors, the full NIP-47 surface.

NWC is powerful when the wallet needs to be always-on. Receiving zaps while you're offline. Routing payments through the Lightning Network. Connecting to infrastructure with liquidity you didn't have to manage.

## NIP-60: The Local Wallet

NIP-60 flips the model. The wallet lives in your Nostr identity. Ecash proofs stored as encrypted events on relays. Your keys decrypt them. Your client spends them.

```ts
import { nip60 } from 'nostr-core'

// Fetch wallet from relays
const filters = nip60.getWalletFilters(pubkey)

// Parse token events
const token = nip60.parseTokenEvent(event, secretKey)
const balance = nip60.getProofsBalance(token.proofs)

// Record a transaction
const history = nip60.createHistoryEvent(
  { direction: 'out', amount: '1000', unit: 'sat', events: [...] },
  secretKey
)
```

No remote service for basic operations. You hold bearer tokens. Spending means constructing a transaction with proofs you already have. The mint verifies and settles.

Switch clients. Switch devices. Log in with your Nostr key and your balance is there. The proofs live on relays, encrypted, waiting.

## Where Each One Fits

**NWC shines when:**
- You need Lightning Network access
- Your app delegates payment execution to infrastructure
- You need the wallet always-on for incoming payments
- You're integrating with services that speak BOLT-11

**NIP-60 shines when:**
- Payments should be portable across clients and devices
- Privacy matters (bearer tokens, blind signatures)
- You're building peer-to-peer transfers in a community
- The wallet should follow the user's identity, not a device

## Both at Once

The interesting part is an app that supports both.

A social client uses NIP-60 for quick transfers between users. Ecash tokens, instant, private, no Lightning routing. The same client uses NWC for receiving zaps from the wider network, paying invoices, bridging to Lightning.

Small payments stay local. Larger payments route through Lightning. The user just sends sats. The app picks the path.

A marketplace where buyers hold ecash in a NIP-60 wallet for instant checkout. But the seller receives via NWC into their Lightning node for settlement. Both wallets, one transaction, seamless.

And here's a nice detail: a Cashu mint operator running [NUTbits](https://github.com/DoktorShift/NUTbits) can serve both sides. NIP-60 users hold ecash from that mint directly. NWC users connect to the same mint through a NUTbits connection string. Same mint infrastructure, both wallet protocols, one operator.

## One Toolkit

nostr-core has both. The NWC class for remote wallet operations. The nip60 module for local ecash. Same types, same relay layer, same NIP-44 encryption stack underneath.

```ts
import { NWC, nip60 } from 'nostr-core'
```

That's two wallet primitives in one import. Build apps that use either or both.

---

**Remote and local. Lightning and ecash. Two wallets, one toolkit.**

**[GitHub](https://github.com/nostr-core-org/nostr-core)** · **[NUTbits](https://github.com/DoktorShift/NUTbits)**
