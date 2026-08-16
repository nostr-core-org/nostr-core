# NIP-61

Nutzaps - a nutzap is a P2PK-locked Cashu token in which the payment itself is the receipt. The sender mints ecash at a mint the recipient trusts, locks it to the recipient's published P2PK key, and publishes it as a kind 9321 event. Builds on [NIP-60](/api/nip60) for the wallet side.

## Import

```ts
import { nip61 } from 'nostr-core'
// or import individual functions
import {
  createNutzapInfoTemplate,
  createNutzapInfoEvent,
  parseNutzapInfo,
  createNutzapTemplate,
  createNutzapEvent,
  parseNutzap,
  getNutzapAmount,
  verifyNutzap,
  createNutzapRedemptionTemplate,
  createNutzapRedemptionEvent,
  parseNutzapRedemption,
  getRedeemedNutzapIds,
  toP2PKLockKey,
  fromP2PKLockKey,
  isSameLockKey,
  parseP2PKSecret,
  getProofLockKey,
  getNutzapFilter,
  getNutzapInfoFilter,
  getNutzapRedemptionFilter,
  NUTZAP_INFO_KIND,
  NUTZAP_KIND,
  NUTZAP_HISTORY_KIND,
  DEFAULT_NUTZAP_UNIT,
} from 'nostr-core'
```

## Event Kinds

| Constant | Value | Description |
|----------|-------|-------------|
| `NUTZAP_INFO_KIND` | `10019` | How to send this user ecash (replaceable) |
| `NUTZAP_KIND` | `9321` | The nutzap itself |
| `NUTZAP_HISTORY_KIND` | `7376` | NIP-60 spending history, reused for redemptions |
| `DEFAULT_NUTZAP_UNIT` | `'sat'` | Assumed base unit when the `unit` tag is absent |

## P2PK Keys

Cashu P2PK uses 33-byte compressed public keys; Nostr uses 32-byte x-only keys. NIP-61 requires clients to prefix with `02`.

::: warning
The P2PK key is the `privkey` from the user's NIP-60 wallet event - **never** their Nostr identity key.
:::

### toP2PKLockKey

```ts
function toP2PKLockKey(pubkey: string): string
```

Adds the `02` prefix. Idempotent - already-prefixed keys pass through unchanged.

```ts
nip61.toP2PKLockKey('e9fbced3...f991')
// '02e9fbced3...f991'  (66 hex chars)
```

### fromP2PKLockKey

```ts
function fromP2PKLockKey(lockKey: string): string
```

Strips the prefix, returning the 32-byte x-only key.

### isSameLockKey

```ts
function isSameLockKey(a: string, b: string): boolean
```

Compares two keys ignoring prefix and case.

### parseP2PKSecret / getProofLockKey

```ts
function parseP2PKSecret(secret: string): P2PKSecret | undefined
function getProofLockKey(proof: CashuProof): string | undefined
```

Reads the NUT-10 spending condition out of a proof. Returns `undefined` for plain secrets - which are spendable by anyone and so never a valid nutzap.

```ts
type P2PKSecret = {
  nonce: string
  data: string   // the locked-to key, 33-byte compressed hex
  tags?: string[][]
}
```

## NutzapInfo Type (kind 10019)

