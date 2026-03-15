import { bech32 } from '@scure/base'
import { utf8Encoder, utf8Decoder } from './utils.js'

// ── Error ──────────────────────────────────────────────────────────────

export class LnurlError extends Error {
  code: string
  constructor(message: string, code = 'LNURL_ERROR') {
    super(message)
    this.name = 'LnurlError'
    this.code = code
  }
}

// ── Types ──────────────────────────────────────────────────────────────

/** LUD-09: Success action after a payment */
export type SuccessAction =
  | { tag: 'message'; message: string }
  | { tag: 'url'; description: string; url: string }
  | { tag: 'aes'; description: string; ciphertext: string; iv: string }

/** LUD-18: Payer data requirements from the service */
export type PayerDataSpec = {
  name?: { mandatory: boolean }
  pubkey?: { mandatory: boolean }
  identifier?: { mandatory: boolean }
  email?: { mandatory: boolean }
  auth?: { mandatory: boolean; k1: string }
}

/** LUD-18: Payer data sent by the wallet */
export type PayerData = {
  name?: string
  pubkey?: string
  identifier?: string
  email?: string
  auth?: { key: string; k1: string; sig: string }
}

/** LUD-20: Parsed LNURL metadata entries */
export type LnurlMetadata = {
  plainText: string
  longDesc?: string
  image?: { type: string; data: string }
  entries: [string, string][]
}

/** LUD-06: Pay request first response */
export type PayRequestResponse = {
  tag: 'payRequest'
  callback: string
  minSendable: number
  maxSendable: number
  metadata: string
  commentAllowed?: number
  payerData?: PayerDataSpec
  allowsNostr?: boolean
  nostrPubkey?: string
}

/** LUD-06/09/21: Pay request callback response */
export type PayRequestCallbackResponse = {
  pr: string
  routes: unknown[]
  successAction?: SuccessAction
  verify?: string
}

/** LUD-03: Withdraw request first response */
export type WithdrawRequestResponse = {
  tag: 'withdrawRequest'
  callback: string
  k1: string
  defaultDescription: string
  minWithdrawable: number
  maxWithdrawable: number
}

/** LUD-21: Payment verification response */
export type VerifyResponse = {
  settled: boolean
  preimage: string | null
  pr: string
}

/** Options for requesting an invoice */
export type RequestInvoiceOptions = {
  comment?: string
  payerData?: PayerData
  nostr?: string
}

// ── LUD-01: Bech32 encode/decode ───────────────────────────────────────

/**
 * Encode a URL as an LNURL bech32 string.
 */
export function encodeLnurl(url: string): string {
  const data = utf8Encoder.encode(url)
  const words = bech32.toWords(data)
  return bech32.encode('lnurl', words, 1023)
}

/**
 * Decode an LNURL bech32 string back to a URL.
 */
export function decodeLnurl(encoded: string): string {
  const { prefix, words } = bech32.decode(encoded.toLowerCase() as `${string}1${string}`, 1023)
  if (prefix !== 'lnurl') {
    throw new LnurlError(`Invalid LNURL prefix: expected "lnurl", got "${prefix}"`)
  }
  const data = new Uint8Array(bech32.fromWords(words))
  return utf8Decoder.decode(data)
}

/**
 * Check if a string is a valid bech32-encoded LNURL.
 */
export function isLnurl(str: string): boolean {
  try {
    decodeLnurl(str)
    return true
  } catch {
    return false
  }
}

// ── LUD-17: Scheme prefixes ────────────────────────────────────────────

const SCHEME_MAP: Record<string, string> = {
  'lnurlp://': 'payRequest',
  'lnurlw://': 'withdrawRequest',
  'lnurlc://': 'channelRequest',
  'keyauth://': 'login',
}

/**
 * Resolve an LNURL string to a plain URL.
 * Accepts bech32-encoded LNURL, scheme-prefixed URLs (LUD-17),
 * or plain https:// URLs (passthrough).
 */
export function resolveUrl(input: string): { url: string; tag?: string } {
  // LUD-17: scheme prefixes
  for (const [scheme, tag] of Object.entries(SCHEME_MAP)) {
    if (input.startsWith(scheme)) {
      const rest = input.slice(scheme.length)
      const isOnion = rest.includes('.onion')
      const protocol = isOnion ? 'http://' : 'https://'
      return { url: `${protocol}${rest}`, tag }
    }
  }

  // Plain URL passthrough
  if (input.startsWith('https://') || input.startsWith('http://')) {
    return { url: input }
  }

  // LUD-01: bech32
  const url = decodeLnurl(input)
  return { url }
}

// ── LUD-20: Metadata parsing ───────────────────────────────────────────

/**
 * Parse the LNURL metadata JSON string into structured data.
 * Metadata is a JSON-encoded array of [mime-type, content] tuples.
 */
