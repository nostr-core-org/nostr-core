import { finalizeEvent, type NostrEvent, type EventTemplate } from './event.js'

// ── Event Kinds ────────────────────────────────────────────────────────

export const DATE_BASED_CALENDAR_EVENT_KIND = 31922
export const TIME_BASED_CALENDAR_EVENT_KIND = 31923
export const CALENDAR_KIND = 31924
export const CALENDAR_EVENT_RSVP_KIND = 31925

/** Every addressable kind defined by NIP-52. */
export type CalendarKind = 31922 | 31923 | 31924 | 31925

// ── Shared types ───────────────────────────────────────────────────────

export type CalendarEventParticipant = {
  pubkey: string
  relay?: string
  role?: string
}

/** An `a` tag reference with the optional relay hint NIP-52 allows in slot 2. */
export type CalendarReference = {
  address: string
  relayHint?: string
}

/** An `e` tag reference with the optional relay hint NIP-52 allows in slot 2. */
export type CalendarEventReference = {
  id: string
  relayHint?: string
}

// ── Tag helpers ────────────────────────────────────────────────────────

/**
 * Build a participant `p` tag.
 *
 * NIP-52 participant tags are positional: `[pubkey, relay, role]`. When a role
 * is present the relay slot must still be emitted (empty when unknown), or the
 * role is read back as a relay URL.
 */
function participantTag(p: CalendarEventParticipant): string[] {
  if (p.role) return ['p', p.pubkey, p.relay ?? '', p.role]
  if (p.relay) return ['p', p.pubkey, p.relay]
  return ['p', p.pubkey]
}

function parseParticipantTag(tag: string[]): CalendarEventParticipant | undefined {
  if (!tag[1]) return undefined
  const p: CalendarEventParticipant = { pubkey: tag[1] }
  if (tag[2]) p.relay = tag[2]
  if (tag[3]) p.role = tag[3]
  return p
}

function referenceTag(name: 'a' | 'e', ref: CalendarReference | CalendarEventReference): string[] {
  const value = 'address' in ref ? ref.address : ref.id
  return ref.relayHint ? [name, value, ref.relayHint] : [name, value]
}

/**
 * Merge the plain-string form and the relay-hint form of a reference list.
 * The hinted list wins when both are supplied, so a parse -> create round trip
 * keeps its hints without duplicating entries.
 */
function resolveReferences(
  addresses: string[] | undefined,
  refs: CalendarReference[] | undefined,
): CalendarReference[] {
  if (refs?.length) return refs
  return (addresses ?? []).map(address => ({ address }))
}

function collectExtraTags(event: NostrEvent, recognized: Set<string>): string[][] {
  return event.tags.filter(tag => !recognized.has(tag[0]))
}

// ── Kind 31922: Date-Based Calendar Event ──────────────────────────────

export type DateBasedCalendarEvent = {
  identifier: string
  title: string
  start: string // YYYY-MM-DD
  end?: string // YYYY-MM-DD (exclusive)
  content?: string
  summary?: string
  image?: string
  locations?: string[]
  geohash?: string
  participants?: CalendarEventParticipant[]
  hashtags?: string[]
  references?: string[]
  /** Plain `a` tag addresses of the calendars this event belongs to. */
  calendarAddresses?: string[]
  /** `a` tag references carrying optional relay hints. Takes precedence over `calendarAddresses`. */
  calendarRefs?: CalendarReference[]
  /** Tags the parser did not recognize, preserved so a round trip is lossless. */
  extraTags?: string[][]
}

const DATE_BASED_TAGS = new Set([
  'd', 'title', 'name', 'start', 'end', 'summary', 'image',
  'location', 'g', 'p', 't', 'r', 'a',
])

/**
 * Create a kind 31922 date-based calendar event template.
 */
