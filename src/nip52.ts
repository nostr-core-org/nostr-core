import { finalizeEvent, type NostrEvent, type EventTemplate } from './event.js'

// ── Kind 31922: Date-Based Calendar Event ──────────────────────────────

export type CalendarEventParticipant = {
  pubkey: string
  relay?: string
  role?: string
}

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
  calendarAddresses?: string[]
}

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
    for (const p of event.participants) {
      const tag = ['p', p.pubkey]
      if (p.relay) tag.push(p.relay)
      if (p.role) tag.push(p.role)
      tags.push(tag)
    }
  }
  if (event.hashtags) {
    for (const t of event.hashtags) tags.push(['t', t])
  }
  if (event.references) {
    for (const r of event.references) tags.push(['r', r])
  }
  if (event.calendarAddresses) {
    for (const a of event.calendarAddresses) tags.push(['a', a])
  }

  return {
    kind: 31922,
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
  const calendarAddresses: string[] = []

  for (const tag of event.tags) {
    switch (tag[0]) {
      case 'd':
        result.identifier = tag[1] ?? ''
        break
      case 'title':
        result.title = tag[1] ?? ''
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
      case 'p':
        if (tag[1]) {
          const p: CalendarEventParticipant = { pubkey: tag[1] }
          if (tag[2]) p.relay = tag[2]
          if (tag[3]) p.role = tag[3]
          participants.push(p)
        }
        break
      case 't':
        if (tag[1]) hashtags.push(tag[1])
        break
      case 'r':
        if (tag[1]) references.push(tag[1])
        break
      case 'a':
        if (tag[1]) calendarAddresses.push(tag[1])
        break
    }
  }

  if (event.content) result.content = event.content
  if (locations.length > 0) result.locations = locations
  if (participants.length > 0) result.participants = participants
  if (hashtags.length > 0) result.hashtags = hashtags
  if (references.length > 0) result.references = references
  if (calendarAddresses.length > 0) result.calendarAddresses = calendarAddresses

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
  calendarAddresses?: string[]
}

/**
 * Create a kind 31923 time-based calendar event template.
 */
export function createTimeBasedCalendarEventTemplate(event: TimeBasedCalendarEvent): EventTemplate {
  const dayGranularity = Math.floor(event.start / 86400)

  const tags: string[][] = [
    ['d', event.identifier],
    ['title', event.title],
    ['start', String(event.start)],
    ['D', String(dayGranularity)],
  ]

  if (event.end) {
    tags.push(['end', String(event.end)])
    // Add D tags for each day covered
    const endDay = Math.floor(event.end / 86400)
    for (let day = dayGranularity + 1; day <= endDay; day++) {
      tags.push(['D', String(day)])
    }
  }
  if (event.startTzid) tags.push(['start_tzid', event.startTzid])
  if (event.endTzid) tags.push(['end_tzid', event.endTzid])
  if (event.summary) tags.push(['summary', event.summary])
  if (event.image) tags.push(['image', event.image])
  if (event.locations) {
    for (const loc of event.locations) tags.push(['location', loc])
  }
  if (event.geohash) tags.push(['g', event.geohash])
  if (event.participants) {
    for (const p of event.participants) {
      const tag = ['p', p.pubkey]
      if (p.relay) tag.push(p.relay)
      if (p.role) tag.push(p.role)
      tags.push(tag)
    }
  }
  if (event.hashtags) {
    for (const t of event.hashtags) tags.push(['t', t])
  }
  if (event.references) {
    for (const r of event.references) tags.push(['r', r])
  }
  if (event.calendarAddresses) {
    for (const a of event.calendarAddresses) tags.push(['a', a])
  }

  return {
    kind: 31923,
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
  const calendarAddresses: string[] = []

  for (const tag of event.tags) {
    switch (tag[0]) {
      case 'd':
        result.identifier = tag[1] ?? ''
        break
      case 'title':
        result.title = tag[1] ?? ''
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
      case 'p':
        if (tag[1]) {
          const p: CalendarEventParticipant = { pubkey: tag[1] }
          if (tag[2]) p.relay = tag[2]
          if (tag[3]) p.role = tag[3]
          participants.push(p)
        }
        break
      case 't':
        if (tag[1]) hashtags.push(tag[1])
        break
      case 'r':
        if (tag[1]) references.push(tag[1])
        break
      case 'a':
        if (tag[1]) calendarAddresses.push(tag[1])
        break
    }
  }

  if (event.content) result.content = event.content
  if (locations.length > 0) result.locations = locations
  if (participants.length > 0) result.participants = participants
  if (hashtags.length > 0) result.hashtags = hashtags
  if (references.length > 0) result.references = references
  if (calendarAddresses.length > 0) result.calendarAddresses = calendarAddresses

  return result
}

// ── Kind 31924: Calendar (Collection) ──────────────────────────────────

export type Calendar = {
  identifier: string
  title: string
  content?: string
  eventAddresses?: string[] // references to kind 31922 or 31923
}

/**
 * Create a kind 31924 calendar event template.
 */
export function createCalendarTemplate(calendar: Calendar): EventTemplate {
  const tags: string[][] = [
    ['d', calendar.identifier],
    ['title', calendar.title],
  ]

  if (calendar.eventAddresses) {
    for (const a of calendar.eventAddresses) tags.push(['a', a])
  }

  return {
    kind: 31924,
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
  const eventAddresses: string[] = []

  for (const tag of event.tags) {
    switch (tag[0]) {
      case 'd':
        result.identifier = tag[1] ?? ''
        break
      case 'title':
        result.title = tag[1] ?? ''
        break
      case 'a':
        if (tag[1]) eventAddresses.push(tag[1])
        break
    }
  }

  if (event.content) result.content = event.content
  if (eventAddresses.length > 0) result.eventAddresses = eventAddresses

  return result
}

// ── Kind 31925: Calendar Event RSVP ────────────────────────────────────

export type RSVPStatus = 'accepted' | 'declined' | 'tentative'
export type FreeBusy = 'free' | 'busy'

export type CalendarEventRSVP = {
  identifier: string
  calendarEventAddress: string
  status: RSVPStatus
  eventId?: string
  freebusy?: FreeBusy
  calendarEventAuthor?: string
  content?: string
}

/**
 * Create a kind 31925 calendar event RSVP template.
 */
export function createCalendarEventRSVPTemplate(rsvp: CalendarEventRSVP): EventTemplate {
  const tags: string[][] = [
    ['d', rsvp.identifier],
    ['a', rsvp.calendarEventAddress],
    ['status', rsvp.status],
  ]

  if (rsvp.eventId) tags.push(['e', rsvp.eventId])
  if (rsvp.freebusy && rsvp.status !== 'declined') tags.push(['fb', rsvp.freebusy])
  if (rsvp.calendarEventAuthor) tags.push(['p', rsvp.calendarEventAuthor])

  return {
    kind: 31925,
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
        break
      case 'status':
        result.status = (tag[1] as RSVPStatus) ?? 'tentative'
        break
      case 'e':
        result.eventId = tag[1]
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

  return result
}

// ── Utility Helpers ────────────────────────────────────────────────────

/**
 * Build a calendar event address string for use in `a` tags.
 */
export function buildCalendarEventAddress(kind: 31922 | 31923, pubkey: string, identifier: string): string {
  return `${kind}:${pubkey}:${identifier}`
}

/**
 * Check if an event is a calendar-related event.
 */
export function isCalendarEvent(event: NostrEvent): boolean {
  return event.kind === 31922 || event.kind === 31923 || event.kind === 31924 || event.kind === 31925
}
