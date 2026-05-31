---
name: nostr-messaging
description: Send and receive messages on Nostr using nostr-core. Covers encrypted private DMs (NIP-17 gift wrap), public notes (kind 1), public chat channels (NIP-28), relay-based groups (NIP-29), and real-time event subscriptions. Use when an agent needs to communicate over Nostr.
user-invocable: true
argument-hint: "[dm, note, channel, group, or listen]"
---

# Nostr Messaging with nostr-core

You are an expert in Nostr communication using nostr-core. You help developers send encrypted private DMs (NIP-17 gift wrap), publish public notes, create and participate in chat channels (NIP-28), interact with relay-based groups (NIP-29), and build real-time event subscriptions. You always recommend NIP-17 gift-wrapped DMs over legacy NIP-04 encryption for new implementations.

## Prerequisites

```ts
import { hexToBytes, getPublicKey } from 'nostr-core'

const secretKey = hexToBytes(process.env.NOSTR_SECRET_KEY)
const publicKey = getPublicKey(secretKey)
```

## Private DMs (NIP-17, Gift-Wrapped)

NIP-17 DMs are encrypted and gift-wrapped -- the sender's identity is hidden from relays.

### Send a DM

```ts
import { nip17, Relay } from 'nostr-core'

const wrap = nip17.wrapDirectMessage(
  'Hello from the agent!',
  secretKey,
  recipientPubkey
)

const relay = new Relay('wss://relay.damus.io')
await relay.connect()
await relay.publish(wrap)
relay.close()
```

### Receive DMs

```ts
import { nip17, Relay } from 'nostr-core'

const relay = new Relay('wss://relay.damus.io')
await relay.connect()

relay.subscribe([
  { kinds: [1059], '#p': [publicKey] }
], {
  onevent(event) {
    try {
      const dm = nip17.unwrapDirectMessage(event, secretKey)
      console.log(`From ${dm.sender}: ${dm.content}`)
    } catch {
      // Not for us or decryption failed
    }
  }
})
```

### DM across multiple relays

```ts
import { nip17, RelayPool } from 'nostr-core'

const pool = new RelayPool([
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net'
])

const wrap = nip17.wrapDirectMessage('Hello!', secretKey, recipientPubkey)

// Publish to all relays
for (const url of pool.relays.keys()) {
  const relay = pool.relays.get(url)
  if (relay) await relay.publish(wrap)
}

// Listen across all relays
pool.subscribe([
  { kinds: [1059], '#p': [publicKey] }
], pool.relays.keys(), {
  onevent(event) {
    try {
      const dm = nip17.unwrapDirectMessage(event, secretKey)
      console.log(`DM: ${dm.content}`)
    } catch {}
  }
})
```

## Public Notes (Kind 1)

### Post a note

```ts
import { finalizeEvent, Relay } from 'nostr-core'

const event = finalizeEvent({
  kind: 1,
  content: 'Agent reporting for duty.',
  created_at: Math.floor(Date.now() / 1000),
  tags: []
}, secretKey)

const relay = new Relay('wss://relay.damus.io')
await relay.connect()
await relay.publish(event)
relay.close()
```

### Post a reply (NIP-10 threads)

```ts
import { finalizeEvent, nip10 } from 'nostr-core'

const tags = nip10.buildThreadTags({
  root: { id: rootEventId, relay: 'wss://relay.damus.io' },
  reply: { id: parentEventId, relay: 'wss://relay.damus.io' }
})

const reply = finalizeEvent({
  kind: 1,
  content: 'Great point!',
  created_at: Math.floor(Date.now() / 1000),
  tags
}, secretKey)
```

### Add reactions (NIP-25)

```ts
import { nip25 } from 'nostr-core'

const reaction = nip25.createReactionEvent({
  targetEvent: { id: eventId, pubkey: authorPubkey },
  content: '+'
}, secretKey)
```

## Public Chat Channels (NIP-28)

### Create a channel

```ts
import { nip28 } from 'nostr-core'

const channel = nip28.createChannelEvent({
  name: 'Agent Lounge',
  about: 'Where agents hang out',
  picture: 'https://example.com/channel.png'
}, secretKey)
```

### Send a channel message

```ts
const message = nip28.createChannelMessageEvent(
  channelId,
  'Hello channel!',
  secretKey
)
```

### Read channel messages

```ts
import { Relay } from 'nostr-core'

const relay = new Relay('wss://relay.damus.io')
await relay.connect()

relay.subscribe([
  { kinds: [42], '#e': [channelId] }
], {
  onevent(event) {
    const msg = nip28.parseChannelMessage(event)
    console.log(`${event.pubkey}: ${msg.content}`)
  }
})
```

## Relay-Based Groups (NIP-29)

### Send a group message

```ts
import { nip29 } from 'nostr-core'

const message = nip29.createGroupChatEvent(
  groupId,
  'Hello group!',
  secretKey
)
```

### Read group metadata

```ts
const metadata = nip29.parseGroupMetadata(metadataEvent)
console.log(metadata.name, metadata.about)

const members = nip29.parseGroupMembers(membersEvent)
const admins = nip29.parseGroupAdmins(adminsEvent)
```

## Real-Time Subscriptions

### Listen for mentions

```ts
import { Relay } from 'nostr-core'

const relay = new Relay('wss://relay.damus.io')
await relay.connect()

relay.subscribe([
  { kinds: [1], '#p': [publicKey] }
], {
  onevent(event) {
    console.log(`Mentioned by ${event.pubkey}: ${event.content}`)
  }
})
```

### Listen for everything from specific authors

```ts
relay.subscribe([
  { kinds: [1, 6, 7], authors: [pubkey1, pubkey2] }
], {
  onevent(event) {
    // kind 1 = notes, 6 = reposts, 7 = reactions
    console.log(`${event.kind}: ${event.content}`)
  }
})
```

### Stream with RelayPool

```ts
import { RelayPool } from 'nostr-core'

const pool = new RelayPool([
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net'
])

const sub = pool.subscribe(
  [{ kinds: [1], '#p': [publicKey], limit: 0 }],
  pool.relays.keys(),
  {
    onevent(event) {
      console.log('New mention:', event.content)
    }
  }
)

// Close when done
// sub.close()
```

## Recommended Relays

```
wss://relay.damus.io
wss://relay.nostr.band
wss://nos.lol
wss://relay.primal.net
wss://nostr.mom
```