export function createDateBasedCalendarEventTemplate(event: DateBasedCalendarEvent): EventTemplate {
  const tags: string[][] = [
    ['d', event.identifier],
    ['title', event.title],
    ['start', event.start],
  ]

  if (event.end) tags.push(['end', event.end])
  if (event.summary) tags.push(['summary', event.summary])
  if (event.image) tags.push(['image', event.image])
  if (event.locations) {
    for (const loc of event.locations) tags.push(['location', loc])
  }
  if (event.geohash) tags.push(['g', event.geohash])
  if (event.participants) {
    for (const p of event.participants) tags.push(participantTag(p))
  }
  if (event.hashtags) {
    for (const t of event.hashtags) tags.push(['t', t])
  }
  if (event.references) {
    for (const r of event.references) tags.push(['r', r])
  }
  for (const ref of resolveReferences(event.calendarAddresses, event.calendarRefs)) {
    tags.push(referenceTag('a', ref))
  }
  if (event.extraTags) tags.push(...event.extraTags)

  return {
    kind: DATE_BASED_CALENDAR_EVENT_KIND,
    tags,
    content: event.content ?? '',
    created_at: Math.floor(Date.now() / 1000),
  }
}

/**
 * Create and sign a kind 31922 date-based calendar event.
 */
export function createDateBasedCalendarEvent(event: DateBasedCalendarEvent, secretKey: Uint8Array): NostrEvent {
  return finalizeEvent(createDateBasedCalendarEventTemplate(event), secretKey)
}

/**
 * Parse a kind 31922 date-based calendar event.
 */
export function parseDateBasedCalendarEvent(event: NostrEvent): DateBasedCalendarEvent {
  const result: DateBasedCalendarEvent = { identifier: '', title: '', start: '' }
  const locations: string[] = []
  const participants: CalendarEventParticipant[] = []
  const hashtags: string[] = []
  const references: string[] = []
  const calendarRefs: CalendarReference[] = []
  let title: string | undefined
  let name: string | undefined

  for (const tag of event.tags) {
    switch (tag[0]) {
      case 'd':
        result.identifier = tag[1] ?? ''
        break
      case 'title':
        title = tag[1]
        break
      // NIP-52 deprecated `name` in favour of `title` but keeps it as a read
      // fallback; clients such as Coracle and Flockstr still write only `name`.
      case 'name':
        name = tag[1]
        break
      case 'start':
        result.start = tag[1] ?? ''
        break
      case 'end':
        result.end = tag[1]
        break
      case 'summary':
        result.summary = tag[1]
        break
      case 'image':
        result.image = tag[1]
        break
      case 'location':
        if (tag[1]) locations.push(tag[1])
        break
      case 'g':
        result.geohash = tag[1]
        break
      case 'p': {
        const p = parseParticipantTag(tag)
        if (p) participants.push(p)
        break
      }
      case 't':
        if (tag[1]) hashtags.push(tag[1])
        break
      case 'r':
        if (tag[1]) references.push(tag[1])
        break
      case 'a':
        if (tag[1]) calendarRefs.push(tag[2] ? { address: tag[1], relayHint: tag[2] } : { address: tag[1] })
        break
    }
  }

  result.title = title ?? name ?? ''

  if (event.content) result.content = event.content
  if (locations.length > 0) result.locations = locations
  if (participants.length > 0) result.participants = participants
  if (hashtags.length > 0) result.hashtags = hashtags
  if (references.length > 0) result.references = references
  if (calendarRefs.length > 0) {
    result.calendarRefs = calendarRefs
    result.calendarAddresses = calendarRefs.map(r => r.address)
  }

  const extraTags = collectExtraTags(event, DATE_BASED_TAGS)
  if (extraTags.length > 0) result.extraTags = extraTags

  return result
}

// ── Kind 31923: Time-Based Calendar Event ──────────────────────────────

export type TimeBasedCalendarEvent = {
  identifier: string
  title: string
  start: number // Unix timestamp (seconds)
  end?: number // Unix timestamp (seconds, exclusive)
  startTzid?: string // IANA timezone
  endTzid?: string // IANA timezone
  content?: string
  summary?: string
  image?: string
  locations?: string[]
  geohash?: string
  participants?: CalendarEventParticipant[]
  hashtags?: string[]
  references?: string[]
  /** Plain `a` tag addresses of the calendars this event belongs to. */
  calendarAddresses?: string[]
  /** `a` tag references carrying optional relay hints. Takes precedence over `calendarAddresses`. */
  calendarRefs?: CalendarReference[]
  /**
   * Day-granularity `D` tags (`floor(unix_seconds / 86400)`), one per day the
   * event spans. Derived from `start`/`end` when omitted on create.
   */
  days?: number[]
  /** Tags the parser did not recognize, preserved so a round trip is lossless. */
  extraTags?: string[][]
}

