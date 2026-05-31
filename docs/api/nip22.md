# NIP-22

Comments (kind 1111) - a generic comment event that can be attached to any Nostr event, replaceable event address, or external content (like a URL or podcast episode). Comments support nested threading with separate root and parent references.

## Import

```ts
import { nip22 } from 'nostr-core'
// or import individual functions
import {
  createCommentEventTemplate,
  createCommentEvent,
  parseComment,
} from 'nostr-core'
```

## CommentScope Type

```ts
type CommentScope = {
  rootType: 'event' | 'address' | 'external'
  rootId: string
  rootKind?: number
  rootPubkey?: string
  parentType?: 'event' | 'address' | 'external'
  parentId?: string
  parentKind?: number
  parentPubkey?: string
}
```

| Field | Type | Description |
|-------|------|-------------|
| `rootType` | `'event' \| 'address' \| 'external'` | Type of the root item being commented on |
| `rootId` | `string` | Root event ID, address, or external identifier |
| `rootKind` | `number` (optional) | Kind of the root event |
| `rootPubkey` | `string` (optional) | Pubkey of the root event author |
| `parentType` | `'event' \| 'address' \| 'external'` (optional) | Type of the direct parent (for nested replies) |
| `parentId` | `string` (optional) | Parent event ID, address, or external identifier |
| `parentKind` | `number` (optional) | Kind of the parent event |
| `parentPubkey` | `string` (optional) | Pubkey of the parent event author |

## nip22.createCommentEventTemplate

```ts
function createCommentEventTemplate(content: string, scope: CommentScope): EventTemplate
```

Creates an unsigned kind 1111 comment event template. Use with `finalizeEvent()` or pass to a `Signer`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `content` | `string` | Comment text |
| `scope` | `CommentScope` | Root and optional parent references |

**Returns:** `EventTemplate` - Unsigned kind 1111 event with uppercase (root) and lowercase (parent) tags.

```ts
// Comment on a note (event root)
const template = nip22.createCommentEventTemplate('Great post!', {
  rootType: 'event',
  rootId: 'event-id-hex',
  rootKind: 1,
  rootPubkey: 'author-pubkey-hex',
})

const signed = await signer.signEvent(template)
```

## nip22.createCommentEvent

```ts
function createCommentEvent(content: string, scope: CommentScope, secretKey: Uint8Array): NostrEvent
```

Creates and signs a kind 1111 comment event.

| Parameter | Type | Description |
|-----------|------|-------------|
| `content` | `string` | Comment text |
| `scope` | `CommentScope` | Root and optional parent references |
| `secretKey` | `Uint8Array` | Signer's secret key (32 bytes) |

**Returns:** `NostrEvent` - Signed kind 1111 event ready to publish.

```ts
// Comment on an external URL
const comment = nip22.createCommentEvent(
  'Interesting article!',
  {
    rootType: 'external',
    rootId: 'https://example.com/article',
  },
  secretKey,
)

await pool.publish(['wss://relay.example.com'], comment)
```

## nip22.parseComment

```ts
function parseComment(event: NostrEvent): CommentScope & { content: string }
```

Parses a kind 1111 comment event into its scope and content.

| Parameter | Type | Description |
|-----------|------|-------------|
| `event` | `NostrEvent` | A kind 1111 comment event |

**Returns:** `CommentScope & { content: string }` - Parsed comment with root/parent references and content.

```ts
const parsed = nip22.parseComment(commentEvent)
console.log(parsed)
// {
//   rootType: 'event',
//   rootId: 'event-id-hex',
//   rootKind: 1,
//   rootPubkey: 'author-pubkey',
//   content: 'Great post!'
// }
```

## Full Example

```ts
import { generateSecretKey, getPublicKey, nip22, RelayPool } from 'nostr-core'

const sk = generateSecretKey()
const pk = getPublicKey(sk)
const pool = new RelayPool()

// Comment on a Nostr event (e.g., a note)
const comment1 = nip22.createCommentEvent(
  'I agree with this!',
  {
    rootType: 'event',
    rootId: 'original-note-id',
    rootKind: 1,
    rootPubkey: 'original-author-pubkey',
  },
  sk,
)
await pool.publish(['wss://relay.example.com'], comment1)

// Reply to a comment (nested threading)
const comment2 = nip22.createCommentEvent(
  'Me too!',
  {
    rootType: 'event',
    rootId: 'original-note-id',
    rootKind: 1,
    rootPubkey: 'original-author-pubkey',
    parentType: 'event',
    parentId: comment1.id,
    parentKind: 1111,
    parentPubkey: pk,
  },
  sk,
)
await pool.publish(['wss://relay.example.com'], comment2)

// Comment on an external resource
const comment3 = nip22.createCommentEvent(
  'Great episode!',
  {
    rootType: 'external',
    rootId: 'podcast:guid:episode-123',
  },
  sk,
)

// Comment on a replaceable event address
const comment4 = nip22.createCommentEvent(
  'Well written article.',
  {
    rootType: 'address',
    rootId: '30023:author-pubkey:article-slug',
    rootKind: 30023,
  },
  sk,
)

// Parse a received comment
const parsed = nip22.parseComment(comment2)
console.log(`Comment on ${parsed.rootType}: ${parsed.rootId}`)
if (parsed.parentId) {
  console.log(`In reply to: ${parsed.parentId}`)
}

pool.close()
```

## How It Works

- **Kind 1111** is a generic comment event that can attach to any root target
- Root tags use uppercase letters: `E` (event), `A` (address), `I` (external)
- Parent tags use lowercase letters: `e` (event), `a` (address), `i` (external)
- `K`/`k` tags specify the kind of the root/parent event respectively
- Author tags follow the same casing: `P` notifies the **root** author, `p` notifies the **parent** author (so the two don't collide on top-level comments)
- Event roots use the event ID; address roots use `kind:pubkey:d-tag` format
- External roots can be any identifier (URL, podcast GUID, ISBN, etc.)
- When there is no parent, the comment is a direct reply to the root
- Nested comments create a tree structure via the parent reference
