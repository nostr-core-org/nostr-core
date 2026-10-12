# NIP-17

Private Direct Messages - end-to-end encrypted DMs with sender anonymity. Built on [NIP-59 Gift Wrap](/api/nip59) and [NIP-44 encryption](/api/nip44).

## Import

```ts
import { nip17 } from 'nostr-core'
// or import individual functions
import { createMessage, unwrapMessage, wrapDirectMessage, unwrapDirectMessage } from 'nostr-core'
```

`createMessage` and `unwrapMessage` cover the full NIP-17 chat model: one wrap per receiver plus a copy for the sender, kind 14 messages, kind 15 file messages, kind 7 reactions, and disappearing messages. `wrapDirectMessage` and `unwrapDirectMessage` remain for the simple case of one kind 14 message to one recipient.

## DirectMessage Type

```ts
type DirectMessage = {
  sender: string
  content: string
  tags: string[][]
  created_at: number
  id: string
}
```

## Message Types

```ts
type MessageKind = 14 | 15 | 7

type MessageParams = {
  kind?: MessageKind          // default 14
  content: string
  tags?: string[][]
  recipients: string[]
  senderSecretKey: Uint8Array
  selfCopy?: boolean          // default true
  expiration?: number         // unix seconds (NIP-40)
}

type UnwrappedMessage = {
  kind: MessageKind
  sender: string
  rumor: Rumor
}
```

## nip17.createMessage

```ts
function createMessage(params: MessageParams): {
  rumor: Rumor
  wraps: { recipient: string; wrap: NostrEvent }[]
}
```

Creates one chat rumor and gift-wraps it individually for every receiver and, by default, for the sender. All copies share the rumor, so they have the same `id`. Each wrap is independent: its own seal, its own ephemeral key and its own randomized timestamps, so relays cannot link the copies.

| Parameter | Type | Description |
|-----------|------|-------------|
| `kind` | `14 \| 15 \| 7?` | `14` chat message (default), `15` file message, `7` reaction |
| `content` | `string` | Message text, file URL (kind 15) or reaction content (kind 7) |
| `tags` | `string[][]?` | Extra rumor tags: `['e', id]` for replies, `['subject', topic]`, file tags for kind 15, `e`/`k` for kind 7 |
| `recipients` | `string[]` | Receivers' public keys (hex). Each gets a `p` tag on the rumor |
| `senderSecretKey` | `Uint8Array` | Sender's secret key (32 bytes) |
| `selfCopy` | `boolean?` | Also wrap for the sender, so the message shows on their other devices and after a restore (default `true`) |
| `expiration` | `number?` | NIP-40 expiration in unix seconds, set on every gift wrap and seal (disappearing messages) |

**Returns:** `{ rumor, wraps }` - the shared rumor and one `{ recipient, wrap }` per copy: receivers in input order, the sender's copy last.

Recipients are deduplicated. The sender is wrapped at most once, by `selfCopy`, even when listed in `recipients` (listing only the sender makes a note to self).

**Throws:** `Error` when `recipients` is empty.

```ts
const { rumor, wraps } = nip17.createMessage({
  content: 'Hello both!',
  recipients: [bobPk, carolPk],
  senderSecretKey: aliceSk,
})
// wraps: [{ recipient: bobPk, wrap }, { recipient: carolPk, wrap }, { recipient: alicePk, wrap }]
for (const { recipient, wrap } of wraps) {
  // publish each wrap to that recipient's DM relays (kind 10050)
}
```

### File Messages

```ts
nip17.createMessage({
  kind: 15,
  content: 'https://files.example.com/9f2c...',
  tags: [
    ['file-type', 'image/jpeg'],
    ['encryption-algorithm', 'aes-gcm'],
    ['decryption-key', keyHex],
    ['decryption-nonce', nonceHex],
    ['x', sha256OfEncryptedFile],
  ],
  recipients: [bobPk],
  senderSecretKey: aliceSk,
})
```

### Reactions

```ts
nip17.createMessage({
  kind: 7,
  content: '+',
  tags: [['e', messageId], ['k', '14']],
  recipients: [bobPk],
  senderSecretKey: aliceSk,
})
```

### Disappearing Messages

```ts
nip17.createMessage({
  content: 'This one goes away in an hour',
  recipients: [bobPk],
  senderSecretKey: aliceSk,
  expiration: Math.floor(Date.now() / 1000) + 3600,
})
```

Every gift wrap and every seal gets `['expiration', '<unix seconds>']`; the rumor is unchanged. A receiver can read the value from the wrap with `nip40.getExpiration(wrap)`. To keep no copy for yourself, also pass `selfCopy: false`.