const TIME_BASED_TAGS = new Set([
  'd', 'D', 'title', 'name', 'start', 'end', 'start_tzid', 'end_tzid',
  'summary', 'image', 'location', 'g', 'p', 't', 'r', 'a',
])

/**
 * Compute the `D` day-granularity tags an event spans.
 */
export function calendarEventDays(start: number, end?: number): number[] {
  const first = Math.floor(start / 86400)
  if (!end) return [first]
  const last = Math.floor(end / 86400)
  const days: number[] = []
  for (let day = first; day <= last; day++) days.push(day)
  return days
}

/**
 * Create a kind 31923 time-based calendar event template.
 */
export function createTimeBasedCalendarEventTemplate(event: TimeBasedCalendarEvent): EventTemplate {
  const days = event.days?.length ? event.days : calendarEventDays(event.start, event.end)

  const tags: string[][] = [
    ['d', event.identifier],
    ['title', event.title],
    ['start', String(event.start)],
  ]

  if (event.end) tags.push(['end', String(event.end)])
  for (const day of days) tags.push(['D', String(day)])

  if (event.startTzid) tags.push(['start_tzid', event.startTzid])
  if (event.endTzid) tags.push(['end_tzid', event.endTzid])
  if (event.summary) tags.push(['summary', event.summary])
  if (event.image) tags.push(['image', event.image])
  if (event.locations) {
    for (const loc of event.locations) tags.push(['location', loc])
  }
  if (event.geohash) tags.push(['g', event.geohash])
  if (event.participants) {
    for (const p of event.participants) tags.push(participantTag(p))
  }
  if (event.hashtags) {
    for (const t of event.hashtags) tags.push(['t', t])
  }
  if (event.references) {
    for (const r of event.references) tags.push(['r', r])
  }
  for (const ref of resolveReferences(event.calendarAddresses, event.calendarRefs)) {
    tags.push(referenceTag('a', ref))
  }
  if (event.extraTags) tags.push(...event.extraTags)

  return {
    kind: TIME_BASED_CALENDAR_EVENT_KIND,
    tags,
    content: event.content ?? '',
    created_at: Math.floor(Date.now() / 1000),
  }
}

/**
 * Create and sign a kind 31923 time-based calendar event.
 */
export function createTimeBasedCalendarEvent(event: TimeBasedCalendarEvent, secretKey: Uint8Array): NostrEvent {
  return finalizeEvent(createTimeBasedCalendarEventTemplate(event), secretKey)
}

/**
 * Parse a kind 31923 time-based calendar event.
 */
export function parseTimeBasedCalendarEvent(event: NostrEvent): TimeBasedCalendarEvent {
  const result: TimeBasedCalendarEvent = { identifier: '', title: '', start: 0 }
  const locations: string[] = []
  const participants: CalendarEventParticipant[] = []
  const hashtags: string[] = []
  const references: string[] = []
  const calendarRefs: CalendarReference[] = []
  const days: number[] = []
  let title: string | undefined
  let name: string | undefined

  for (const tag of event.tags) {
    switch (tag[0]) {
      case 'd':
        result.identifier = tag[1] ?? ''
        break
      case 'D': {
        const day = parseInt(tag[1], 10)
        if (Number.isFinite(day)) days.push(day)
        break
      }
      case 'title':
        title = tag[1]
        break
      case 'name':
        name = tag[1]
        break
      case 'start':
        result.start = parseInt(tag[1], 10)
        break
      case 'end':
        result.end = parseInt(tag[1], 10)
        break
      case 'start_tzid':
        result.startTzid = tag[1]
        break
      case 'end_tzid':
        result.endTzid = tag[1]
        break
      case 'summary':
        result.summary = tag[1]
        break
      case 'image':
        result.image = tag[1]
        break
      case 'location':
        if (tag[1]) locations.push(tag[1])
        break
      case 'g':
        result.geohash = tag[1]
        break
      case 'p': {
        const p = parseParticipantTag(tag)
        if (p) participants.push(p)
        break
      }
      case 't':
        if (tag[1]) hashtags.push(tag[1])
        break
      case 'r':
        if (tag[1]) references.push(tag[1])
        break
      case 'a':
        if (tag[1]) calendarRefs.push(tag[2] ? { address: tag[1], relayHint: tag[2] } : { address: tag[1] })
        break
    }
  }

  result.title = title ?? name ?? ''

  if (event.content) result.content = event.content
  if (days.length > 0) result.days = days
  if (locations.length > 0) result.locations = locations
  if (participants.length > 0) result.participants = participants
  if (hashtags.length > 0) result.hashtags = hashtags
  if (references.length > 0) result.references = references
  if (calendarRefs.length > 0) {
    result.calendarRefs = calendarRefs
    result.calendarAddresses = calendarRefs.map(r => r.address)
  }

  const extraTags = collectExtraTags(event, TIME_BASED_TAGS)
  if (extraTags.length > 0) result.extraTags = extraTags

  return result
}

