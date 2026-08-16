import { getPublicKey } from './crypto.js'
import { finalizeEvent, type NostrEvent, type EventTemplate } from './event.js'
import type { Filter } from './filter.js'
import {
  buildAddressableAddress,
  createTimeBasedCalendarEventTemplate,
  createCalendarEventRSVPTemplate,
  parseTimeBasedCalendarEvent,
  parseCalendarEventRSVP,
  TIME_BASED_CALENDAR_EVENT_KIND,
  CALENDAR_EVENT_RSVP_KIND,
  type CalendarEventRSVP,
  type TimeBasedCalendarEvent,
} from './nip52.js'
import { createRumor, createSeal, createWrap, unwrap, type Rumor } from './nip59.js'

/**
 * Calendly-style appointment scheduling: a published availability page, the
 * booking requests it produces, and their cancellations.
 *
 * EXPERIMENTAL. No NIP standardizes appointment scheduling yet, so only the
 * availability event uses a new kind ({@link AVAILABILITY_KIND}); it is
 * provisional and may change. Everything else deliberately reuses ratified
 * building blocks so the data stays readable by ordinary clients:
 *
 * - a booking is a NIP-52 kind 31923 time-based calendar event,
 * - a cancellation is a NIP-52 kind 31925 RSVP with `status: 'declined'`,
 * - both travel as NIP-59 gift-wrapped rumors, so only the two parties see them.
 */

// ── Event Kinds ────────────────────────────────────────────────────────

/**
 * Addressable availability / booking page.
 *
 * Provisional: this kind is not registered in any NIP. Override it per call
 * via the `kind` field if your deployment has settled on a different number.
 */
export const AVAILABILITY_KIND = 31926

// ── Types ──────────────────────────────────────────────────────────────

/** Sunday = 0, matching `Date.prototype.getUTCDay()`. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

/** One recurring weekly window, expressed in the availability's timezone. */
export type AvailabilityRule = {
  weekday: Weekday
  /** Local wall-clock start, `HH:MM` (24h). */
  start: string
  /** Local wall-clock end, `HH:MM` (24h). Must be later than `start`. */
  end: string
}

export type Availability = {
  /** The `d` tag. */
  identifier: string
  title: string
  /** IANA timezone the rules are written in, e.g. `Europe/Berlin`. */
  timezone: string
  /** Appointment length, in minutes. */
  durationMinutes: number
  /** Weekly bookable windows. */
  rules: AvailabilityRule[]
  /** Spacing between slot start times. Defaults to `durationMinutes`. */
  intervalMinutes?: number
  /** Free time required immediately before an appointment. Default 0. */
  bufferBeforeMinutes?: number
  /** Free time required immediately after an appointment. Default 0. */
  bufferAfterMinutes?: number
  /** How far ahead a booking must be made. Default 0. */
  minNoticeMinutes?: number
  /** How far into the future bookings are accepted. Default unbounded. */
  maxAdvanceDays?: number
  description?: string
  locations?: string[]
  extraTags?: string[][]
  /** Override the provisional {@link AVAILABILITY_KIND}. */
  kind?: number
}

/** A concrete bookable instant. */
export type Slot = {
  /** Unix seconds. */
  start: number
  /** Unix seconds, exclusive. */
  end: number
}

/** A time range that blocks slots, e.g. from a NIP-52 `fb: busy` RSVP. */
export type BusyInterval = {
  start: number
  end: number
}

export type BookingRequest = {
  /** The `d` tag of this booking. */
  identifier: string
  /** `a` tag coordinate of the availability being booked. */
  availabilityAddress: string
  /** The host's pubkey. */
  host: string
  /** Unix seconds. */
  start: number
  /** Unix seconds, exclusive. */
  end: number
  title: string
  /** IANA timezone the booker chose to see the slot in. */
  timezone?: string
  /** Free-form note from the booker. */
  note?: string
  locations?: string[]
  extraTags?: string[][]
}

export type ParsedBookingRequest = BookingRequest & {
  /** The pubkey that actually authored the rumor. */
  booker: string
  /** The underlying NIP-52 calendar event. */
  calendarEvent: TimeBasedCalendarEvent
  rumor: Rumor
}