```ts
type NutzapInfo = {
  relays: string[]
  mints: NutzapMint[]
  p2pkPubkey: string
  extraTags?: string[][]
}

type NutzapMint = {
  url: string
  units?: string[]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `relays` | `string[]` | Relays the user reads nutzaps from - senders must publish there |
| `mints` | `NutzapMint[]` | Mints the user agrees to receive on |
| `p2pkPubkey` | `string` | Key incoming nutzaps must be locked to |

### createNutzapInfoEvent

```ts
function createNutzapInfoTemplate(info: NutzapInfo): EventTemplate
function createNutzapInfoEvent(info: NutzapInfo, secretKey: Uint8Array): NostrEvent
function parseNutzapInfo(event: NostrEvent): NutzapInfo
```

```ts
const info = nip61.createNutzapInfoEvent({
  relays: ['wss://relay1', 'wss://relay2'],
  mints: [
    { url: 'https://stablenut.umint.cash', units: ['usd', 'sat'] },
    { url: 'https://mint2', units: ['sat'] },
  ],
  p2pkPubkey: walletPubkey,   // 02 prefix added for you
}, secretKey)
```

::: tip
Clients SHOULD steer users toward NUT-11 (P2PK) and NUT-12 (DLEQ) compatible mints, or they may receive nutzaps anyone can spend.
:::

## Nutzap Type (kind 9321)

```ts
type Nutzap = {
  proofs: CashuProof[]
  mint: string
  recipient: string
  unit?: string
  eventId?: string
  eventRelayHint?: string
  eventKind?: number
  content?: string
  extraTags?: string[][]
}
```

| Field | Tag | Description |
|-------|-----|-------------|
| `proofs` | `proof` | P2PK-locked proofs, one tag each, JSON encoded |
| `mint` | `u` | Mint URL, EXACTLY as listed in the recipient's kind 10019 |
| `recipient` | `p` | Recipient's Nostr identity pubkey |
| `unit` | `unit` | Base unit; defaults to `sat` |
| `eventId` | `e` | The event being nutzapped, with optional relay hint |
| `eventKind` | `k` | Kind of the nutzapped event |

### createNutzapEvent

```ts
function createNutzapTemplate(nutzap: Nutzap): EventTemplate
function createNutzapEvent(nutzap: Nutzap, secretKey: Uint8Array): NostrEvent
function parseNutzap(event: NostrEvent): ParsedNutzap
```

`parseNutzap` returns the nutzap plus the envelope fields: `sender`, `id`, `created_at`. Unparseable `proof` tags are skipped rather than throwing.

```ts
const nutzap = nip61.createNutzapEvent({
  proofs: [proof],
  mint: 'https://stablenut.umint.cash',
  recipient: bobPubkey,
  eventId: likedEventId,
  eventKind: 1,
  content: 'Thanks for this great idea.',
}, aliceSecretKey)
```

### getNutzapAmount

```ts
function getNutzapAmount(nutzap: Pick<Nutzap, 'proofs'>): number
```

Sums the proofs, in the nutzap's base unit.

## verifyNutzap

```ts
function verifyNutzap(
  nutzap: Nutzap | ParsedNutzap,
  info: NutzapInfo,
  recipientPubkey?: string,
): { valid: boolean; errors: string[] }
```

Checks everything an observer can check offline:

- the proofs come from a mint the recipient listed;
- every proof is P2PK-locked, and locked to the recipient's published key;
- the nutzap p-tags the expected recipient.

```ts
const { valid, errors } = nip61.verifyNutzap(nutzap, info, bobPubkey)
if (!valid) console.warn(errors)
```

::: warning DLEQ proofs
Local DLEQ verification (NUT-12) needs the mint's keyset and belongs to a Cashu library. `verifyNutzap` does not perform it - run it separately before treating a nutzap as spendable.
:::

## Redemption History

When a nutzap is claimed, record it so the same token is not swapped twice and the sender can see it landed.

```ts
type NutzapRedemption = {
  nutzapEventId: string
  nutzapRelayHint?: string
  senderPubkey: string
  amount: string
  unit?: string
  createdTokenEventId?: string
  createdTokenRelayHint?: string
}
```

```ts
function createNutzapRedemptionTemplate(r: NutzapRedemption, secretKey: Uint8Array): EventTemplate
function createNutzapRedemptionEvent(r: NutzapRedemption, secretKey: Uint8Array): NostrEvent
function parseNutzapRedemption(event: NostrEvent, secretKey: Uint8Array): NutzapRedemption
function getRedeemedNutzapIds(historyEvents: NostrEvent[]): Set<string>
```

The `redeemed` reference stays in plaintext tags alongside a `p` tag for the sender; the amount and the new token event are NIP-44 encrypted to self. `getRedeemedNutzapIds` reads only the plaintext part, so it needs no secret key.

::: tip
Publish redemption events to the **sender's** NIP-65 read relays so they see the ecash was claimed.
:::

## Filters

```ts
function getNutzapFilter(pubkey: string, mints: string[], since?: number): Filter
function getNutzapInfoFilter(pubkeys: string | string[]): Filter
function getNutzapRedemptionFilter(pubkey: string): Filter
```

```ts
const filter = nip61.getNutzapFilter(myPubkey, trustedMints, latestHistoryCreatedAt)
// { kinds: [9321], '#p': [myPubkey], '#u': trustedMints, since: ... }
```

::: warning
Always narrow by mint. Filtering with `#u` keeps the client from even interacting with mints the user never signalled.
:::

## Complete Flow

```ts
import { nip61, nip60, RelayPool } from 'nostr-core'

const pool = new RelayPool()

// --- Bob advertises how to pay him ---
await pool.publish(bobRelays, nip61.createNutzapInfoEvent({
  relays: bobRelays,
  mints: ['https://stablenut.umint.cash'].map(url => ({ url, units: ['sat'] })),
  p2pkPubkey: bobWalletPubkey,
}, bobSecretKey))

// --- Alice nutzaps Bob ---
const [infoEvent] = await pool.querySync(bobRelays, nip61.getNutzapInfoFilter(bobPubkey))
const info = nip61.parseNutzapInfo(infoEvent)

// Mint or swap proofs at info.mints[0].url, locked to info.p2pkPubkey,
// using your Cashu library of choice.
const proofs = await mintP2PKLocked(info.mints[0].url, 21, info.p2pkPubkey)

await pool.publish(info.relays, nip61.createNutzapEvent({
  proofs,
  mint: info.mints[0].url,
  recipient: bobPubkey,
  eventId: likedEventId,
  eventKind: 1,
  content: 'zap!',
}, aliceSecretKey))

// --- Bob claims it ---
const history = await pool.querySync(bobRelays, nip61.getNutzapRedemptionFilter(bobPubkey))
const alreadyClaimed = nip61.getRedeemedNutzapIds(history)
const since = Math.max(0, ...history.map(e => e.created_at))

const incoming = await pool.querySync(
  bobRelays,
  nip61.getNutzapFilter(bobPubkey, info.mints.map(m => m.url), since),
)

for (const event of incoming) {
  if (alreadyClaimed.has(event.id)) continue

  const nutzap = nip61.parseNutzap(event)
  const check = nip61.verifyNutzap(nutzap, info, bobPubkey)
  if (!check.valid) continue

  // Swap into Bob's own wallet, then record the redemption.
  const tokenEvent = await swapIntoWallet(nutzap)

  await pool.publish(senderReadRelays, nip61.createNutzapRedemptionEvent({
    nutzapEventId: event.id,
    senderPubkey: nutzap.sender,
    amount: String(nip61.getNutzapAmount(nutzap)),
    createdTokenEventId: tokenEvent.id,
  }, bobSecretKey))
}
```

## See Also

- [NIP-60](/api/nip60) - Cashu wallet storage
- [NIP-87](/api/nip87) - Discovering mints to trust
- [NIP-57](/api/nip57) - Lightning zaps
