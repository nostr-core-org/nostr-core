---
date: 2026-08-17T21:00:00+02:00
---

<p align="center">
  <img src="/headers/blog-15-nutzaps.svg" alt="The Zap That Is Already Money" width="100%">
</p>

# The Zap That Is Already Money

**No invoice. No callback. No receipt to take on faith. The event carries the cash.**

---

## A Zap Is a Promise

Walk through what actually happens when someone zaps you 21 sats. Their client asks your lightning address for an invoice. That means an LNURL server, run by you or more likely by your custodial wallet, has to be online and answering at that exact moment. Their wallet pays the invoice. Then that same server writes a kind 9735 receipt, publishes it, and every client on the network treats the receipt as proof.

The money moved over Lightning. The proof is a signed statement from a server. Those are two different things, and the gap between them is trust. If the wallet provider miscounts, backdates, or simply invents receipts, the zap totals under a note are fiction. Most days everything is fine. But a zap remains a promise that a payment happened somewhere else.

There is a second cost that creators feel more than anyone: the whole flow depends on your infrastructure being up when the sender presses the button. Custodian down for maintenance at the moment your note takes off? Those tips just don't happen.

## The Nutzap Flips It

NIP-61 puts the payment inside the event. A nutzap is a kind 9321 note carrying Cashu proofs: ecash minted at a mint you said you trust, locked to a key only you control. Whoever sees the event sees the money. There is no receipt to check against the payment, because there is no gap between them. The payment is the receipt.

Your half of the deal is one published event, kind 10019, telling the world how to pay you:

```ts
import { nip61 } from 'nostr-core'

const info = nip61.createNutzapInfoEvent({
  relays: ['wss://relay.example.com'],
  mints: [{ url: 'https://stablenut.umint.cash', units: ['sat'] }],
  p2pkPubkey: walletPubkey,   // the NIP-60 wallet key, never your identity key
}, secretKey)
```

One detail that matters and that we made hard to get wrong: the lock key comes from your NIP-60 wallet event, not from your Nostr identity. Cashu wants 33-byte keys where Nostr uses 32, so `toP2PKLockKey` adds the required prefix for you, and it's idempotent if the key already has one.

## Sending One

The sender reads your kind 10019, mints proofs at one of your listed mints with the Cashu library of their choice, locks them to your key, and publishes to the relays you named:

```ts
const [infoEvent] = await pool.querySync(relays, nip61.getNutzapInfoFilter(bobPubkey))
const info = nip61.parseNutzapInfo(infoEvent)

const proofs = await mintP2PKLocked(info.mints[0].url, 21, info.p2pkPubkey)

await pool.publish(info.relays, nip61.createNutzapEvent({
  proofs,
  mint: info.mints[0].url,
  recipient: bobPubkey,
  eventId: likedNoteId,
  eventKind: 1,
  content: 'great post',
}, senderSecretKey))
```

nostr-core does the protocol part: the events, the tags, the key handling. Minting and swapping stay in your Cashu library, where they belong.

## Verify Before You Thank

Because the money travels in the event, anyone can audit a nutzap offline. `verifyNutzap` checks that the proofs come from a mint you actually listed, that every proof is P2PK-locked to your published key, and that the event names you as the recipient:

```ts
const { valid, errors } = nip61.verifyNutzap(nutzap, info, myPubkey)
```

A proof with a plain secret is spendable by anyone, so it never counts as valid. The one check that needs the mint's keyset, DLEQ verification, belongs to your Cashu library. Run it before treating a nutzap as spendable.

## Claim Once, Not Twice

Sweeping a nutzap into your wallet is a swap at the mint, and the same token must never be swapped twice. So every redemption gets recorded as a kind 7376 history event: the claimed nutzap id in plaintext, the amounts encrypted to yourself. On startup, `getRedeemedNutzapIds` tells you what's already claimed, and the newest history timestamp becomes the `since` for your next query. Publish the redemption to the sender's relays too. That is how their client shows the tip landed.

## For the People Running the Numbers

A zap needs the recipient's Lightning stack online at send time. A nutzap needs a relay. For a creator, that is a tip jar with no uptime requirement. For an agent, it means getting paid without owning any Lightning infrastructure at all: a NIP-60 wallet is just encrypted events, and incoming money is just more events to parse.

The honest trade: you are trusting the mints you list. Choose them with care, and cap what sits in any one of them. How to choose them well is its own story, and NIP-87 has an answer.

A zap was applause with a receipt stapled to it. A nutzap is the coin itself, sitting in your feed, locked so only you can pick it up.

---

**[GitHub](https://github.com/nostr-core-org/nostr-core)** · **[NIP-61 API](/api/nip61)** · **[NIP-60 Wallet](/api/nip60)**