export type BookingCancellation = {
  /** The `d` tag of the cancellation. Defaults to the booking identifier. */
  identifier?: string
  /** `a` tag coordinate of the booking being cancelled. */
  bookingAddress: string
  /** The counterparty's pubkey (host or booker). */
  counterparty: string
  /** Rumor id of the booking, if known. */
  bookingEventId?: string
  reason?: string
}

export type ParsedBookingCancellation = {
  bookingAddress: string
  bookingEventId?: string
  reason?: string
  /** The pubkey that authored the cancellation. */
  cancelledBy: string
  rsvp: CalendarEventRSVP
  rumor: Rumor
}

// ── Availability (kind 31926) ──────────────────────────────────────────

const AVAILABILITY_TAGS = new Set([
  'd', 'title', 'tzid', 'duration', 'interval', 'buffer_before', 'buffer_after',
  'min_notice', 'max_advance', 'rule', 'location',
])

/**
 * Create an availability event template.
 */
export function createAvailabilityTemplate(availability: Availability): EventTemplate {
  const tags: string[][] = [
    ['d', availability.identifier],
    ['title', availability.title],
    ['tzid', availability.timezone],
    ['duration', String(availability.durationMinutes)],
  ]

  if (availability.intervalMinutes !== undefined) {
    tags.push(['interval', String(availability.intervalMinutes)])
  }
  if (availability.bufferBeforeMinutes !== undefined) {
    tags.push(['buffer_before', String(availability.bufferBeforeMinutes)])
  }
  if (availability.bufferAfterMinutes !== undefined) {
    tags.push(['buffer_after', String(availability.bufferAfterMinutes)])
  }
  if (availability.minNoticeMinutes !== undefined) {
    tags.push(['min_notice', String(availability.minNoticeMinutes)])
  }
  if (availability.maxAdvanceDays !== undefined) {
    tags.push(['max_advance', String(availability.maxAdvanceDays)])
  }

  for (const rule of availability.rules) {
    tags.push(['rule', String(rule.weekday), rule.start, rule.end])
  }
  for (const location of availability.locations ?? []) {
    tags.push(['location', location])
  }
  if (availability.extraTags) tags.push(...availability.extraTags)

  return {
    kind: availability.kind ?? AVAILABILITY_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: availability.description ?? '',
  }
}

/**
 * Create and sign an availability event.
 */
export function createAvailabilityEvent(
  availability: Availability,
  secretKey: Uint8Array,
): NostrEvent {
  return finalizeEvent(createAvailabilityTemplate(availability), secretKey)
}

/**
 * Parse an availability event.
 */
export function parseAvailability(event: NostrEvent): Availability {
  const result: Availability = {
    identifier: '',
    title: '',
    timezone: 'UTC',
    durationMinutes: 30,
    rules: [],
    kind: event.kind,
  }
  const locations: string[] = []

  for (const tag of event.tags) {
    switch (tag[0]) {
      case 'd':
        result.identifier = tag[1] ?? ''
        break
      case 'title':
        result.title = tag[1] ?? ''
        break
      case 'tzid':
        if (tag[1]) result.timezone = tag[1]
        break
      case 'duration':
        result.durationMinutes = toInt(tag[1], result.durationMinutes)
        break
      case 'interval':
        result.intervalMinutes = toInt(tag[1], 0) || undefined
        break
      case 'buffer_before':
        result.bufferBeforeMinutes = toInt(tag[1], 0)
        break
      case 'buffer_after':
        result.bufferAfterMinutes = toInt(tag[1], 0)
        break
      case 'min_notice':
        result.minNoticeMinutes = toInt(tag[1], 0)
        break
      case 'max_advance':
        result.maxAdvanceDays = toInt(tag[1], 0) || undefined
        break
      case 'rule': {
        const weekday = toInt(tag[1], -1)
        if (weekday >= 0 && weekday <= 6 && isClockTime(tag[2]) && isClockTime(tag[3])) {
          result.rules.push({ weekday: weekday as Weekday, start: tag[2], end: tag[3] })
        }
        break
      }
      case 'location':
        if (tag[1]) locations.push(tag[1])
        break
    }
  }

  if (event.content) result.description = event.content
  if (locations.length > 0) result.locations = locations

  const extraTags = event.tags.filter(t => !AVAILABILITY_TAGS.has(t[0]))
  if (extraTags.length > 0) result.extraTags = extraTags

  return result
}

