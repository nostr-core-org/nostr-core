# NIP-52

Calendar Events - defines date-based calendar events (kind 31922), time-based calendar events (kind 31923), calendars (kind 31924), and calendar event RSVPs (kind 31925).

## Import

```ts
import { nip52 } from 'nostr-core'
// or import individual functions
import {
  createDateBasedCalendarEventTemplate,
  createDateBasedCalendarEvent,
  parseDateBasedCalendarEvent,
  createTimeBasedCalendarEventTemplate,
  createTimeBasedCalendarEvent,
  parseTimeBasedCalendarEvent,
  createCalendarTemplate,
  createCalendarEvent,
  parseCalendar,
  createCalendarEventRSVPTemplate,
  createCalendarEventRSVP,
  parseCalendarEventRSVP,
  buildCalendarEventAddress,
  buildAddressableAddress,
  parseAddressableAddress,
  calendarEventDays,
  isCalendarEvent,
} from 'nostr-core'
```

## CalendarEventParticipant Type

```ts
type CalendarEventParticipant = {
  pubkey: string
  relay?: string
  role?: string
}
```

NIP-52 participant tags are **positional**: `["p", pubkey, relay, role]`. When a
role is present the relay slot is always emitted, empty when unknown, so the role
never lands in the relay position:

```ts
{ pubkey, role: 'host' }                       // -> ['p', pubkey, '', 'host']
{ pubkey, relay: 'wss://r.example', role: 'host' }  // -> ['p', pubkey, 'wss://r.example', 'host']
{ pubkey, relay: 'wss://r.example' }           // -> ['p', pubkey, 'wss://r.example']
```

## CalendarReference Type

```ts
type CalendarReference = {
  address: string
  relayHint?: string
}
```

NIP-52 allows an optional relay URL in the third slot of a calendar's member `a`
tags and an RSVP's `a` / `e` tags. For events that only live on their author's
own relay, the hint is often the difference between a reference resolving and
not resolving.

Every parsed object exposes both forms: `calendarAddresses` / `eventAddresses`
hold plain strings, `calendarRefs` / `eventRefs` hold the same entries with their
hints. On create, the hinted list wins when both are supplied, so a
parse -> create round trip keeps its hints without duplicating tags.

```ts
const calendar = nip52.createCalendarTemplate({
  identifier: 'work', title: 'Work',
  eventRefs: [{ address: '31923:abc:standup', relayHint: 'wss://relay.example' }],
})
// -> ['a', '31923:abc:standup', 'wss://relay.example']
```

## Unknown Tag Passthrough

All four parsers collect tags they do not recognize into `extraTags`, and all
four templates re-emit them. A create -> parse -> create round trip is therefore
lossless, including the `D` day-granularity tags kind 31923 requires and any
app-specific tags a client carries.

```ts
const parsed = nip52.parseTimeBasedCalendarEvent(event)
parsed.days       // [19675, 19676, ...] from the D tags
parsed.extraTags  // [['x-app-custom', 'v1'], ...]

nip52.createTimeBasedCalendarEventTemplate(parsed)   // emits both again
```

## Deprecated `name` Tag Fallback

NIP-52 deprecated `name` in favour of `title` in 2023 but keeps it as a read
fallback, and clients in the wild still write only `name` (Coracle's nostrtime
for 31923 events, Flockstr for 31924 calendars). The parsers read
`title ?? name`, so those events no longer parse with an empty title. Templates
always emit `title`.

## DateBasedCalendarEvent Type

```ts
type DateBasedCalendarEvent = {
  identifier: string
  title: string
  start: string         // YYYY-MM-DD
  end?: string          // YYYY-MM-DD (exclusive)
  content?: string
  summary?: string
  image?: string
  locations?: string[]
  geohash?: string
  participants?: CalendarEventParticipant[]
  hashtags?: string[]
  references?: string[]
  calendarAddresses?: string[]
  calendarRefs?: CalendarReference[]   // `a` tags with relay hints
  extraTags?: string[][]               // unrecognized tags, preserved
}
```

## TimeBasedCalendarEvent Type

```ts
type TimeBasedCalendarEvent = {
  identifier: string
  title: string
  start: number         // Unix timestamp (seconds)
  end?: number          // Unix timestamp (seconds, exclusive)
  startTzid?: string    // IANA timezone identifier
  endTzid?: string      // IANA timezone identifier
  content?: string
  summary?: string
  image?: string
  locations?: string[]
  geohash?: string
  participants?: CalendarEventParticipant[]
  hashtags?: string[]
  references?: string[]
  calendarAddresses?: string[]
  calendarRefs?: CalendarReference[]   // `a` tags with relay hints
  days?: number[]                      // `D` day-granularity tags
  extraTags?: string[][]               // unrecognized tags, preserved
}
```

