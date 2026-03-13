# NIP-17

Private Direct Messages - end-to-end encrypted DMs with sender anonymity. Built on [NIP-59 Gift Wrap](/api/nip59) and [NIP-44 encryption](/api/nip44).

## Import

```ts
import { nip17 } from 'nostr-core'
// or import individual functions
import { wrapDirectMessage, unwrapDirectMessage } from 'nostr-core'
```

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

1. Creates a kind 14 unsigned rumor with the message content and `['p', recipientPubkey]` tag
2. Seals the rumor (kind 13) - NIP-44 encrypted with sender's key, signed by sender
3. Gift wraps the seal (kind 1059) - NIP-44 encrypted with ephemeral key, `p` tag for routing
4. On receive: unwraps, verifies seal signature, verifies pubkey consistency, returns message
