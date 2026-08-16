import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, hexToBytes, randomBytes } from '@noble/hashes/utils.js'

import { createAuthEvent, getBlob, uploadBlob } from './blossom.js'
import { getPublicKey } from './crypto.js'
import type { NostrEvent, EventTemplate } from './event.js'
import type { Filter } from './filter.js'
import { createRumor, createSeal, createWrap, unwrap, type Rumor } from './nip59.js'

/**
 * Mail over Nostr: email-shaped messaging on top of NIP-59 gift wrap.
 *
 * EXPERIMENTAL. There is no ratified NIP for email-style messaging, so
 * {@link MAIL_KIND} is provisional; it can be overridden per call. The
 * transport is entirely standard - a kind 1059 gift wrap around a kind 13 seal
 * around the mail rumor - so only the inner rumor schema is mail-specific.
 *
 * What NIP-17 cannot express, and this can:
 *
 * - **Recipient roles.** To and Cc are visible (extra `p` tags plus the `to` /
 *   `cc` arrays in the content).
 * - **Bcc privacy by construction.** Gift wrap already encrypts a separate copy
 *   per recipient, so each blind recipient receives their OWN rumor in which
 *   only they appear in `bcc`; the To/Cc copies carry no `bcc` at all, and the
 *   sender's self-copy keeps the full list for the Sent folder. Neither a
 *   recipient nor a relay can reconstruct the blind list.
 * - **Threading**, via a `thread` tag holding the root rumor id.
 */

// ── Constants ──────────────────────────────────────────────────────────

/**
 * Inner rumor kind for a mail message.
 *
 * Provisional. Deliberately NOT 1301, which is already taken by NIP-101e
 * "Workout Record". Because mail rumors are always 1059-wrapped, relays never
 * filter on this number - but a future NIP should still claim a clean,
 * registry-checked kind.
 */
export const MAIL_KIND = 1314

/** NIP-17 DM relay list: where to deliver a recipient's mail. */
export const DM_RELAY_LIST_KIND = 10050

// ── Types ──────────────────────────────────────────────────────────────

export type MailFormat = 'text' | 'html'

/** Which envelope field a recipient appears in. */
export type MailRecipientRole = 'to' | 'cc' | 'bcc' | 'sender'

/** An encrypted attachment stored on a Blossom server. */
export type MailAttachment = {
  /** Blossom server base URL. */
  server: string
  /** SHA-256 of the *encrypted* blob, hex. */
  hash: string
  mime: string
  size: number
  /** Symmetric decryption key, hex. Only ever travels inside the gift wrap. */
  key: string
  name: string
}

/** The JSON document carried in a mail rumor's content. */
export type MailContent = {
  body: string
  format: MailFormat
  to: string[]
  cc: string[]
  bcc: string[]
  attachments: MailAttachment[]
}

/** A mail message to send. All pubkeys are 32-byte hex, per NIP-01. */
export type MailMessage = {
  subject: string
  body: string
  format?: MailFormat
  to: string[]
  cc?: string[]
  bcc?: string[]
  attachments?: MailAttachment[]
  /** Root rumor id of the thread. Omit on the first message of a thread. */
  thread?: string
  /** Rumor id of the message being replied to. */
  replyTo?: string
  extraTags?: string[][]
  /** Override the provisional {@link MAIL_KIND}. */
  kind?: number
}

/** One addressed, gift-wrapped copy of a mail message. */
export type MailCopy = {
  recipient: string
  role: MailRecipientRole
  rumor: Rumor
  wrap: NostrEvent
}

export type ParsedMail = {
  subject: string
  body: string
  format: MailFormat
  /** Visible To recipients. */
  to: string[]
  /** Visible Cc recipients. */
  cc: string[]
  /**
   * Blind recipients visible in *this* copy: the reader themself on a blind
   * copy, the full list on the sender's own copy, empty on a To/Cc copy.
   */
  bcc: string[]
  attachments: MailAttachment[]
  thread?: string
  replyTo?: string
  sender: string
  /** Rumor id - the stable message id used for threading. */
  id: string
  created_at: number
  extraTags: string[][]
  rumor: Rumor
}

