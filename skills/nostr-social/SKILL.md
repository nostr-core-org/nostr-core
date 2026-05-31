---
name: nostr-social
description: Build social features on Nostr using nostr-core. Create threaded replies, reactions, reposts, long-form articles, follow lists, bookmarks, badges, calendar events, zap requests, and content moderation. Use when building a social client, bot, or content tool on Nostr.
user-invocable: true
argument-hint: "[threads, reactions, reposts, articles, follows, lists, badges, calendar, zaps, or moderation]"
---

# Nostr Social Features with nostr-core

You are an expert in building social experiences on Nostr using nostr-core. You help developers create threaded conversations, reactions, reposts, long-form articles, follow lists, bookmarks, badges, calendar events, zap-powered payments, and content moderation tools. You understand how these NIPs compose together to form complete social applications.

## Prerequisites

```ts
import { finalizeEvent, hexToBytes, getPublicKey, Relay } from 'nostr-core'

const secretKey = hexToBytes(process.env.NOSTR_SECRET_KEY)
const publicKey = getPublicKey(secretKey)

// Helper: publish an event to a relay
async function publish(event, relayUrl = 'wss://relay.damus.io') {
  const relay = new Relay(relayUrl)
  await relay.connect()
  await relay.publish(event)
  relay.close()
}
```

## Threads and Replies (NIP-10)

### Parse a thread

```ts
import { nip10 } from 'nostr-core'

const thread = nip10.parseThread(event)
// thread.root   -- the original post (if any)
// thread.reply  -- the direct parent being replied to
// thread.mentions -- other events mentioned
// thread.profiles -- pubkeys mentioned
```

### Build a reply

```ts
const tags = nip10.buildThreadTags({
  root: { id: rootEventId, relay: 'wss://relay.damus.io' },
  reply: { id: parentEventId, relay: 'wss://relay.damus.io' }
})

const reply = finalizeEvent({
  kind: 1,
  content: 'Interesting take!',
  created_at: Math.floor(Date.now() / 1000),
  tags
}, secretKey)
```

## Reactions (NIP-25)

### React to a post

```ts
import { nip25 } from 'nostr-core'

// Like
const like = nip25.createReactionEvent({
  targetEvent: { id: eventId, pubkey: authorPubkey },
  content: '+'
}, secretKey)

// Dislike
const dislike = nip25.createReactionEvent({
  targetEvent: { id: eventId, pubkey: authorPubkey },
  content: '-'
}, secretKey)

// Custom emoji reaction
const emoji = nip25.createReactionEvent({
  targetEvent: { id: eventId, pubkey: authorPubkey },
  content: ':zap:'
}, secretKey)
```

### Parse reactions

```ts
const reaction = nip25.parseReaction(event)
// reaction.isPositive  -- true for '+' or emoji
// reaction.isNegative  -- true for '-'
// reaction.emoji       -- custom emoji shortcode (if any)
// reaction.targetEventId
// reaction.targetPubkey
```

## Reposts (NIP-18)

```ts
import { nip18 } from 'nostr-core'

// Repost a text note (kind 6)
const repost = nip18.createRepostEvent(
  { id: eventId, pubkey: authorPubkey },
  secretKey,
  originalEvent // optional: embed the full event
)

// Generic repost for non-text kinds (kind 16)
const genericRepost = nip18.createRepostEvent(
  { id: eventId, pubkey: authorPubkey, kind: 30023 },
  secretKey
)

// Parse a repost
const parsed = nip18.parseRepost(repostEvent)
// parsed.targetEventId, parsed.targetKind, parsed.embeddedEvent
```

## Long-Form Content (NIP-23)

### Publish an article

