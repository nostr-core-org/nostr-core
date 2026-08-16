# Appointment Scheduling

Calendly-style scheduling: a published availability page, the booking requests it produces, and their cancellations - with a DST-correct slot generator.

::: warning Experimental
No NIP standardizes appointment scheduling. Only the availability event uses a new kind ([`AVAILABILITY_KIND`](#event-kinds)), which is **provisional** and overridable per call. Everything else deliberately reuses ratified building blocks, so the data stays readable by ordinary clients:

- a booking is a [NIP-52](/api/nip52) kind 31923 time-based calendar event
- a cancellation is a NIP-52 kind 31925 RSVP with `status: 'declined'`
- both travel as [NIP-59](/api/nip59) gift-wrapped rumors, so only the two parties see them
:::

## Import

```ts
import { scheduling } from 'nostr-core'
// or, as a subpath
import * as scheduling from 'nostr-core/scheduling'
// or import individual functions
import {
  createAvailabilityTemplate,
  createAvailabilityEvent,
  parseAvailability,
  buildAvailabilityAddress,
  getAvailabilityFilter,
  generateSlots,
  isSlotAvailable,
  bookingsToBusy,
  createBookingRequestTemplate,
  createBookingRequest,
  parseBookingRequest,
  buildBookingAddress,
  createBookingCancellationTemplate,
  createBookingCancellation,
  parseBookingCancellation,
  AVAILABILITY_KIND,
} from 'nostr-core'
```

## Event Kinds

| Constant | Value | Description |
|----------|-------|-------------|
| `AVAILABILITY_KIND` | `31926` | Addressable availability page (provisional) |
| - | `31923` | Booking request, as a NIP-52 calendar event |
| - | `31925` | Cancellation, as a declined NIP-52 RSVP |

## Availability

```ts
type Availability = {
  identifier: string
  title: string
  timezone: string              // IANA, e.g. 'Europe/Berlin'
  durationMinutes: number
  rules: AvailabilityRule[]
  intervalMinutes?: number      // slot spacing; defaults to durationMinutes
  bufferBeforeMinutes?: number
  bufferAfterMinutes?: number
  minNoticeMinutes?: number
  maxAdvanceDays?: number
  description?: string
  locations?: string[]
  extraTags?: string[][]
  kind?: number                 // override AVAILABILITY_KIND
}

type AvailabilityRule = {
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6   // Sunday = 0, matching Date#getUTCDay
  start: string                        // local wall clock, 'HH:MM' 24h
  end: string                          // must be later than start
}
```

```ts
function createAvailabilityTemplate(a: Availability): EventTemplate
function createAvailabilityEvent(a: Availability, secretKey: Uint8Array): NostrEvent
function parseAvailability(event: NostrEvent): Availability
```

```ts
const availability = {
  identifier: 'intro-call',
  title: '30 min intro',
  timezone: 'Europe/Berlin',
  durationMinutes: 30,
  rules: [
    { weekday: 1, start: '09:00', end: '12:00' },   // Mondays
    { weekday: 3, start: '14:00', end: '17:00' },   // Wednesdays
  ],
  bufferAfterMinutes: 10,
  minNoticeMinutes: 120,
  maxAdvanceDays: 60,
}

const event = scheduling.createAvailabilityEvent(availability, hostSecretKey)
```

Tags map as `d`, `title`, `tzid`, `duration`, `interval`, `buffer_before`, `buffer_after`, `min_notice`, `max_advance`, `rule` (one per window) and `location`.

### Addressing & filters

```ts
function buildAvailabilityAddress(pubkey: string, identifier: string, kind?: number): string
function getAvailabilityFilter(pubkey: string, opts?: { identifier?: string; kind?: number }): Filter
```

## Slot Generation

```ts
function generateSlots(availability: Availability, opts: GenerateSlotsOptions): Slot[]

type GenerateSlotsOptions = {
  from: number             // unix seconds
  to: number               // unix seconds
  busy?: BusyInterval[]    // already-taken intervals
  now?: number             // "now" for the min-notice check
}

type Slot = { start: number; end: number }        // unix seconds, end exclusive
type BusyInterval = { start: number; end: number }
```

Rules are wall-clock local times, so they are resolved through the IANA zone for every date in range.

::: tip DST correctness
A `09:00` rule stays 09:00 **local** across a daylight-saving transition, so the UTC instant shifts by an hour. A time that does not exist on a spring-forward date simply yields no slot. Offsets are resolved with `Intl.DateTimeFormat` and re-checked against the resulting instant, so transitions land correctly without a timezone dependency.
:::

```ts
const slots = scheduling.generateSlots(availability, {
  from: Math.floor(Date.now() / 1000),
  to: Math.floor(Date.now() / 1000) + 14 * 86400,
  busy: scheduling.bookingsToBusy(existingBookings),
})
```

A slot is dropped when it:

- falls outside `[from, to)`;
- starts before `now + minNoticeMinutes`, or after `now + maxAdvanceDays`;
- overlaps a busy interval once expanded by the before/after buffers.

### isSlotAvailable

```ts
function isSlotAvailable(
  availability: Availability,
  slot: Slot,
  opts?: { busy?: BusyInterval[]; now?: number },
): boolean
```

::: warning
Always run this host-side before accepting a booking. A booker can put any times they like in a request; only the host's own availability is authoritative.
:::

### bookingsToBusy

```ts
function bookingsToBusy(bookings: Pick<BookingRequest, 'start' | 'end'>[]): BusyInterval[]
```

## Booking Requests

```ts
type BookingRequest = {
  identifier: string
  availabilityAddress: string   // a tag coordinate of the availability
  host: string
  start: number                 // unix seconds
  end: number                   // unix seconds, exclusive
  title: string
  timezone?: string             // the timezone the booker chose
  note?: string
  locations?: string[]
  extraTags?: string[][]
}
```

```ts
function createBookingRequestTemplate(booking: BookingRequest): EventTemplate
function createBookingRequest(
  booking: BookingRequest,
  bookerSecretKey: Uint8Array,
  opts?: { selfCopy?: boolean },
): { rumor: Rumor; wraps: { recipient: string; wrap: NostrEvent }[] }
function parseBookingRequest(wrap: NostrEvent, recipientSecretKey: Uint8Array): ParsedBookingRequest
```

Returns one gift wrap for the host, plus - unless disabled - a self-copy so the booker keeps the appointment in their own client. Publish each to that recipient's NIP-17 DM relays (kind 10050).

```ts
const { wraps } = scheduling.createBookingRequest({
  identifier: crypto.randomUUID(),
  availabilityAddress: scheduling.buildAvailabilityAddress(hostPubkey, 'intro-call'),
  host: hostPubkey,
  start: slot.start,
  end: slot.end,
  title: '30 min intro',
  timezone: 'Europe/Berlin',
  note: 'Would like to discuss the integration.',
}, bookerSecretKey)
```

`ParsedBookingRequest` adds `booker` (the rumor's real author), the underlying `calendarEvent`, and the raw `rumor`. The host is the participant tagged with `role: 'host'`.

## Cancellations

```ts
type BookingCancellation = {
  identifier?: string       // defaults to the booking address
  bookingAddress: string
  counterparty: string      // host or booker
  bookingEventId?: string
  reason?: string
}
```

```ts
function createBookingCancellationTemplate(c: BookingCancellation): EventTemplate
function createBookingCancellation(
  c: BookingCancellation,
  cancellerSecretKey: Uint8Array,
  opts?: { selfCopy?: boolean },
): { rumor: Rumor; wraps: { recipient: string; wrap: NostrEvent }[] }
function parseBookingCancellation(wrap: NostrEvent, recipientSecretKey: Uint8Array): ParsedBookingCancellation
```

Either party can cancel - the rumor's author identifies who did.

```ts
const cancel = scheduling.createBookingCancellation({
  bookingAddress: scheduling.buildBookingAddress(bookerPubkey, bookingId),
  counterparty: hostPubkey,
  reason: 'Something came up',
}, bookerSecretKey)
```

## Complete Flow

```ts
import { scheduling, RelayPool } from 'nostr-core'

const pool = new RelayPool()

// --- Host publishes a booking page ---
await pool.publish(hostRelays, scheduling.createAvailabilityEvent(availability, hostSecretKey))

// --- Booker views open slots ---
const [availEvent] = await pool.querySync(
  hostRelays,
  scheduling.getAvailabilityFilter(hostPubkey, { identifier: 'intro-call' }),
)
const page = scheduling.parseAvailability(availEvent)

const now = Math.floor(Date.now() / 1000)
const slots = scheduling.generateSlots(page, { from: now, to: now + 14 * 86400 })

// --- Booker requests one ---
const { wraps } = scheduling.createBookingRequest({
  identifier: crypto.randomUUID(),
  availabilityAddress: scheduling.buildAvailabilityAddress(hostPubkey, page.identifier),
  host: hostPubkey,
  start: slots[0].start,
  end: slots[0].end,
  title: page.title,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
}, bookerSecretKey)

for (const { recipient, wrap } of wraps) {
  await pool.publish(await dmRelaysFor(recipient), wrap)
}

// --- Host receives and validates ---
pool.subscribe(hostRelays, { kinds: [1059], '#p': [hostPubkey] }, {
  onevent(wrap) {
    let booking
    try {
      booking = scheduling.parseBookingRequest(wrap, hostSecretKey)
    } catch {
      return   // not a booking
    }

    // Never trust the requested time - re-check it against your own page.
    const ok = scheduling.isSlotAvailable(
      page,
      { start: booking.start, end: booking.end },
      { busy: scheduling.bookingsToBusy(acceptedBookings) },
    )

    if (ok) accept(booking)
    else declineWithAlternatives(booking)
  },
})
```

## See Also

- [NIP-52](/api/nip52) - the calendar events a booking is built from
- [NIP-59](/api/nip59) - the gift wrap transport