// ── Rumor construction ─────────────────────────────────────────────────

const MAIL_TAGS = new Set(['p', 'subject', 'thread', 'e'])

function dedupe(values: string[] | undefined): string[] {
  return [...new Set(values ?? [])]
}

/**
 * Build the mail rumor template for one recipient's view of a message.
 *
 * `visibleBcc` controls what lands in the `bcc` array: the blind recipient
 * themself, the full list (sender copy), or nothing (To/Cc copies).
 */
export function createMailTemplate(mail: MailMessage, visibleBcc: string[] = []): EventTemplate {
  const to = dedupe(mail.to)
  const cc = dedupe(mail.cc)

  const content: MailContent = {
    body: mail.body,
    format: mail.format ?? 'text',
    to,
    cc,
    bcc: dedupe(visibleBcc),
    attachments: mail.attachments ?? [],
  }

  // Only To and Cc get p tags - a bcc recipient must never be visible to
  // anyone else who can read this copy.
  const tags: string[][] = [...to, ...cc].map(pubkey => ['p', pubkey])
  tags.push(['subject', mail.subject])
  if (mail.thread) tags.push(['thread', mail.thread])
  if (mail.replyTo) tags.push(['e', mail.replyTo])
  if (mail.extraTags) tags.push(...mail.extraTags)

  return {
    kind: mail.kind ?? MAIL_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: JSON.stringify(content),
  }
}

/**
 * Create every gift-wrapped copy of a mail message.
 *
 * Returns one {@link MailCopy} per recipient:
 *
 * - **To / Cc** copies share a rumor whose `bcc` array is empty;
 * - **each Bcc** recipient gets their own rumor listing only themself;
 * - the **sender** copy (unless disabled) keeps the full bcc list, so the Sent
 *   folder shows who was blind-copied.
 *
 * Publish each `wrap` to that recipient's NIP-17 DM relays (kind 10050).
 */
export function createMailMessage(
  mail: MailMessage,
  senderSecretKey: Uint8Array,
  opts?: { selfCopy?: boolean },
): MailCopy[] {
  const senderPubkey = getPublicKey(senderSecretKey)
  const to = dedupe(mail.to)
  const cc = dedupe(mail.cc)
  const bcc = dedupe(mail.bcc)

  if (to.length === 0 && cc.length === 0 && bcc.length === 0) {
    throw new Error('A mail message needs at least one recipient')
  }

  const copies: MailCopy[] = []

  const wrapFor = (rumor: Rumor, recipient: string, role: MailRecipientRole) => {
    copies.push({
      recipient,
      role,
      rumor,
      wrap: createWrap(createSeal(rumor, senderSecretKey, recipient), recipient),
    })
  }

  // One shared rumor for every visible recipient.
  const visibleRecipients = [
    ...to.map(pubkey => ({ pubkey, role: 'to' as const })),
    ...cc.map(pubkey => ({ pubkey, role: 'cc' as const })),
  ]
  if (visibleRecipients.length > 0) {
    const visibleRumor = createRumor(createMailTemplate(mail, []), senderPubkey)
    for (const { pubkey, role } of visibleRecipients) wrapFor(visibleRumor, pubkey, role)
  }

  // A separate rumor per blind recipient, each listing only themself.
  for (const pubkey of bcc) {
    const blindRumor = createRumor(createMailTemplate(mail, [pubkey]), senderPubkey)
    wrapFor(blindRumor, pubkey, 'bcc')
  }

  // The sender's own copy carries the complete bcc list.
  if (opts?.selfCopy ?? true) {
    const senderRumor = createRumor(createMailTemplate(mail, bcc), senderPubkey)
    wrapFor(senderRumor, senderPubkey, 'sender')
  }

  return copies
}

/**
 * Unwrap and parse a gift-wrapped mail message.
 */
