# NIP-59

Gift Wrap - wraps any Nostr event in multiple encryption layers to hide sender identity and metadata. Used by [NIP-17](/api/nip17) for private direct messages.

## Import

```ts
import { nip59 } from 'nostr-core'
// or import individual functions
import { createRumor, createSeal, createWrap, unwrap } from 'nostr-core'
```

## Rumor Type

```ts
type Rumor = {
  id: string
  kind: number
  tags: string[][]
  content: string
  created_at: number
  pubkey: string
}
```

An unsigned event. Has an `id` (hash) but no `sig`, providing sender deniability.

## nip59.createRumor

```ts
function createRumor(event: EventTemplate, senderPubkey: string): Rumor
```

Creates an unsigned event (rumor) with a computed id.

| Parameter | Type | Description |
|-----------|------|-------------|
| `event` | `EventTemplate` | Event template (kind, tags, content, created_at) |
| `senderPubkey` | `string` | Sender's public key (64-char hex) |

**Returns:** `Rumor` - unsigned event with id.

```ts
const rumor = nip59.createRumor(
  {
    kind: 14,
    tags: [['p', recipientPubkey]],
    content: 'Hello!',
    created_at: Math.floor(Date.now() / 1000),
  },
  senderPubkey,
)
```

## nip59.createSeal

```ts
function createSeal(
  rumor: Rumor,
  senderSecretKey: Uint8Array,
  recipientPubkey: string
): NostrEvent
```

Encrypts a rumor into a kind 13 seal using NIP-44. The seal is signed by the sender, has empty tags, and a randomized timestamp (up to 2 days in the past).

| Parameter | Type | Description |
|-----------|------|-------------|
| `rumor` | `Rumor` | The unsigned event to seal |
| `senderSecretKey` | `Uint8Array` | Sender's secret key (32 bytes) |
| `recipientPubkey` | `string` | Recipient's public key (64-char hex) |

**Returns:** `NostrEvent` - signed kind 13 event.

```ts
const seal = nip59.createSeal(rumor, senderSecretKey, recipientPubkey)
```

## nip59.createWrap

```ts
function createWrap(seal: NostrEvent, recipientPubkey: string): NostrEvent
```

Wraps a seal in a kind 1059 gift wrap using a random ephemeral keypair. The wrap is encrypted with NIP-44 using the ephemeral key, has a `['p', recipientPubkey]` tag for relay routing, and a randomized timestamp.

| Parameter | Type | Description |
|-----------|------|-------------|
| `seal` | `NostrEvent` | The kind 13 seal to wrap |
| `recipientPubkey` | `string` | Recipient's public key (64-char hex) |

**Returns:** `NostrEvent` - signed kind 1059 event (signed by the ephemeral key).

```ts
const wrap = nip59.createWrap(seal, recipientPubkey)
// wrap.pubkey is the ephemeral key - sender identity is hidden
```

## nip59.unwrap

```ts
function unwrap(wrap: NostrEvent, recipientSecretKey: Uint8Array): Rumor
```

Unwraps a gift wrap to recover the original rumor. Decrypts the wrap, verifies the seal signature, decrypts the seal, and validates that `seal.pubkey === rumor.pubkey` to prevent impersonation.

| Parameter | Type | Description |
|-----------|------|-------------|
| `wrap` | `NostrEvent` | The kind 1059 gift wrap event |
| `recipientSecretKey` | `Uint8Array` | Recipient's secret key (32 bytes) |

**Returns:** `Rumor` - the original unsigned event.

**Throws:** `Error` on:
- Wrong event kind
- Seal signature verification failure
- Decryption failure
- Pubkey mismatch between seal and rumor (impersonation attempt)

```ts
const rumor = nip59.unwrap(giftWrap, recipientSecretKey)
console.log(rumor.pubkey)  // real sender
console.log(rumor.content) // decrypted content
```

## How It Works

Three layers protect metadata:

1. **Rumor** - the actual content, unsigned (deniability)
2. **Seal** (kind 13) - encrypts the rumor with NIP-44 using `sender + recipient` keys, signed by sender, empty tags, randomized timestamp
3. **Gift Wrap** (kind 1059) - encrypts the seal with NIP-44 using `ephemeral + recipient` keys, signed by ephemeral key, `p` tag for routing

Relays and observers only see the ephemeral pubkey and the recipient - they cannot determine the real sender or read the content.
