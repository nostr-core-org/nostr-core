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
}
```

## Calendar Type

```ts
type Calendar = {
  identifier: string
  title: string
  content?: string
  eventAddresses?: string[]  // references to kind 31922 or 31923
}
```

## CalendarEventRSVP Type

```ts
type CalendarEventRSVP = {
  identifier: string
  calendarEventAddress: string
  status: 'accepted' | 'declined' | 'tentative'
  eventId?: string
  freebusy?: 'free' | 'busy'
  calendarEventAuthor?: string
  content?: string
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
function buildCalendarEventAddress(kind: 31922 | 31923, pubkey: string, identifier: string): string
```

Builds an `a` tag address string for a calendar event.

```ts
const address = nip52.buildCalendarEventAddress(31923, myPubkey, 'standup-2026-03-17')
// '31923:abc123...:standup-2026-03-17'
```

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
