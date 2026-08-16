# Mail over Nostr

Email-shaped messaging on top of NIP-59 gift wrap: structured To/Cc/Bcc, threading, and encrypted attachments.

::: warning Experimental
There is no ratified NIP for email-style messaging on Nostr, so `MAIL_KIND` is **provisional** and can be overridden per call. The transport is entirely standard - a kind 1059 gift wrap around a kind 13 seal - so only the inner rumor schema is mail-specific. Expect the schema to move if and when a NIP lands.
:::

## Why not NIP-17?

NIP-17 models a conversation between equal participants. Email is defined by *asymmetric recipient roles*: To, Cc and Bcc are not the same thing, and Bcc must be invisible to the other recipients. NIP-17 has no way to express that, which is why this is a separate module rather than an extension.

## Import

```ts
import { mail } from 'nostr-core'
// or, as a subpath
import * as mail from 'nostr-core/mail'
// or import individual functions
import {
  createMailTemplate,
  createMailMessage,
  parseMailMessage,
  parseMailRumor,
  createReply,
  getThreadId,
  encryptAttachment,
  encryptAttachmentWithKey,
  decryptAttachment,
  uploadMailAttachment,
  downloadMailAttachment,
  getMailFilter,
  getDeliveryRelayFilter,
  parseDeliveryRelays,
  MAIL_KIND,
  DM_RELAY_LIST_KIND,
} from 'nostr-core'
```

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `MAIL_KIND` | `1314` | Inner rumor kind (provisional) |
| `DM_RELAY_LIST_KIND` | `10050` | NIP-17 DM relay list, used for delivery |

::: tip
`1314` deliberately avoids `1301`, which is already taken by NIP-101e "Workout Record". Because mail rumors are always 1059-wrapped, relays never filter on this number - but a future NIP should still claim a registry-checked kind.
:::

## The Envelope

```
kind 1059  gift wrap   <- the only thing a relay ever sees
  kind 13  seal        <- signed by the real author, NIP-44 encrypted
    kind 1314 rumor    <- the mail message
```

## MailMessage Type

```ts
type MailMessage = {
  subject: string
  body: string
  format?: 'text' | 'html'
  to: string[]
  cc?: string[]
  bcc?: string[]
  attachments?: MailAttachment[]
  thread?: string     // root rumor id; omit on the first message
  replyTo?: string    // rumor id being replied to
  extraTags?: string[][]
  kind?: number       // override MAIL_KIND
}
```

All pubkeys are 32-byte hex, per NIP-01 - not npub.

The rumor carries `p` tags for the visible recipients plus `subject`, `thread` and `e` tags; the content is a JSON document:

```json
{
  "body": "...",
  "format": "text",
  "to": ["<hex>"],
  "cc": ["<hex>"],
  "bcc": ["<hex>"],
  "attachments": [{ "server": "...", "hash": "...", "mime": "...", "size": 0, "key": "<hex>", "name": "..." }]
}
```

## createMailMessage

```ts
function createMailMessage(
  mail: MailMessage,
  senderSecretKey: Uint8Array,
  opts?: { selfCopy?: boolean },
): MailCopy[]

type MailCopy = {
  recipient: string
  role: 'to' | 'cc' | 'bcc' | 'sender'
  rumor: Rumor
  wrap: NostrEvent
}
```

Returns one gift-wrapped copy per recipient. Publish each `wrap` to that recipient's DM relays.

```ts
const copies = mail.createMailMessage({
  subject: 'Q3 planning',
  body: 'Agenda attached.',
  to: [bobPubkey],
  cc: [carolPubkey],
  bcc: [davePubkey],
}, aliceSecretKey)

// -> 4 copies: bob (to), carol (cc), dave (bcc), alice (sender)
```

### How Bcc privacy works

Gift wrap already encrypts a separate copy per recipient, and this module exploits that:

| Copy | `p` tags | `bcc` array |
|------|----------|-------------|
| To / Cc recipients | To + Cc | *empty* |
| Each Bcc recipient | To + Cc | **only themselves** |
| Sender's own copy | To + Cc | the full list |

Blind recipients are never `p`-tagged and each gets their **own rumor** with a distinct id. Neither another recipient nor a relay can reconstruct the blind list - it is privacy by construction, not by convention.

## parseMailMessage

```ts
function parseMailMessage(
  wrap: NostrEvent,
  recipientSecretKey: Uint8Array,
  opts?: { kind?: number },
): ParsedMail

function parseMailRumor(rumor: Rumor): ParsedMail
```

```ts
type ParsedMail = {
  subject: string
  body: string
  format: 'text' | 'html'
  to: string[]
  cc: string[]
  bcc: string[]        // what THIS copy reveals - see the table above
  attachments: MailAttachment[]
  thread?: string
  replyTo?: string
  sender: string
  id: string           // rumor id: the stable message id
  created_at: number
  extraTags: string[][]
  rumor: Rumor
}
```

A malformed content body does not lose the envelope - subject, threading and `p` tags still parse, and the recipient arrays fall back to the `p` tags.

## Threading