export function parseMailMessage(
  wrap: NostrEvent,
  recipientSecretKey: Uint8Array,
  opts?: { kind?: number },
): ParsedMail {
  const rumor = unwrap(wrap, recipientSecretKey)
  const expectedKind = opts?.kind ?? MAIL_KIND
  if (rumor.kind !== expectedKind) {
    throw new Error(`Expected a kind ${expectedKind} mail message, got kind ${rumor.kind}`)
  }
  return parseMailRumor(rumor)
}

/**
 * Parse an already-unwrapped mail rumor.
 */
export function parseMailRumor(rumor: Rumor): ParsedMail {
  let content: Partial<MailContent> = {}
  try {
    const parsed = JSON.parse(rumor.content) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      content = parsed as Partial<MailContent>
    }
  } catch {
    // A malformed body should not lose the envelope; fall through to defaults.
  }

  let subject = ''
  let thread: string | undefined
  let replyTo: string | undefined
  const pTagged: string[] = []

  for (const tag of rumor.tags) {
    switch (tag[0]) {
      case 'subject':
        subject = tag[1] ?? ''
        break
      case 'thread':
        thread = tag[1]
        break
      case 'e':
        replyTo = tag[1]
        break
      case 'p':
        if (tag[1]) pTagged.push(tag[1])
        break
    }
  }

  // Fall back to the p tags when the content arrays are missing, so a copy from
  // a client with a slimmer schema still shows its recipients.
  const to = Array.isArray(content.to) ? content.to : pTagged
  const cc = Array.isArray(content.cc) ? content.cc : []

  return {
    subject,
    body: typeof content.body === 'string' ? content.body : '',
    format: content.format === 'html' ? 'html' : 'text',
    to,
    cc,
    bcc: Array.isArray(content.bcc) ? content.bcc : [],
    attachments: Array.isArray(content.attachments) ? content.attachments : [],
    thread,
    replyTo,
    sender: rumor.pubkey,
    id: rumor.id,
    created_at: rumor.created_at,
    extraTags: rumor.tags.filter(t => !MAIL_TAGS.has(t[0])),
    rumor,
  }
}

// ── Threading ──────────────────────────────────────────────────────────

/**
 * The thread a message belongs to: its `thread` tag, or its own id when it is
 * the root of a new thread.
 */
export function getThreadId(mail: Pick<ParsedMail, 'thread' | 'id'>): string {
  return mail.thread ?? mail.id
}

/**
 * Build the reply to a message: recipients swapped around, subject prefixed,
 * threading tags filled in.
 *
 * `replyAll` keeps the original To and Cc (minus the replier); otherwise only
 * the original sender is addressed. Bcc is never carried over.
 */
export function createReply(
  original: ParsedMail,
  reply: { body: string; format?: MailFormat; attachments?: MailAttachment[]; replyAll?: boolean },
  replierPubkey: string,
): MailMessage {
  const others = (list: string[]) => list.filter(p => p !== replierPubkey)

  const to = dedupe([
    original.sender,
    ...(reply.replyAll ? others(original.to) : []),
  ]).filter(p => p !== replierPubkey)

  const cc = reply.replyAll ? dedupe(others(original.cc)).filter(p => !to.includes(p)) : []

  return {
    subject: original.subject.match(/^re:\s/i) ? original.subject : `Re: ${original.subject}`,
    body: reply.body,
    format: reply.format ?? original.format,
    to: to.length ? to : [original.sender],
    cc,
    attachments: reply.attachments,
    thread: getThreadId(original),
    replyTo: original.id,
  }
}

// ── Attachments ────────────────────────────────────────────────────────

const ATTACHMENT_IV_BYTES = 12

/**
 * Encrypt an attachment with a fresh AES-256-GCM key.
 *
 * The 12-byte IV is prepended to the ciphertext, so the returned blob is
 * self-contained. The key never leaves the gift wrap, so the Blossom server
 * only ever holds opaque bytes.
 */
export async function encryptAttachment(
  data: Uint8Array,
): Promise<{ ciphertext: Uint8Array; key: string }> {
  const keyBytes = randomBytes(32)
  const ciphertext = await encryptAttachmentWithKey(data, bytesToHex(keyBytes))
  return { ciphertext, key: bytesToHex(keyBytes) }
}