export function parseLnurlMetadata(metadata: string): LnurlMetadata {
  let entries: [string, string][]
  try {
    entries = JSON.parse(metadata) as [string, string][]
  } catch {
    throw new LnurlError('Invalid LNURL metadata: not valid JSON')
  }

  if (!Array.isArray(entries)) {
    throw new LnurlError('Invalid LNURL metadata: expected array')
  }

  let plainText = ''
  let longDesc: string | undefined
  let image: { type: string; data: string } | undefined

  for (const entry of entries) {
    if (!Array.isArray(entry) || entry.length < 2) continue
    const [mime, content] = entry
    if (mime === 'text/plain') {
      plainText = content
    } else if (mime === 'text/long-desc') {
      longDesc = content
    } else if (mime.startsWith('image/') && !image) {
      image = { type: mime, data: content }
    }
  }

  return { plainText, longDesc, image, entries }
}

// ── LUD-06: payRequest ─────────────────────────────────────────────────

/**
 * Fetch a pay request from an LNURL (bech32, scheme-prefixed, or plain URL).
 */
export async function fetchPayRequest(input: string): Promise<PayRequestResponse> {
  const { url } = resolveUrl(input)

  let data: Record<string, unknown>
  try {
    const res = await fetch(url)
    if (!res.ok) throw new LnurlError(`HTTP ${res.status} from ${url}`)
    data = (await res.json()) as Record<string, unknown>
  } catch (err) {
    if (err instanceof LnurlError) throw err
    throw new LnurlError(`Failed to fetch pay request: ${(err as Error).message}`)
  }

  if (data.status === 'ERROR') {
    throw new LnurlError(`LNURL error: ${(data.reason as string) || 'Unknown'}`)
  }

  if (data.tag !== 'payRequest') {
    throw new LnurlError(`Expected tag "payRequest", got "${data.tag}"`)
  }

  return {
    tag: 'payRequest',
    callback: data.callback as string,
    minSendable: data.minSendable as number,
    maxSendable: data.maxSendable as number,
    metadata: data.metadata as string,
    commentAllowed: data.commentAllowed as number | undefined,
    payerData: data.payerData as PayerDataSpec | undefined,
    allowsNostr: data.allowsNostr as boolean | undefined,
    nostrPubkey: data.nostrPubkey as string | undefined,
  }
}

/**
 * Request an invoice from a pay request callback (LUD-06/12/18).
 */
export async function requestInvoice(
  payRequest: PayRequestResponse,
  amountMsats: number,
  opts?: RequestInvoiceOptions,
): Promise<PayRequestCallbackResponse> {
  if (amountMsats < payRequest.minSendable || amountMsats > payRequest.maxSendable) {
    throw new LnurlError(
      `Amount ${amountMsats} msats outside allowed range [${payRequest.minSendable}, ${payRequest.maxSendable}]`,
    )
  }

  const sep = payRequest.callback.includes('?') ? '&' : '?'
  let url = `${payRequest.callback}${sep}amount=${amountMsats}`

  // LUD-12: comment
  if (opts?.comment) {
    if (payRequest.commentAllowed && opts.comment.length > payRequest.commentAllowed) {
      throw new LnurlError(`Comment exceeds max length of ${payRequest.commentAllowed} chars`)
    }
    url += `&comment=${encodeURIComponent(opts.comment)}`
  }

  // LUD-18: payer data
  if (opts?.payerData) {
    url += `&payerdata=${encodeURIComponent(JSON.stringify(opts.payerData))}`
  }

  // Nostr zap request
  if (opts?.nostr) {
    url += `&nostr=${encodeURIComponent(opts.nostr)}`
  }

  let data: Record<string, unknown>
  try {
    const res = await fetch(url)
    if (!res.ok) throw new LnurlError(`Callback HTTP ${res.status}`)
    data = (await res.json()) as Record<string, unknown>
  } catch (err) {
    if (err instanceof LnurlError) throw err
    throw new LnurlError(`Failed to request invoice: ${(err as Error).message}`)
  }

  if (data.status === 'ERROR') {
    throw new LnurlError(`Callback error: ${(data.reason as string) || 'Unknown'}`)
  }

  if (!data.pr) {
    throw new LnurlError('Invalid callback response: missing invoice (pr field)')
  }

  return {
    pr: data.pr as string,
    routes: (data.routes as unknown[]) || [],
    successAction: data.successAction as SuccessAction | undefined,
    verify: data.verify as string | undefined,
  }
}

// ── LUD-03: withdrawRequest ────────────────────────────────────────────

/**
 * Fetch a withdraw request from an LNURL.
 */