/**
 * Build the `a` tag coordinate for an availability page.
 */
export function buildAvailabilityAddress(
  pubkey: string,
  identifier: string,
  kind: number = AVAILABILITY_KIND,
): string {
  return buildAddressableAddress(kind, pubkey, identifier)
}

/**
 * Build a filter for a host's availability pages.
 */
export function getAvailabilityFilter(
  pubkey: string,
  opts?: { identifier?: string; kind?: number },
): Filter {
  const filter: Filter = { kinds: [opts?.kind ?? AVAILABILITY_KIND], authors: [pubkey] }
  if (opts?.identifier) filter['#d'] = [opts.identifier]
  return filter
}

// ── Slot generation ────────────────────────────────────────────────────

export type GenerateSlotsOptions = {
  /** Window start, unix seconds. */
  from: number
  /** Window end, unix seconds. */
  to: number
  /** Already-taken intervals, e.g. existing bookings or a busy calendar. */
  busy?: BusyInterval[]
  /** "Now" for the min-notice check, unix seconds. Defaults to the clock. */
  now?: number
}

/**
 * Turn an availability plus a list of busy intervals into concrete bookable
 * instants.
 *
 * The weekly rules are wall-clock local times in `availability.timezone`, so
 * they are resolved through the IANA zone for every date in range. This is
 * DST-correct: a 09:00 rule stays 09:00 local across a transition, and the
 * hour that does not exist on a spring-forward date simply yields no slot.
 */
export function generateSlots(availability: Availability, opts: GenerateSlotsOptions): Slot[] {
  const durationSec = availability.durationMinutes * 60
  if (durationSec <= 0) return []

  const intervalSec = (availability.intervalMinutes ?? availability.durationMinutes) * 60
  if (intervalSec <= 0) return []

  const bufferBefore = (availability.bufferBeforeMinutes ?? 0) * 60
  const bufferAfter = (availability.bufferAfterMinutes ?? 0) * 60
  const now = opts.now ?? Math.floor(Date.now() / 1000)
  const earliest = now + (availability.minNoticeMinutes ?? 0) * 60
  const latest =
    availability.maxAdvanceDays !== undefined
      ? now + availability.maxAdvanceDays * 86400
      : Infinity

  const rulesByWeekday = new Map<number, AvailabilityRule[]>()
  for (const rule of availability.rules) {
    const list = rulesByWeekday.get(rule.weekday) ?? []
    list.push(rule)
    rulesByWeekday.set(rule.weekday, list)
  }

  const busy = (opts.busy ?? []).filter(b => b.end > b.start)
  const slots: Slot[] = []

  // Walk local calendar dates, starting a day early so a window that begins
  // before `from` in UTC terms is not skipped.
  const startParts = zonedParts((opts.from - 86400) * 1000, availability.timezone)
  let cursor = { year: startParts.year, month: startParts.month, day: startParts.day }
  const guardLimit = Math.ceil((opts.to - opts.from) / 86400) + 3

  for (let dayIndex = 0; dayIndex <= guardLimit; dayIndex++) {
    const weekday = weekdayOf(cursor.year, cursor.month, cursor.day)
    for (const rule of rulesByWeekday.get(weekday) ?? []) {
      const windowStart = zonedTimeToUnix(
        cursor.year, cursor.month, cursor.day, ...parseClockTime(rule.start), availability.timezone,
      )
      const windowEnd = zonedTimeToUnix(
        cursor.year, cursor.month, cursor.day, ...parseClockTime(rule.end), availability.timezone,
      )
      if (windowEnd <= windowStart) continue

      for (let start = windowStart; start + durationSec <= windowEnd; start += intervalSec) {
        const end = start + durationSec
        if (end <= opts.from || start >= opts.to) continue
        if (start < earliest || start > latest) continue

        const blockedFrom = start - bufferBefore
        const blockedTo = end + bufferAfter
        if (busy.some(b => b.start < blockedTo && b.end > blockedFrom)) continue

        slots.push({ start, end })
      }
    }
    cursor = nextDate(cursor)
  }

  slots.sort((a, b) => a.start - b.start)
  return slots
}