```ts
import { nip23 } from 'nostr-core'

const article = nip23.createLongFormEvent({
  identifier: 'my-first-article',
  title: 'Building on Nostr',
  content: '# Introduction\n\nNostr is a simple, open protocol...',
  summary: 'A guide to building Nostr applications',
  image: 'https://example.com/cover.png',
  hashtags: ['nostr', 'bitcoin', 'development'],
  publishedAt: Math.floor(Date.now() / 1000)
}, secretKey)
```

### Parse an article

```ts
const article = nip23.parseLongForm(event)
// article.identifier, article.title, article.content
// article.summary, article.image, article.hashtags
// article.publishedAt, article.isDraft
```

## Comments (NIP-22)

Comment on any content -- articles, videos, web pages:

```ts
import { nip22 } from 'nostr-core'

// Comment on a Nostr event
const comment = nip22.createCommentEvent(
  'Great article!',
  { rootType: 'nostr', rootId: eventId, rootKind: 30023, rootPubkey: authorPubkey },
  secretKey
)

// Comment on a web page
const webComment = nip22.createCommentEvent(
  'Useful resource',
  { rootType: 'url', rootId: 'https://example.com/page' },
  secretKey
)

// Parse
const parsed = nip22.parseComment(event)
// parsed.rootType, parsed.rootId, parsed.content
```

## Follow Lists (NIP-02)

### Manage follows

```ts
import { nip02 } from 'nostr-core'

// Create or replace follow list
const followList = nip02.createFollowListEvent([
  { pubkey: 'hex_pubkey_1', relay: 'wss://relay.damus.io', petname: 'alice' },
  { pubkey: 'hex_pubkey_2', relay: 'wss://nos.lol' },
  { pubkey: 'hex_pubkey_3' }
], secretKey)

// Parse a follow list
const contacts = nip02.parseFollowList(event)
// contacts: [{ pubkey, relay?, petname? }, ...]

// Check if someone is followed
const follows = nip02.isFollowing(event, 'hex_pubkey_1') // true

// Get just the pubkeys
const pubkeys = nip02.getFollowedPubkeys(event)
```

## Lists and Bookmarks (NIP-51)

### Create a list

```ts
import { nip51 } from 'nostr-core'

// Public bookmark list (kind 10003)
const bookmarks = nip51.createListEvent({
  kind: 10003,
  publicItems: [
    { type: 'e', value: eventId1 },
    { type: 'e', value: eventId2 }
  ]
}, secretKey)

// List with private items (encrypted with NIP-44)
const privateList = nip51.createListEvent({
  kind: 10000, // mute list
  publicItems: [
    { type: 'p', value: spammerPubkey }
  ],
  privateItems: [
    { type: 'p', value: secretMutePubkey }
  ]
}, secretKey)
```

### Parse a list

```ts
const list = nip51.parseList(event, secretKey) // pass sk to decrypt private items
// list.publicItems, list.privateItems

const eventIds = nip51.getEventIds(list)
const pubkeys = nip51.getPubkeys(list)
const hashtags = nip51.getHashtags(list)
```

## Badges (NIP-58)

### Define a badge

```ts
import { nip58 } from 'nostr-core'

const badge = nip58.createBadgeDefinitionEvent({
  identifier: 'early-adopter',
  name: 'Early Adopter',
  description: 'Joined during the first month',
  image: 'https://example.com/badge.png',
  thumbs: [{ url: 'https://example.com/badge-thumb.png', dimensions: '64x64' }]
}, secretKey)
```

### Award a badge

```ts
const award = nip58.createBadgeAwardEvent({
  badgeAddress: { identifier: 'early-adopter', pubkey: publicKey },
  recipients: [recipientPubkey1, recipientPubkey2]
}, secretKey)
```

### Check badge status

```ts
const hasIt = nip58.hasBeenAwarded(recipientPubkey, awardEvents)
```

## Calendar Events (NIP-52)

### Create a date-based event