// ── Kind 31924: Calendar (Collection) ──────────────────────────────────

export type Calendar = {
  identifier: string
  title: string
  content?: string
  /** Plain `a` tag addresses of the member kind 31922/31923 events. */
  eventAddresses?: string[]
  /** `a` tag references carrying optional relay hints. Takes precedence over `eventAddresses`. */
  eventRefs?: CalendarReference[]
  /** Tags the parser did not recognize, preserved so a round trip is lossless. */
  extraTags?: string[][]
}

const CALENDAR_TAGS = new Set(['d', 'title', 'name', 'a'])

/**
 * Create a kind 31924 calendar event template.
 */
export function createCalendarTemplate(calendar: Calendar): EventTemplate {
  const tags: string[][] = [
    ['d', calendar.identifier],
    ['title', calendar.title],
  ]

  for (const ref of resolveReferences(calendar.eventAddresses, calendar.eventRefs)) {
    tags.push(referenceTag('a', ref))
  }
  if (calendar.extraTags) tags.push(...calendar.extraTags)

  return {
    kind: CALENDAR_KIND,
    tags,
    content: calendar.content ?? '',
    created_at: Math.floor(Date.now() / 1000),
  }
}

/**
 * Create and sign a kind 31924 calendar event.
 */
export function createCalendarEvent(calendar: Calendar, secretKey: Uint8Array): NostrEvent {
  return finalizeEvent(createCalendarTemplate(calendar), secretKey)
}

/**
 * Parse a kind 31924 calendar event.
 */
export function parseCalendar(event: NostrEvent): Calendar {
  const result: Calendar = { identifier: '', title: '' }
  const eventRefs: CalendarReference[] = []
  let title: string | undefined
  let name: string | undefined

  for (const tag of event.tags) {
    switch (tag[0]) {
      case 'd':
        result.identifier = tag[1] ?? ''
        break
      case 'title':
        title = tag[1]
        break
      case 'name':
        name = tag[1]
        break
      case 'a':
        if (tag[1]) eventRefs.push(tag[2] ? { address: tag[1], relayHint: tag[2] } : { address: tag[1] })
        break
    }
  }

  result.title = title ?? name ?? ''

  if (event.content) result.content = event.content
  if (eventRefs.length > 0) {
    result.eventRefs = eventRefs
    result.eventAddresses = eventRefs.map(r => r.address)
  }

  const extraTags = collectExtraTags(event, CALENDAR_TAGS)
  if (extraTags.length > 0) result.extraTags = extraTags

  return result
}

// ── Kind 31925: Calendar Event RSVP ────────────────────────────────────

export type RSVPStatus = 'accepted' | 'declined' | 'tentative'
export type FreeBusy = 'free' | 'busy'

export type CalendarEventRSVP = {
  identifier: string
  calendarEventAddress: string
  status: RSVPStatus
  /** Relay hint emitted in slot 2 of the `a` tag. */
  calendarEventAddressRelayHint?: string
  eventId?: string
  /** Relay hint emitted in slot 2 of the `e` tag. */
  eventIdRelayHint?: string
  freebusy?: FreeBusy
  calendarEventAuthor?: string
  content?: string
  /** Tags the parser did not recognize, preserved so a round trip is lossless. */
  extraTags?: string[][]
}

const RSVP_TAGS = new Set(['d', 'a', 'status', 'e', 'fb', 'p'])

/**
 * Create a kind 31925 calendar event RSVP template.
 */