/**
 * Encrypt an attachment with a caller-supplied 32-byte hex key.
 */
export async function encryptAttachmentWithKey(
  data: Uint8Array,
  keyHex: string,
): Promise<Uint8Array> {
  const keyBytes = hexToBytes(keyHex)
  if (keyBytes.length !== 32) throw new Error('Attachment key must be 32 bytes (64 hex chars)')

  const iv = randomBytes(ATTACHMENT_IV_BYTES)
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  )
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
      cryptoKey,
      data.buffer as ArrayBuffer,
    ),
  )

  const out = new Uint8Array(iv.length + encrypted.length)
  out.set(iv, 0)
  out.set(encrypted, iv.length)
  return out
}

/**
 * Decrypt an attachment produced by {@link encryptAttachment}.
 */
export async function decryptAttachment(
  ciphertext: Uint8Array,
  keyHex: string,
): Promise<Uint8Array> {
  const keyBytes = hexToBytes(keyHex)
  if (keyBytes.length !== 32) throw new Error('Attachment key must be 32 bytes (64 hex chars)')
  if (ciphertext.length <= ATTACHMENT_IV_BYTES) throw new Error('Attachment ciphertext is too short')

  const iv = ciphertext.slice(0, ATTACHMENT_IV_BYTES)
  const body = ciphertext.slice(ATTACHMENT_IV_BYTES)

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  )
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    cryptoKey,
    body.buffer as ArrayBuffer,
  )
  return new Uint8Array(decrypted)
}

/**
 * Encrypt a file and upload it to a Blossom server, returning the
 * {@link MailAttachment} descriptor to put in the message.
 *
 * Uses NIP-98 style kind 24242 Blossom auth signed by the sender.
 */
export async function uploadMailAttachment(
  file: { data: Uint8Array; name: string; mime: string },
  server: string,
  senderSecretKey: Uint8Array,
  opts?: { expirationSeconds?: number },
): Promise<MailAttachment> {
  const { ciphertext, key } = await encryptAttachment(file.data)
  const hash = bytesToHex(sha256(ciphertext))

  const authEvent = createAuthEvent(
    {
      action: 'upload',
      content: `Upload ${file.name}`,
      expiration: Math.floor(Date.now() / 1000) + (opts?.expirationSeconds ?? 300),
      hashes: [hash],
      size: ciphertext.length,
      servers: [server],
    },
    senderSecretKey,
  )

  const descriptor = await uploadBlob(server, ciphertext, authEvent, 'application/octet-stream')

  return {
    server,
    hash: descriptor.sha256 || hash,
    mime: file.mime,
    size: file.data.length,
    key,
    name: file.name,
  }
}

/**
 * Fetch and decrypt an attachment referenced by a mail message.
 */
export async function downloadMailAttachment(
  attachment: MailAttachment,
  opts?: { server?: string },
): Promise<Uint8Array> {
  const server = opts?.server ?? attachment.server
  const blob = new Uint8Array(await getBlob(server, attachment.hash))
  return decryptAttachment(blob, attachment.key)
}

// ── Delivery ───────────────────────────────────────────────────────────

/**
 * Build a filter for mail addressed to a pubkey.
 *
 * Gift wraps are kind 1059 and p-tag their recipient, so the mail kind itself
 * is never visible to the relay.
 */
export function getMailFilter(pubkey: string, since?: number): Filter {
  const filter: Filter = { kinds: [1059], '#p': [pubkey] }
  if (since !== undefined) filter.since = since
  return filter
}

/**
 * Build a filter for recipients' NIP-17 DM relay lists (kind 10050), which is
 * where each copy of a message should be published.
 */
export function getDeliveryRelayFilter(pubkeys: string[]): Filter {
  return { kinds: [DM_RELAY_LIST_KIND], authors: [...new Set(pubkeys)] }
}

/**
 * Read the relay URLs out of a kind 10050 DM relay list.
 */
export function parseDeliveryRelays(event: NostrEvent): string[] {
  return event.tags.filter(t => t[0] === 'relay' && t[1]).map(t => t[1])
}
