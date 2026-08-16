import { getPublicKey } from './crypto.js'
import { finalizeEvent, type NostrEvent, type EventTemplate } from './event.js'
import type { Filter } from './filter.js'
import * as nip44 from './nip44.js'

// ── Event Kinds ────────────────────────────────────────────────────────

/** Addressable app data (`d` tag = app name / context). */
export const APP_DATA_KIND = 30078

/** Regular app data, for apps that need many events in the same category. */
export const APP_EVENT_KIND = 78

// ── Types ──────────────────────────────────────────────────────────────

export type AppData = {
  /** The `d` tag: app name, context, or any other identifier. */
  identifier: string
  /** Free-form payload. Use {@link createAppDataJsonTemplate} for JSON. */
  content?: string
  /** Extra tags carried alongside `d`. */
  tags?: string[][]
}

export type ParsedAppData = {
  identifier: string
  content: string
  /** Every tag except the `d` tag. */
  tags: string[][]
  pubkey: string
  created_at: number
}

// ── Self-encryption helpers ────────────────────────────────────────────

function selfEncrypt(content: string, secretKey: Uint8Array): string {
  return nip44.encrypt(content, nip44.getConversationKey(secretKey, getPublicKey(secretKey)))
}

function selfDecrypt(content: string, secretKey: Uint8Array): string {
  return nip44.decrypt(content, nip44.getConversationKey(secretKey, getPublicKey(secretKey)))
}

// ── Addressable app data (kind 30078) ──────────────────────────────────

/**
 * Create a kind 30078 app data template.
 *
 * NIP-78 puts no constraints on `content` or the extra `tags` - the shape is
 * entirely up to the application.
 */
export function createAppDataTemplate(data: AppData): EventTemplate {
  return {
    kind: APP_DATA_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['d', data.identifier], ...(data.tags ?? [])],
    content: data.content ?? '',
  }
}

/**
 * Create and sign a kind 30078 app data event.
 */
export function createAppDataEvent(data: AppData, secretKey: Uint8Array): NostrEvent {
  return finalizeEvent(createAppDataTemplate(data), secretKey)
}

/**
 * Parse a kind 30078 app data event.
 */
export function parseAppData(event: NostrEvent): ParsedAppData {
  return {
    identifier: event.tags.find(t => t[0] === 'd')?.[1] ?? '',
    content: event.content,
    tags: event.tags.filter(t => t[0] !== 'd'),
    pubkey: event.pubkey,
    created_at: event.created_at,
  }
}

// ── JSON convenience ───────────────────────────────────────────────────

/**
 * Create a kind 30078 template whose content is a JSON document.
 */
export function createAppDataJsonTemplate(
  identifier: string,
  value: unknown,
  tags?: string[][],
): EventTemplate {
  return createAppDataTemplate({ identifier, content: JSON.stringify(value), tags })
}

/**
 * Create and sign a kind 30078 event whose content is a JSON document.
 */
export function createAppDataJsonEvent(
  identifier: string,
  value: unknown,
  secretKey: Uint8Array,
  tags?: string[][],
): NostrEvent {
  return finalizeEvent(createAppDataJsonTemplate(identifier, value, tags), secretKey)
}

/**
 * Parse a kind 30078 event whose content is a JSON document.
 *
 * @throws if the content is not valid JSON.
 */
export function parseAppDataJson<T = unknown>(event: NostrEvent): T {
  return JSON.parse(event.content) as T
}

// ── Encrypted app data ─────────────────────────────────────────────────

/**
 * Create a kind 30078 template whose content is NIP-44 encrypted to self.
 *
 * This is the usual way to keep private application state (folders, read
 * markers, drafts, preferences) on a relay: only the `d` tag is public.
 */
export function createEncryptedAppDataTemplate(
  data: AppData,
  secretKey: Uint8Array,
): EventTemplate {
  return {
    kind: APP_DATA_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['d', data.identifier], ...(data.tags ?? [])],
    content: selfEncrypt(data.content ?? '', secretKey),
  }
}

/**
 * Create and sign a kind 30078 event with content NIP-44 encrypted to self.
 */
export function createEncryptedAppDataEvent(
  data: AppData,
  secretKey: Uint8Array,
): NostrEvent {
  return finalizeEvent(createEncryptedAppDataTemplate(data, secretKey), secretKey)
}

/**
 * Decrypt and parse a kind 30078 event encrypted to self.
 */
export function parseEncryptedAppData(
  event: NostrEvent,
  secretKey: Uint8Array,
): ParsedAppData {
  return {
    identifier: event.tags.find(t => t[0] === 'd')?.[1] ?? '',
    content: selfDecrypt(event.content, secretKey),
    tags: event.tags.filter(t => t[0] !== 'd'),
    pubkey: event.pubkey,
    created_at: event.created_at,
  }
}

/**
 * Create a kind 30078 event holding a JSON document encrypted to self.
 */
export function createEncryptedAppDataJsonEvent(
  identifier: string,
  value: unknown,
  secretKey: Uint8Array,
  tags?: string[][],
): NostrEvent {
  return createEncryptedAppDataEvent({ identifier, content: JSON.stringify(value), tags }, secretKey)
}

/**
 * Decrypt and JSON-parse a kind 30078 event encrypted to self.
 */
export function parseEncryptedAppDataJson<T = unknown>(
  event: NostrEvent,
  secretKey: Uint8Array,
): T {
  return JSON.parse(selfDecrypt(event.content, secretKey)) as T
}

// ── Regular app events (kind 78) ───────────────────────────────────────

/**
 * Create a kind 78 app event template.
 *
 * Unlike kind 30078 these are not replaceable, so an app can publish many of
 * them and distinguish them with its own tags.
 */
export function createAppEventTemplate(content: string, tags: string[][] = []): EventTemplate {
  return {
    kind: APP_EVENT_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content,
  }
}

/**
 * Create and sign a kind 78 app event.
 */
export function createAppEvent(
  content: string,
  secretKey: Uint8Array,
  tags: string[][] = [],
): NostrEvent {
  return finalizeEvent(createAppEventTemplate(content, tags), secretKey)
}

// ── Addressing & filters ───────────────────────────────────────────────

/**
 * Build the `a` tag coordinate for a kind 30078 app data event.
 */
export function buildAppDataAddress(pubkey: string, identifier: string): string {
  return `${APP_DATA_KIND}:${pubkey}:${identifier}`
}

/**
 * Build a filter fetching a user's app data, optionally narrowed to one or
 * more `d` identifiers.
 */
export function getAppDataFilter(pubkey: string, identifier?: string | string[]): Filter {
  const filter: Filter = { kinds: [APP_DATA_KIND], authors: [pubkey] }
  if (identifier !== undefined) {
    filter['#d'] = Array.isArray(identifier) ? identifier : [identifier]
  }
  return filter
}