```ts
import { nip52 } from 'nostr-core'

const event = nip52.createDateBasedCalendarEvent({
  identifier: 'nostr-meetup-2025',
  title: 'Nostr Meetup',
  start: '2025-06-15',
  end: '2025-06-15',
  locations: ['Bitcoin Park, Nashville'],
  hashtags: ['nostr', 'meetup']
}, secretKey)
```

### Create a time-based event

```ts
const event = nip52.createTimeBasedCalendarEvent({
  identifier: 'weekly-call',
  title: 'Weekly Dev Call',
  start: Math.floor(Date.now() / 1000),
  end: Math.floor(Date.now() / 1000) + 3600,
  startTzid: 'America/New_York'
}, secretKey)
```

### RSVP

```ts
const rsvp = nip52.createCalendarEventRSVP({
  identifier: 'my-rsvp',
  calendarEventAddress: { identifier: 'nostr-meetup-2025', pubkey: organizerPubkey, kind: 31922 },
  status: 'accepted' // 'accepted', 'declined', 'tentative'
}, secretKey)
```

## Zap Requests (NIP-57)

### Create a zap request

```ts
import { nip57 } from 'nostr-core'

const zapRequest = nip57.createZapRequestEvent({
  recipientPubkey: authorPubkey,
  amount: 1000 * 1000, // 1000 sats in msats
  relays: ['wss://relay.damus.io'],
  content: 'Great post!',
  eventId: targetEventId // optional: zap a specific event
}, secretKey)
```

### Parse a zap receipt

```ts
const receipt = nip57.parseZapReceipt(event)
// receipt.recipientPubkey, receipt.senderPubkey
// receipt.amount, receipt.bolt11, receipt.content

const valid = nip57.validateZapReceipt(event)
```

### Zap goals (NIP-75)

```ts
import { nip75 } from 'nostr-core'

const goal = nip75.createZapGoalEvent({
  content: 'Fund the next release',
  amount: 100000 * 1000, // 100k sats target
  relays: ['wss://relay.damus.io'],
  closedAt: Math.floor(Date.now() / 1000) + 86400 * 7 // 1 week
}, secretKey)

const isOpen = nip75.isZapGoalOpen(goal)
const progress = nip75.calculateZapGoalProgress(zapReceipts) // msats received
```

## Content Moderation

### Content warnings (NIP-36)

```ts
import { nip36 } from 'nostr-core'

// Add a warning to an event's tags
const tags = nip36.addContentWarning([], 'spoiler')

// Check for warnings
const warning = nip36.getContentWarning(event) // 'spoiler' or undefined
const hasWarning = nip36.hasContentWarning(event) // boolean
```

### Reporting (NIP-56)

```ts
import { nip56 } from 'nostr-core'

const report = nip56.createReportEvent(
  [{ type: 'spam', pubkey: spammerPubkey }],
  secretKey,
  'Automated spam detection'
)

const parsed = nip56.parseReport(event)
// parsed.targets: [{ type, pubkey?, eventId? }]
```

### Event deletion (NIP-09)

```ts
import { nip09 } from 'nostr-core'

const deletion = nip09.createDeletionEvent({
  targets: [
    { type: 'event', id: eventId1 },
    { type: 'event', id: eventId2 }
  ],
  reason: 'Posted by mistake'
}, secretKey)
```

### Expiration (NIP-40)

```ts
import { nip40 } from 'nostr-core'

// Set an event to expire in 24 hours
const tags = nip40.addExpiration([], Math.floor(Date.now() / 1000) + 86400)

// Check if expired
const expired = nip40.isExpired(event)
```

## Custom Emoji (NIP-30)

```ts
import { nip30 } from 'nostr-core'

// Build emoji tags for an event
const tags = nip30.buildEmojiTags([
  { shortcode: 'sats', url: 'https://example.com/sats.png' },
  { shortcode: 'zap', url: 'https://example.com/zap.gif' }
])

// Parse emoji from an event
const emojis = nip30.parseCustomEmojis(event)
// [{ shortcode: 'sats', url: '...' }, ...]
```