export function createCalendarEventRSVPTemplate(rsvp: CalendarEventRSVP): EventTemplate {
  const tags: string[][] = [
    ['d', rsvp.identifier],
    referenceTag('a', { address: rsvp.calendarEventAddress, relayHint: rsvp.calendarEventAddressRelayHint }),
    ['status', rsvp.status],
  ]

  if (rsvp.eventId) {
    tags.push(referenceTag('e', { id: rsvp.eventId, relayHint: rsvp.eventIdRelayHint }))
  }
  if (rsvp.freebusy && rsvp.status !== 'declined') tags.push(['fb', rsvp.freebusy])
  if (rsvp.calendarEventAuthor) tags.push(['p', rsvp.calendarEventAuthor])
  if (rsvp.extraTags) tags.push(...rsvp.extraTags)

  return {
    kind: CALENDAR_EVENT_RSVP_KIND,
    tags,
    content: rsvp.content ?? '',
    created_at: Math.floor(Date.now() / 1000),
  }
}

/**
 * Create and sign a kind 31925 calendar event RSVP.
 */
export function createCalendarEventRSVP(rsvp: CalendarEventRSVP, secretKey: Uint8Array): NostrEvent {
  return finalizeEvent(createCalendarEventRSVPTemplate(rsvp), secretKey)
}

/**
 * Parse a kind 31925 calendar event RSVP.
 */
export function parseCalendarEventRSVP(event: NostrEvent): CalendarEventRSVP {
  const result: CalendarEventRSVP = { identifier: '', calendarEventAddress: '', status: 'tentative' }

  for (const tag of event.tags) {
    switch (tag[0]) {
      case 'd':
        result.identifier = tag[1] ?? ''
        break
      case 'a':
        result.calendarEventAddress = tag[1] ?? ''
        if (tag[2]) result.calendarEventAddressRelayHint = tag[2]
        break
      case 'status':
        result.status = (tag[1] as RSVPStatus) ?? 'tentative'
        break
      case 'e':
        result.eventId = tag[1]
        if (tag[2]) result.eventIdRelayHint = tag[2]
        break
      case 'fb':
        result.freebusy = tag[1] as FreeBusy
        break
      case 'p':
        result.calendarEventAuthor = tag[1]
        break
    }
  }

  if (event.content) result.content = event.content

  const extraTags = collectExtraTags(event, RSVP_TAGS)
  if (extraTags.length > 0) result.extraTags = extraTags

  return result
}

// ── Utility Helpers ────────────────────────────────────────────────────

/**
 * Build a calendar event address string for use in `a` tags.
 *
 * Accepts every addressable NIP-52 kind: the two event kinds (31922/31923),
 * calendars (31924) and RSVPs (31925).
 */
export function buildCalendarEventAddress(kind: CalendarKind, pubkey: string, identifier: string): string {
  return `${kind}:${pubkey}:${identifier}`
}

/**
 * Build an `a` tag coordinate for any addressable (parameterized-replaceable)
 * kind in the 30000-39999 range.
 */
export function buildAddressableAddress(kind: number, pubkey: string, identifier: string): string {
  if (!Number.isInteger(kind) || kind < 30000 || kind > 39999) {
    throw new Error(`Kind ${kind} is not addressable (expected an integer in 30000-39999)`)
  }
  return `${kind}:${pubkey}:${identifier}`
}

/**
 * Parse an `a` tag coordinate back into its parts.
 */
export function parseAddressableAddress(address: string): { kind: number; pubkey: string; identifier: string } {
  const firstColon = address.indexOf(':')
  const secondColon = address.indexOf(':', firstColon + 1)
  if (firstColon === -1 || secondColon === -1) {
    throw new Error(`Invalid address coordinate: ${address}`)
  }
  const kind = parseInt(address.slice(0, firstColon), 10)
  if (!Number.isFinite(kind)) throw new Error(`Invalid address coordinate: ${address}`)
  return {
    kind,
    pubkey: address.slice(firstColon + 1, secondColon),
    identifier: address.slice(secondColon + 1),
  }
}

/**
 * Check if an event is a calendar-related event.
 */
export function isCalendarEvent(event: NostrEvent): boolean {
  return (
    event.kind === DATE_BASED_CALENDAR_EVENT_KIND ||
    event.kind === TIME_BASED_CALENDAR_EVENT_KIND ||
    event.kind === CALENDAR_KIND ||
    event.kind === CALENDAR_EVENT_RSVP_KIND
  )
}