## nip17.unwrapMessage

```ts
function unwrapMessage(
  wrap: NostrEvent,
  recipientSecretKey: Uint8Array
): UnwrappedMessage
```

Unwraps a gift-wrapped chat message, file message or reaction. Verifies the seal exactly like `unwrapDirectMessage`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `wrap` | `NostrEvent` | The kind 1059 gift wrap event |
| `recipientSecretKey` | `Uint8Array` | Recipient's secret key (32 bytes) |

**Returns:** `UnwrappedMessage` - the rumor kind, the real sender (the rumor's pubkey, matched against the seal) and the full rumor.

**Throws:** `Error` on:
- Invalid gift wrap or seal
- Decryption failure
- Pubkey mismatch (impersonation)
- Rumor kind other than 14, 15 or 7

```ts
const { kind, sender, rumor } = nip17.unwrapMessage(giftWrap, mySecretKey)
switch (kind) {
  case 14: showMessage(sender, rumor.content); break
  case 15: showFile(sender, rumor); break
  case 7: addReaction(sender, rumor); break
}
```

## nip17.wrapDirectMessage

```ts
function wrapDirectMessage(
  content: string,
  senderSecretKey: Uint8Array,
  recipientPubkey: string,
  tags?: string[][]
): NostrEvent
```

Creates a private direct message wrapped in NIP-59 gift wrap. Produces a kind 1059 event ready to publish to the recipient's preferred relays.

| Parameter | Type | Description |
|-----------|------|-------------|
| `content` | `string` | Message text |
| `senderSecretKey` | `Uint8Array` | Sender's secret key (32 bytes) |
| `recipientPubkey` | `string` | Recipient's public key (64-char hex) |
| `tags` | `string[][]?` | Additional tags (e.g., `['e', eventId]` for replies, `['subject', topic]`) |

**Returns:** `NostrEvent` - kind 1059 gift wrap event.

The returned event's `pubkey` is a random ephemeral key - the real sender is only visible after unwrapping.

```ts
const wrap = nip17.wrapDirectMessage(
  'Hey, this is a private message!',
  senderSecretKey,
  recipientPubkey,
)
// publish wrap to recipient's relays
await relay.publish(wrap)
```

### Replies

Thread replies by including an `e` tag referencing the previous message:

```ts
const reply = nip17.wrapDirectMessage(
  'Got it!',
  senderSecretKey,
  recipientPubkey,
  [['e', previousMessageId]],
)
```

## nip17.unwrapDirectMessage

```ts
function unwrapDirectMessage(
  wrap: NostrEvent,
  recipientSecretKey: Uint8Array
): DirectMessage
```

Unwraps a gift-wrapped direct message and returns the decrypted content with sender info.

| Parameter | Type | Description |
|-----------|------|-------------|
| `wrap` | `NostrEvent` | The kind 1059 gift wrap event |
| `recipientSecretKey` | `Uint8Array` | Recipient's secret key (32 bytes) |

**Returns:** `DirectMessage` - sender pubkey, content, tags, timestamp, and rumor id.

**Throws:** `Error` on:
- Invalid gift wrap or seal
- Decryption failure
- Pubkey mismatch (impersonation)
- Forged rumor id (does not hash to the content)
- Wrong event kind (not a kind 14 DM)

```ts
const dm = nip17.unwrapDirectMessage(giftWrap, recipientSecretKey)
console.log(dm.sender)    // sender's real pubkey
console.log(dm.content)   // decrypted message
console.log(dm.created_at) // original timestamp
```

## Full Example

```ts
import { generateSecretKey, getPublicKey, nip17 } from 'nostr-core'

// Alice sends a DM to Bob
const aliceSk = generateSecretKey()
const bobSk = generateSecretKey()
const bobPk = getPublicKey(bobSk)

const wrap = nip17.wrapDirectMessage('Hello Bob!', aliceSk, bobPk)
// wrap.pubkey is a random ephemeral key - Alice is anonymous

// Bob unwraps the message
const dm = nip17.unwrapDirectMessage(wrap, bobSk)
console.log(dm.sender)  // Alice's real pubkey
console.log(dm.content) // "Hello Bob!"
```

## How It Works

1. Creates an unsigned rumor (kind 14, 15 or 7) with the content and a `p` tag per receiver
2. For each receiver, and the sender: seals the rumor (kind 13) - NIP-44 encrypted with the sender's key, signed by the sender
3. Gift wraps each seal (kind 1059) - NIP-44 encrypted with a fresh ephemeral key, `p` tag for routing
4. On receive: unwraps, verifies seal signature, verifies pubkey consistency, checks the rumor kind, returns the message