export async function fetchWithdrawRequest(input: string): Promise<WithdrawRequestResponse> {
  const { url } = resolveUrl(input)

  let data: Record<string, unknown>
  try {
    const res = await fetch(url)
    if (!res.ok) throw new LnurlError(`HTTP ${res.status} from ${url}`)
    data = (await res.json()) as Record<string, unknown>
  } catch (err) {
    if (err instanceof LnurlError) throw err
    throw new LnurlError(`Failed to fetch withdraw request: ${(err as Error).message}`)
  }

  if (data.status === 'ERROR') {
    throw new LnurlError(`LNURL error: ${(data.reason as string) || 'Unknown'}`)
  }

  if (data.tag !== 'withdrawRequest') {
    throw new LnurlError(`Expected tag "withdrawRequest", got "${data.tag}"`)
  }

  return {
    tag: 'withdrawRequest',
    callback: data.callback as string,
    k1: data.k1 as string,
    defaultDescription: data.defaultDescription as string,
    minWithdrawable: data.minWithdrawable as number,
    maxWithdrawable: data.maxWithdrawable as number,
  }
}

/**
 * Submit a withdraw request with a BOLT-11 invoice.
 */
export async function submitWithdrawRequest(
  withdrawRequest: WithdrawRequestResponse,
  invoice: string,
): Promise<void> {
  const sep = withdrawRequest.callback.includes('?') ? '&' : '?'
  const url = `${withdrawRequest.callback}${sep}k1=${withdrawRequest.k1}&pr=${invoice}`

  let data: Record<string, unknown>
  try {
    const res = await fetch(url)
    if (!res.ok) throw new LnurlError(`Withdraw callback HTTP ${res.status}`)
    data = (await res.json()) as Record<string, unknown>
  } catch (err) {
    if (err instanceof LnurlError) throw err
    throw new LnurlError(`Failed to submit withdraw request: ${(err as Error).message}`)
  }

  if (data.status === 'ERROR') {
    throw new LnurlError(`Withdraw error: ${(data.reason as string) || 'Unknown'}`)
  }
}

// ── LUD-09/10: Success action handling ─────────────────────────────────

/**
 * Parse and validate a success action object.
 */
export function parseSuccessAction(raw: unknown): SuccessAction {
  const action = raw as Record<string, unknown>
  if (!action || typeof action !== 'object' || !action.tag) {
    throw new LnurlError('Invalid success action: missing tag')
  }

  switch (action.tag) {
    case 'message':
      return { tag: 'message', message: (action.message as string) || '' }
    case 'url':
      return {
        tag: 'url',
        description: (action.description as string) || '',
        url: (action.url as string) || '',
      }
    case 'aes':
      return {
        tag: 'aes',
        description: (action.description as string) || '',
        ciphertext: (action.ciphertext as string) || '',
        iv: (action.iv as string) || '',
      }
    default:
      throw new LnurlError(`Unknown success action tag: ${action.tag}`)
  }
}

/**
 * Decrypt an AES success action using the payment preimage (LUD-10).
 * Uses AES-256-CBC with PKCS5 padding.
 *
 * @param action - The AES success action from the callback response
 * @param preimageHex - The payment preimage as a hex string (32 bytes)
 * @returns The decrypted plaintext string
 */
export async function decryptAesSuccessAction(
  action: Extract<SuccessAction, { tag: 'aes' }>,
  preimageHex: string,
): Promise<string> {
  // Convert hex preimage to bytes (32 bytes = 256-bit key)
  const key = hexToBytes(preimageHex)
  if (key.length !== 32) {
    throw new LnurlError('Preimage must be 32 bytes (64 hex chars)')
  }

  const iv = base64ToBytes(action.iv)
  const ciphertext = base64ToBytes(action.ciphertext)

  // Use Web Crypto API for AES-256-CBC
  const cryptoKey = await crypto.subtle.importKey('raw', key.buffer as ArrayBuffer, { name: 'AES-CBC' }, false, [
    'decrypt',
  ])

  const decrypted = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: iv.buffer as ArrayBuffer }, cryptoKey, ciphertext.buffer as ArrayBuffer)

  return utf8Decoder.decode(new Uint8Array(decrypted))
}

// ── LUD-21: Verify payments ────────────────────────────────────────────

/**
 * Poll a verify URL to check if a payment has been settled.
 */
export async function verifyPayment(verifyUrl: string): Promise<VerifyResponse> {
  let data: Record<string, unknown>
  try {
    const res = await fetch(verifyUrl)
    if (!res.ok) throw new LnurlError(`Verify HTTP ${res.status}`)
    data = (await res.json()) as Record<string, unknown>
  } catch (err) {
    if (err instanceof LnurlError) throw err
    throw new LnurlError(`Failed to verify payment: ${(err as Error).message}`)
  }

  if (data.status === 'ERROR') {
    throw new LnurlError(`Verify error: ${(data.reason as string) || 'Unknown'}`)
  }

  return {
    settled: data.settled as boolean,
    preimage: (data.preimage as string) || null,
    pr: data.pr as string,
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}