/**
 * Whether a proposed slot is one the availability actually offers.
 *
 * Use this host-side before accepting a booking - a booker can put any times
 * they like in a request.
 */
export function isSlotAvailable(
  availability: Availability,
  slot: Slot,
  opts?: Omit<GenerateSlotsOptions, 'from' | 'to'>,
): boolean {
  const slots = generateSlots(availability, {
    ...opts,
    from: slot.start,
    to: slot.end,
  })
  return slots.some(s => s.start === slot.start && s.end === slot.end)
}

// ── Booking requests ───────────────────────────────────────────────────

/**
 * Build the inner rumor for a booking request: a NIP-52 kind 31923 calendar
 * event tagged with the availability it books.
 */
export function createBookingRequestTemplate(booking: BookingRequest): EventTemplate {
  const template = createTimeBasedCalendarEventTemplate({
    identifier: booking.identifier,
    title: booking.title,
    start: booking.start,
    end: booking.end,
    startTzid: booking.timezone,
    endTzid: booking.timezone,
    content: booking.note,
    locations: booking.locations,
    participants: [{ pubkey: booking.host, role: 'host' }],
    calendarAddresses: [booking.availabilityAddress],
    extraTags: booking.extraTags,
  })

  return template
}

/**
 * Create a gift-wrapped booking request.
 *
 * Returns one wrap per recipient: one addressed to the host, and - unless
 * disabled - a self-copy so the booker keeps the appointment in their own
 * client. Publish each wrap to that recipient's DM relays (NIP-17 kind 10050).
 */
export function createBookingRequest(
  booking: BookingRequest,
  bookerSecretKey: Uint8Array,
  opts?: { selfCopy?: boolean },
): { rumor: Rumor; wraps: { recipient: string; wrap: NostrEvent }[] } {
  const bookerPubkey = getPublicKey(bookerSecretKey)
  const rumor = createRumor(createBookingRequestTemplate(booking), bookerPubkey)

  const recipients = [booking.host]
  if ((opts?.selfCopy ?? true) && bookerPubkey !== booking.host) recipients.push(bookerPubkey)

  const wraps = recipients.map(recipient => ({
    recipient,
    wrap: createWrap(createSeal(rumor, bookerSecretKey, recipient), recipient),
  }))

  return { rumor, wraps }
}

/**
 * Unwrap and parse a gift-wrapped booking request.
 */
export function parseBookingRequest(
  wrap: NostrEvent,
  recipientSecretKey: Uint8Array,
): ParsedBookingRequest {
  const rumor = unwrap(wrap, recipientSecretKey)
  if (rumor.kind !== TIME_BASED_CALENDAR_EVENT_KIND) {
    throw new Error(
      `Expected a kind ${TIME_BASED_CALENDAR_EVENT_KIND} booking request, got kind ${rumor.kind}`,
    )
  }

  const calendarEvent = parseTimeBasedCalendarEvent(rumor as unknown as NostrEvent)
  const host = calendarEvent.participants?.find(p => p.role === 'host')?.pubkey
    ?? calendarEvent.participants?.[0]?.pubkey
    ?? ''

  return {
    identifier: calendarEvent.identifier,
    availabilityAddress: calendarEvent.calendarAddresses?.[0] ?? '',
    host,
    start: calendarEvent.start,
    end: calendarEvent.end ?? calendarEvent.start,
    title: calendarEvent.title,
    timezone: calendarEvent.startTzid,
    note: calendarEvent.content,
    locations: calendarEvent.locations,
    extraTags: calendarEvent.extraTags,
    booker: rumor.pubkey,
    calendarEvent,
    rumor,
  }
}

/**
 * Build the `a` tag coordinate for a booking.
 */
export function buildBookingAddress(bookerPubkey: string, identifier: string): string {
  return buildAddressableAddress(TIME_BASED_CALENDAR_EVENT_KIND, bookerPubkey, identifier)
}

// ── Cancellations ──────────────────────────────────────────────────────

/**
 * Build the inner rumor for a cancellation: a NIP-52 RSVP with
 * `status: 'declined'` pointing at the booking.
 */