## Calendar Type

```ts
type Calendar = {
  identifier: string
  title: string
  content?: string
  eventAddresses?: string[]        // references to kind 31922 or 31923
  eventRefs?: CalendarReference[]  // the same, with optional relay hints
  extraTags?: string[][]           // unrecognized tags, preserved
}
```

## CalendarEventRSVP Type

```ts
type CalendarEventRSVP = {
  identifier: string
  calendarEventAddress: string
  status: 'accepted' | 'declined' | 'tentative'
  calendarEventAddressRelayHint?: string   // slot 2 of the `a` tag
  eventId?: string
  eventIdRelayHint?: string                // slot 2 of the `e` tag
  freebusy?: 'free' | 'busy'
  calendarEventAuthor?: string
  content?: string
  extraTags?: string[][]                   // unrecognized tags, preserved
}
```

## nip52.createDateBasedCalendarEventTemplate

```ts
function createDateBasedCalendarEventTemplate(event: DateBasedCalendarEvent): EventTemplate
```

Creates an unsigned kind 31922 date-based calendar event template for all-day or multi-day events.

```ts
const template = nip52.createDateBasedCalendarEventTemplate({
  identifier: 'company-holiday-2026',
  title: 'Company Holiday Party',
  start: '2026-12-20',
  end: '2026-12-21',
  locations: ['123 Main St, NYC'],
  hashtags: ['holiday', 'party'],
})
```

## nip52.createDateBasedCalendarEvent

```ts
function createDateBasedCalendarEvent(event: DateBasedCalendarEvent, secretKey: Uint8Array): NostrEvent
```

Creates and signs a kind 31922 date-based calendar event.

## nip52.parseDateBasedCalendarEvent

```ts
function parseDateBasedCalendarEvent(event: NostrEvent): DateBasedCalendarEvent
```

Parses a kind 31922 date-based calendar event.

## nip52.createTimeBasedCalendarEventTemplate

```ts
function createTimeBasedCalendarEventTemplate(event: TimeBasedCalendarEvent): EventTemplate
```

Creates an unsigned kind 31923 time-based calendar event template. Automatically calculates the `D` (day-granularity) tags.

```ts
const template = nip52.createTimeBasedCalendarEventTemplate({
  identifier: 'standup-2026-03-17',
  title: 'Daily Standup',
  start: 1742212800,
  end: 1742214600,
  startTzid: 'America/New_York',
  locations: ['https://meet.example.com/standup'],
  participants: [
    { pubkey: 'abc123...', relay: 'wss://relay.example.com', role: 'speaker' },
  ],
})
```

## nip52.createTimeBasedCalendarEvent

```ts
function createTimeBasedCalendarEvent(event: TimeBasedCalendarEvent, secretKey: Uint8Array): NostrEvent
```

Creates and signs a kind 31923 time-based calendar event.

## nip52.parseTimeBasedCalendarEvent

```ts
function parseTimeBasedCalendarEvent(event: NostrEvent): TimeBasedCalendarEvent
```

Parses a kind 31923 time-based calendar event.

## nip52.createCalendarTemplate

```ts
function createCalendarTemplate(calendar: Calendar): EventTemplate
```

Creates an unsigned kind 31924 calendar (collection) event template.

```ts
const template = nip52.createCalendarTemplate({
  identifier: 'work-calendar',
  title: 'Work Calendar',
  eventAddresses: [
    '31922:pubkey:company-holiday-2026',
    '31923:pubkey:standup-2026-03-17',
  ],
})
```

## nip52.createCalendarEvent

```ts
function createCalendarEvent(calendar: Calendar, secretKey: Uint8Array): NostrEvent
```

Creates and signs a kind 31924 calendar event.

## nip52.parseCalendar

```ts
function parseCalendar(event: NostrEvent): Calendar
```

Parses a kind 31924 calendar event.

## nip52.createCalendarEventRSVPTemplate

```ts
function createCalendarEventRSVPTemplate(rsvp: CalendarEventRSVP): EventTemplate
```

Creates an unsigned kind 31925 RSVP event template.

```ts
const template = nip52.createCalendarEventRSVPTemplate({
  identifier: 'rsvp-holiday',
  calendarEventAddress: '31922:pubkey:company-holiday-2026',
  status: 'accepted',
  freebusy: 'busy',
  calendarEventAuthor: organizerPk,
  content: 'I will be there!',
})
```

## nip52.createCalendarEventRSVP

