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
  /**
   * LUD-24 / Bolt Card: msat threshold above which the service requires the
   * card PIN. Present only when the service advertises it.
   */
  pinLimit?: number
  /** Any additional non-standard fields the service returned. */
  [key: string]: unknown
}

/** LUD-21: Payment verification response */
export type VerifyResponse = {
  settled: boolean
  preimage: string | null
  pr: string
  /**
   * Any additional fields the service returned. Fiat-payout providers extend
   * the verify response with delivery objects (e.g. `mpesa`, `payout`).
   */
  [key: string]: unknown
}

/** Options for requesting an invoice */
export type RequestInvoiceOptions = {
  comment?: string
  payerData?: PayerData
  nostr?: string
}

/** Options for submitting a withdraw request */
export type SubmitWithdrawOptions = {
  /**
   * LUD-24 / Bolt Card PIN. Travels as a plaintext query parameter, so the
   * callback is required to be `https:` whenever one is supplied.
   */
  pin?: string
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

  const target = buildUrl(payRequest.callback, 'pay request callback')
  target.searchParams.set('amount', String(amountMsats))

  // LUD-12: comment
  if (opts?.comment) {
    if (payRequest.commentAllowed && opts.comment.length > payRequest.commentAllowed) {
      throw new LnurlError(`Comment exceeds max length of ${payRequest.commentAllowed} chars`)
    }
    target.searchParams.set('comment', opts.comment)
  }

  // LUD-18: payer data
  if (opts?.payerData) {
    target.searchParams.set('payerdata', JSON.stringify(opts.payerData))
  }

  // Nostr zap request
  if (opts?.nostr) {
    target.searchParams.set('nostr', opts.nostr)
  }

  const url = target.toString()

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
    // Unknown fields first so the typed ones always win.
    ...passthrough(data, WITHDRAW_KNOWN_FIELDS),
    tag: 'withdrawRequest',
    callback: data.callback as string,
    k1: data.k1 as string,
    defaultDescription: data.defaultDescription as string,
    minWithdrawable: data.minWithdrawable as number,
    maxWithdrawable: data.maxWithdrawable as number,
    ...(typeof data.pinLimit === 'number' ? { pinLimit: data.pinLimit } : {}),
  }
}

const WITHDRAW_KNOWN_FIELDS = new Set([
  'tag', 'callback', 'k1', 'defaultDescription', 'minWithdrawable', 'maxWithdrawable',
  'pinLimit', 'status', 'reason',
])

/**
 * Submit a withdraw request with a BOLT-11 invoice.
 *
 * @param opts.pin - LUD-24 / Bolt Card PIN, required by some services once the
 *   amount exceeds `withdrawRequest.pinLimit`. Because it travels as a
 *   plaintext query parameter the callback must be `https:` when one is given,
 *   and the value is scrubbed from any error text this function throws.
 */
export async function submitWithdrawRequest(
  withdrawRequest: WithdrawRequestResponse,
  invoice: string,
  opts?: SubmitWithdrawOptions,
): Promise<void> {
  const target = buildUrl(withdrawRequest.callback, 'withdraw callback')
  target.searchParams.set('k1', withdrawRequest.k1)
  target.searchParams.set('pr', invoice)

  if (opts?.pin !== undefined) {
    if (target.protocol !== 'https:') {
      throw new LnurlError(
        `Refusing to send a PIN over "${target.protocol}" - the withdraw callback must use https:`,
        'INSECURE_PIN_CALLBACK',
      )
    }
    target.searchParams.set('pin', opts.pin)
  }

  const url = target.toString()

  let data: Record<string, unknown>
  try {
    const res = await fetch(url)
    if (!res.ok) throw new LnurlError(`Withdraw callback HTTP ${res.status}`)
    data = (await res.json()) as Record<string, unknown>
  } catch (err) {
    if (err instanceof LnurlError) throw err
    // Some fetch implementations embed the full request URL in the message.
    throw new LnurlError(`Failed to submit withdraw request: ${scrubPin((err as Error).message)}`)
  }

  if (data.status === 'ERROR') {
    throw new LnurlError(`Withdraw error: ${scrubPin((data.reason as string) || 'Unknown')}`)
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
 * Validate that a `verify` URL handed back by an LNURL-pay service is safe to
 * poll: it must be `https:` and live on the same host as the pay request's own
 * `callback`.
 *
 * Without this check a malicious or compromised service can point the wallet at
 * an arbitrary third-party URL that then gets fetched after every payment.
 * Fails closed - throws {@link LnurlError} rather than returning false.
 *
 * @returns The verify URL unchanged, so it can be used inline.
 */
export function validateVerifyUrl(verifyUrl: string, callbackUrl: string): string {
  const verify = buildUrl(verifyUrl, 'verify URL')
  const callback = buildUrl(callbackUrl, 'callback URL')

  if (verify.protocol !== 'https:') {
    throw new LnurlError(
      `Verify URL must use https: (got "${verify.protocol}")`,
      'INSECURE_VERIFY_URL',
    )
  }

  // Port-insensitive: services routinely publish the callback and the verify
  // endpoint on different ports of the same host.
  if (verify.hostname.toLowerCase() !== callback.hostname.toLowerCase()) {
    throw new LnurlError(
      `Verify URL host "${verify.hostname}" does not match the callback host "${callback.hostname}"`,
      'UNRELATED_VERIFY_URL',
    )
  }

  return verifyUrl
}

/**
 * Poll a verify URL to check if a payment has been settled (LUD-21).
 *
 * Pass the originating pay request (or its `callback` URL) as the second
 * argument so the verify URL is validated with {@link validateVerifyUrl}
 * before it is fetched. Callers SHOULD always do this - the verify URL comes
 * from the service, not from the wallet.
 *
 * Unknown response fields are passed through, so extensions such as a
 * fiat-payout delivery object stay reachable on the returned value.
 */
export async function verifyPayment(
  verifyUrl: string,
  callback?: string | PayRequestResponse,
): Promise<VerifyResponse> {
  if (callback !== undefined) {
    validateVerifyUrl(verifyUrl, typeof callback === 'string' ? callback : callback.callback)
  } else {
    // No callback to relate it to; at minimum refuse non-HTTP schemes.
    const parsed = buildUrl(verifyUrl, 'verify URL')
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new LnurlError(
        `Verify URL must use http(s): (got "${parsed.protocol}")`,
        'INSECURE_VERIFY_URL',
      )
    }
  }

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
    ...passthrough(data, VERIFY_KNOWN_FIELDS),
    settled: data.settled as boolean,
    preimage: (data.preimage as string) || null,
    pr: data.pr as string,
  }
}

const VERIFY_KNOWN_FIELDS = new Set(['settled', 'preimage', 'pr', 'status', 'reason'])

// ── Helpers ────────────────────────────────────────────────────────────

/** Parse a URL, raising a typed LNURL error instead of a bare TypeError. */
function buildUrl(input: string, label: string): URL {
  try {
    return new URL(input)
  } catch {
    throw new LnurlError(`Invalid ${label}: ${input}`, 'INVALID_URL')
  }
}

/** Copy every field that is not part of the typed shape. */
function passthrough(data: Record<string, unknown>, known: Set<string>): Record<string, unknown> {
  const extra: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (!known.has(key)) extra[key] = value
  }
  return extra
}

/** Redact a `pin=` query parameter wherever it appears in free text. */
function scrubPin(text: string): string {
  return text.replace(/([?&]pin=)[^&\s"']*/gi, '$1***')
}

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