export function createBookingCancellationTemplate(
  cancellation: BookingCancellation,
): EventTemplate {
  const rsvp: CalendarEventRSVP = {
    identifier: cancellation.identifier ?? cancellation.bookingAddress,
    calendarEventAddress: cancellation.bookingAddress,
    status: 'declined',
    calendarEventAuthor: cancellation.counterparty,
    content: cancellation.reason,
  }
  if (cancellation.bookingEventId) rsvp.eventId = cancellation.bookingEventId

  return createCalendarEventRSVPTemplate(rsvp)
}

/**
 * Create a gift-wrapped cancellation, addressed to the counterparty and - by
 * default - to the canceller as well.
 */
export function createBookingCancellation(
  cancellation: BookingCancellation,
  cancellerSecretKey: Uint8Array,
  opts?: { selfCopy?: boolean },
): { rumor: Rumor; wraps: { recipient: string; wrap: NostrEvent }[] } {
  const cancellerPubkey = getPublicKey(cancellerSecretKey)
  const rumor = createRumor(createBookingCancellationTemplate(cancellation), cancellerPubkey)

  const recipients = [cancellation.counterparty]
  if ((opts?.selfCopy ?? true) && cancellerPubkey !== cancellation.counterparty) {
    recipients.push(cancellerPubkey)
  }

  const wraps = recipients.map(recipient => ({
    recipient,
    wrap: createWrap(createSeal(rumor, cancellerSecretKey, recipient), recipient),
  }))

  return { rumor, wraps }
}

/**
 * Unwrap and parse a gift-wrapped cancellation.
 */
export function parseBookingCancellation(
  wrap: NostrEvent,
  recipientSecretKey: Uint8Array,
): ParsedBookingCancellation {
  const rumor = unwrap(wrap, recipientSecretKey)
  if (rumor.kind !== CALENDAR_EVENT_RSVP_KIND) {
    throw new Error(
      `Expected a kind ${CALENDAR_EVENT_RSVP_KIND} cancellation, got kind ${rumor.kind}`,
    )
  }

  const rsvp = parseCalendarEventRSVP(rumor as unknown as NostrEvent)
  return {
    bookingAddress: rsvp.calendarEventAddress,
    bookingEventId: rsvp.eventId,
    reason: rsvp.content,
    cancelledBy: rumor.pubkey,
    rsvp,
    rumor,
  }
}

/**
 * Turn accepted bookings into the busy intervals {@link generateSlots} expects.
 */
export function bookingsToBusy(bookings: Pick<BookingRequest, 'start' | 'end'>[]): BusyInterval[] {
  return bookings.map(b => ({ start: b.start, end: b.end }))
}

// ── Timezone helpers ───────────────────────────────────────────────────

type ZonedParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const formatterCache = new Map<string, Intl.DateTimeFormat>()

function zonedFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
    formatterCache.set(timeZone, formatter)
  }
  return formatter
}

/** The local wall-clock parts of a UTC instant in a given IANA zone. */
function zonedParts(utcMs: number, timeZone: string): ZonedParts {
  const parts = zonedFormatter(timeZone).formatToParts(new Date(utcMs))
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? '0')
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  }
}

/** The zone's UTC offset, in ms, at a given instant. */
function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const p = zonedParts(utcMs, timeZone)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - utcMs
}

/**
 * Resolve a local wall-clock time in an IANA zone to a unix timestamp.
 *
 * Two passes: the first offset guess is taken from the naive UTC instant, then
 * re-checked against the resulting instant so DST transitions land correctly.
 */
function zonedTimeToUnix(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): number {
  const naive = Date.UTC(year, month - 1, day, hour, minute)
  const firstGuess = naive - zoneOffsetMs(naive, timeZone)
  const refined = naive - zoneOffsetMs(firstGuess, timeZone)
  return Math.floor(refined / 1000)
}

function weekdayOf(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

function nextDate(date: { year: number; month: number; day: number }) {
  const next = new Date(Date.UTC(date.year, date.month - 1, date.day + 1))
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  }
}

function parseClockTime(time: string): [hour: number, minute: number] {
  const [hour, minute] = time.split(':')
  return [parseInt(hour, 10), parseInt(minute ?? '0', 10)]
}

function isClockTime(value: string | undefined): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

function toInt(value: string | undefined, fallback: number): number {
  const parsed = parseInt(value ?? '', 10)
  return Number.isFinite(parsed) ? parsed : fallback
}