```ts
function getThreadId(mail: Pick<ParsedMail, 'thread' | 'id'>): string
```

Returns the message's `thread` tag, or its own id when it is the root of a new thread.

```ts
function createReply(
  original: ParsedMail,
  reply: { body: string; format?: MailFormat; attachments?: MailAttachment[]; replyAll?: boolean },
  replierPubkey: string,
): MailMessage
```

Swaps the recipients around, prefixes the subject with `Re:` (only once), and fills in the threading tags. `replyAll` keeps the original To and Cc minus the replier; otherwise only the original sender is addressed. Bcc is never carried over.

```ts
const reply = mail.createReply(received, { body: 'Looks good', replyAll: true }, myPubkey)
const replyCopies = mail.createMailMessage(reply, mySecretKey)
```

## Attachments

Attachments are symmetrically encrypted, uploaded to a Blossom server, and referenced by descriptor. The decryption key travels only inside the gift wrap, so the file server never sees plaintext.

```ts
type MailAttachment = {
  server: string   // Blossom server base URL
  hash: string     // SHA-256 of the ENCRYPTED blob, hex
  mime: string
  size: number     // plaintext size
  key: string      // symmetric key, hex - never leaves the gift wrap
  name: string
}
```

### encryptAttachment / decryptAttachment

```ts
function encryptAttachment(data: Uint8Array): Promise<{ ciphertext: Uint8Array; key: string }>
function encryptAttachmentWithKey(data: Uint8Array, keyHex: string): Promise<Uint8Array>
function decryptAttachment(ciphertext: Uint8Array, keyHex: string): Promise<Uint8Array>
```

AES-256-GCM with a fresh key and a 12-byte IV prepended to the ciphertext, so the blob is self-contained.

### uploadMailAttachment / downloadMailAttachment

```ts
function uploadMailAttachment(
  file: { data: Uint8Array; name: string; mime: string },
  server: string,
  senderSecretKey: Uint8Array,
  opts?: { expirationSeconds?: number },
): Promise<MailAttachment>

function downloadMailAttachment(
  attachment: MailAttachment,
  opts?: { server?: string },
): Promise<Uint8Array>
```

Encrypts, uploads with a signed kind 24242 [Blossom](/api/blossom) auth event, and returns the descriptor to drop into the message.

```ts
const attachment = await mail.uploadMailAttachment(
  { data: pdfBytes, name: 'agenda.pdf', mime: 'application/pdf' },
  'https://blossom.example',
  aliceSecretKey,
)

const copies = mail.createMailMessage({
  subject: 'Q3 planning', body: 'Agenda attached.',
  to: [bobPubkey], attachments: [attachment],
}, aliceSecretKey)
```

## Addressing & Delivery

```ts
function getMailFilter(pubkey: string, since?: number): Filter
function getDeliveryRelayFilter(pubkeys: string[]): Filter
function parseDeliveryRelays(event: NostrEvent): string[]
```

Mail is fetched as gift wraps - the mail kind is never visible to the relay:

```ts
mail.getMailFilter(myPubkey)
// { kinds: [1059], '#p': [myPubkey] }
```

Recipients are resolved with [NIP-05](/api/nip05), and each copy is published to that recipient's kind 10050 DM relay list.

## Complete Example

```ts
import { mail, nip05, RelayPool } from 'nostr-core'

const pool = new RelayPool()
const defaultRelays = ['wss://relay.damus.io']

// --- Send ---
const bob = await nip05.queryNip05('bob@example.com')

const copies = mail.createMailMessage({
  subject: 'Q3 planning',
  body: 'Agenda attached.',
  to: [bob.pubkey],
  bcc: [legalPubkey],
}, aliceSecretKey)

// Look up where each recipient wants their mail delivered.
const lists = await pool.querySync(
  defaultRelays,
  mail.getDeliveryRelayFilter(copies.map(c => c.recipient)),
)
const inboxes = new Map(lists.map(e => [e.pubkey, mail.parseDeliveryRelays(e)]))

for (const copy of copies) {
  await pool.publish(inboxes.get(copy.recipient) ?? defaultRelays, copy.wrap)
}

// --- Receive ---
pool.subscribe(myRelays, mail.getMailFilter(myPubkey), {
  onevent(wrap) {
    try {
      const message = mail.parseMailMessage(wrap, mySecretKey)
      console.log(message.subject, 'from', message.sender)
      console.log('thread:', mail.getThreadId(message))
    } catch {
      // Not addressed to us, or not a mail rumor.
    }
  },
})
```

## Standardization

The schema above is a proposal, not a standard. Making Nostr mail actually interoperable needs a NIP: a registry-checked kind, and agreement with the other shipping implementations (notably nmail, which currently uses the colliding kind 1301). Until then, treat this module as one implementation of one schema.

## See Also

- [NIP-59](/api/nip59) - the gift wrap transport
- [NIP-17](/api/nip17) - direct messages, for conversations rather than mail
- [NIP-78](/api/nip78) - private folders, read state and drafts
- [Blossom](/api/blossom) - attachment storage