```ts
function createCalendarEventRSVP(rsvp: CalendarEventRSVP, secretKey: Uint8Array): NostrEvent
```

Creates and signs a kind 31925 RSVP event.

## nip52.parseCalendarEventRSVP

```ts
function parseCalendarEventRSVP(event: NostrEvent): CalendarEventRSVP
```

Parses a kind 31925 RSVP event.

## nip52.buildCalendarEventAddress

```ts
function buildCalendarEventAddress(
  kind: 31922 | 31923 | 31924 | 31925,
  pubkey: string,
  identifier: string,
): string
```

Builds an `a` tag address string for any addressable NIP-52 kind - the two event
kinds, calendars (31924) and RSVPs (31925).

```ts
const address = nip52.buildCalendarEventAddress(31923, myPubkey, 'standup-2026-03-17')
// '31923:abc123...:standup-2026-03-17'

// An RSVP referencing its calendar
nip52.buildCalendarEventAddress(31924, hostPubkey, 'work-calendar')
```

## nip52.buildAddressableAddress

```ts
function buildAddressableAddress(kind: number, pubkey: string, identifier: string): string
```

Builds a coordinate for **any** addressable (parameterized-replaceable) kind in
the 30000-39999 range. Throws for kinds outside it.

```ts
nip52.buildAddressableAddress(30078, pubkey, 'my-app/prefs')
// '30078:abc123...:my-app/prefs'

nip52.buildAddressableAddress(1, pubkey, 'x')   // throws: kind 1 is not addressable
```

## nip52.parseAddressableAddress

```ts
function parseAddressableAddress(address: string): {
  kind: number
  pubkey: string
  identifier: string
}
```

Splits a coordinate back into its parts. Identifiers containing colons round trip
correctly.

## nip52.calendarEventDays

```ts
function calendarEventDays(start: number, end?: number): number[]
```

Computes the `D` day-granularity tags (`floor(unix_seconds / 86400)`) an event
spans - one per day. `createTimeBasedCalendarEventTemplate` calls this for you
when `days` is omitted.

## nip52.isCalendarEvent

```ts
function isCalendarEvent(event: NostrEvent): boolean
```

Returns `true` if the event kind is 31922, 31923, 31924, or 31925.

## Full Example

```ts
import { generateSecretKey, getPublicKey, nip52, RelayPool } from 'nostr-core'

const sk = generateSecretKey()
const pk = getPublicKey(sk)
const pool = new RelayPool()

// Create a time-based meeting
const meeting = nip52.createTimeBasedCalendarEvent({
  identifier: 'bitcoin-meetup',
  title: 'Bitcoin Meetup',
  start: Math.floor(Date.now() / 1000) + 86400,
  end: Math.floor(Date.now() / 1000) + 86400 + 7200,
  startTzid: 'America/New_York',
  content: 'Monthly Bitcoin meetup at the coffee shop',
  locations: ['Bitcoin Coffee, 456 Oak St'],
  participants: [{ pubkey: friendPk, role: 'attendee' }],
  hashtags: ['bitcoin', 'meetup'],
}, sk)
await pool.publish(['wss://relay.example.com'], meeting)

// Create a calendar and add the event
const calendar = nip52.createCalendarEvent({
  identifier: 'my-events',
  title: 'My Events',
  eventAddresses: [nip52.buildCalendarEventAddress(31923, pk, 'bitcoin-meetup')],
}, sk)
await pool.publish(['wss://relay.example.com'], calendar)

// RSVP to the meeting
const rsvp = nip52.createCalendarEventRSVP({
  identifier: 'rsvp-bitcoin-meetup',
  calendarEventAddress: `31923:${pk}:bitcoin-meetup`,
  status: 'accepted',
  freebusy: 'busy',
  calendarEventAuthor: pk,
}, friendSk)
await pool.publish(['wss://relay.example.com'], rsvp)

pool.close()
```

## How It Works

- **Kind 31922** is a parameterized replaceable event for date-based calendar events (all-day events, holidays)
- **Kind 31923** is a parameterized replaceable event for time-based calendar events with Unix timestamps and timezone support
- **Kind 31924** is a calendar collection that references calendar events via `a` tags
- **Kind 31925** is a parameterized replaceable RSVP event with status (`accepted`, `declined`, `tentative`) and free/busy indicator
- Time-based events include `D` tags (day-granularity: `floor(unix_seconds / 86400)`) for efficient date-range queries
- Multiple `location` tags are supported for events with multiple venues
- Participants are tagged with `p` tags including optional relay hints and roles
- Any user may RSVP, even if they were not tagged on the calendar event
- Recurring events are not natively supported; create separate events for each occurrence
