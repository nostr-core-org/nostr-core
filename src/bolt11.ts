import { bech32 } from '@scure/base'
import { bytesToHex } from '@noble/hashes/utils'
import { sha256 } from '@noble/hashes/sha2'
import { secp256k1 } from '@noble/curves/secp256k1'
import { utf8Encoder } from './utils.js'

// ── Error ──────────────────────────────────────────────────────────────

export class Bolt11Error extends Error {
  code: string
  constructor(message: string, code = 'BOLT11_ERROR') {
    super(message)
    this.name = 'Bolt11Error'
    this.code = code
  }
}

// ── Types ──────────────────────────────────────────────────────────────

export type Bolt11Network = 'mainnet' | 'testnet' | 'signet' | 'regtest'

export type Bolt11RouteHint = {
  pubkey: string
  shortChannelId: string
  feeBaseMsat: number
  feeProportionalMillionths: number
  cltvExpiryDelta: number
}

export type Bolt11FallbackAddress = {
  version: number
  hex: string
}

export type Bolt11Invoice = {
  /** The canonical lowercase invoice string */
  paymentRequest: string
  /** HRP prefix (e.g. "lnbc", "lntb") */
  prefix: string
  /** Bitcoin network */
  network: Bolt11Network
  /** Amount in millisatoshis (undefined for zero-amount invoices) */
  amountMsat?: number
  /** Amount in satoshis (undefined for zero-amount invoices) */
  amountSat?: number
  /** Unix timestamp when invoice was created */
  timestamp: number
  /** Expiry time in seconds (default 3600) */
  expiry: number
  /** Absolute expiry timestamp (timestamp + expiry) */
  expiresAt: number
  /** Whether the invoice has expired at decode time */
  isExpired: boolean
  /** Payment hash (256-bit, hex) */
  paymentHash: string
  /** Payment secret (256-bit, hex) */
  paymentSecret?: string
  /** Short description (UTF-8) */
  description?: string
  /** SHA-256 hash of a longer description (hex) */
  descriptionHash?: string
  /** Payee node public key (33-byte compressed, hex) */
  payeeNodeKey?: string
  /** Minimum final CLTV expiry delta in blocks (default 18) */
  minFinalCltvExpiry: number
  /** Feature bits */
  featureBits?: Uint8Array
  /** Payment metadata (hex) */
  metadata?: string
  /** Route hints for private channels (each entry is one r-tag's hops) */
  routeHints: Bolt11RouteHint[][]
  /** Fallback on-chain addresses */
  fallbackAddresses: Bolt11FallbackAddress[]
  /** Signature R||S (64 bytes, hex) */
  signature: string
  /** Signature recovery flag (0-3) */
  recoveryFlag: number
  /** True if payee node key recovery from signature failed */
  signatureRecoveryFailed?: boolean
  /** Unrecognized tagged fields */
  unknownTags: { tag: number; words: number[] }[]
}

// ── Constants ──────────────────────────────────────────────────────────

const MAX_LENGTH = 7089

// Sorted longest-first for correct prefix matching
const CURRENCY_NETWORKS: [string, Bolt11Network][] = [
  ['bcrt', 'regtest'],
  ['tbs', 'signet'],
  ['bc', 'mainnet'],
  ['tb', 'testnet'],
]

// Multiplier → millisatoshis-per-unit (1 BTC = 10^11 msat)
const MULTIPLIER_MSAT: Record<string, number> = {
  m: 1e8,   // milli-BTC
  u: 1e5,   // micro-BTC
  n: 100,   // nano-BTC
  p: 0.1,   // pico-BTC (amount must be multiple of 10)
}
const BTC_MSAT = 1e11

// Tag type values (bech32 alphabet index)
const TAG_P = 1   // payment hash
const TAG_R = 3   // route hints
const TAG_9 = 5   // feature bits
const TAG_X = 6   // expiry
const TAG_F = 9   // fallback address
const TAG_D = 13  // description
const TAG_S = 16  // payment secret
const TAG_N = 19  // payee node key
const TAG_H = 23  // description hash
const TAG_C = 24  // min_final_cltv_expiry_delta
const TAG_M = 27  // metadata

// ── Helpers ────────────────────────────────────────────────────────────

/** Convert 5-bit words to a big-endian integer. */
function wordsToNum(words: number[]): number {
  let n = 0
  for (const w of words) n = n * 32 + w
  return n
}

/** Convert 5-bit words to bytes, discarding trailing partial bits. */
function wordsToBytes(words: number[]): Uint8Array {
  let bits = 0
  let acc = 0
  const out: number[] = []
  for (const w of words) {
    acc = (acc << 5) | w
    bits += 5
    while (bits >= 8) {
      bits -= 8
      out.push((acc >> bits) & 0xff)
    }
    acc &= (1 << bits) - 1
  }
  return new Uint8Array(out)
}

/** Convert 5-bit words to bytes, zero-padding trailing bits to byte boundary. */
function wordsToBytesZeroPad(words: number[]): Uint8Array {
  let bits = 0
  let acc = 0
  const out: number[] = []
  for (const w of words) {
    acc = (acc << 5) | w
    bits += 5
    while (bits >= 8) {
      bits -= 8
      out.push((acc >> bits) & 0xff)
    }
    acc &= (1 << bits) - 1
  }
  if (bits > 0) out.push((acc << (8 - bits)) & 0xff)
  return new Uint8Array(out)
}

function readU32(b: Uint8Array, o: number): number {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0
}

function readU16(b: Uint8Array, o: number): number {
  return (b[o] << 8) | b[o + 1]
}

/** Format an 8-byte short channel ID as "block x tx x output". */
function fmtScid(b: Uint8Array, o: number): string {
  const block = (b[o] << 16) | (b[o + 1] << 8) | b[o + 2]
  const tx = (b[o + 3] << 16) | (b[o + 4] << 8) | b[o + 5]
  const vout = (b[o + 6] << 8) | b[o + 7]
  return `${block}x${tx}x${vout}`
}

// ── HRP parsing ────────────────────────────────────────────────────────

function parseHrp(prefix: string): {
  network: Bolt11Network
  amountMsat?: number
  amountSat?: number
} {
  const rest = prefix.slice(2) // strip "ln"

  for (const [currency, network] of CURRENCY_NETWORKS) {
    if (!rest.startsWith(currency)) continue

    const amountStr = rest.slice(currency.length)
    if (!amountStr) return { network }

    const m = amountStr.match(/^(\d+)([munp])?$/)
    if (!m) {
      throw new Bolt11Error(`Invalid amount in prefix: ${prefix}`, 'INVALID_AMOUNT')
    }

    const num = parseInt(m[1], 10)
    const sfx = m[2] as string | undefined

    if (num <= 0) {
      throw new Bolt11Error('Amount must be positive', 'INVALID_AMOUNT')
    }
    if (sfx === 'p' && num % 10 !== 0) {
      throw new Bolt11Error('Pico-BTC amount must be a multiple of 10', 'INVALID_AMOUNT')
    }

    const amountMsat = Math.round(sfx ? num * MULTIPLIER_MSAT[sfx] : num * BTC_MSAT)
    return { network, amountMsat, amountSat: amountMsat / 1000 }
  }

  throw new Bolt11Error(`Unknown network: ${prefix}`, 'UNKNOWN_NETWORK')
}

// ── Decode ─────────────────────────────────────────────────────────────

/**
 * Decode a BOLT-11 Lightning invoice.
 *
 * Extracts amount, payment hash, description, expiry, route hints,
 * payee node key, and all other tagged fields from a bech32-encoded
 * Lightning invoice.
 *
 * @param invoice - A BOLT-11 invoice string (e.g. "lnbc10u1p...")
 * @returns Decoded invoice with all fields
 * @throws {Bolt11Error} If the invoice is malformed or missing required fields
 */
export function decode(invoice: string): Bolt11Invoice {
  // Normalize: lowercase, strip lightning: URI prefix
  const lower = invoice.toLowerCase().replace(/^lightning:/, '')

  // Bech32 decode
  let prefix: string
  let words: number[]
  try {
    const r = bech32.decode(lower as `${string}1${string}`, MAX_LENGTH)
    prefix = r.prefix
    words = Array.from(r.words)
  } catch (e) {
    throw new Bolt11Error(`Invalid bech32: ${(e as Error).message}`, 'INVALID_BECH32')
  }

  if (!prefix.startsWith('ln')) {
    throw new Bolt11Error(`Invalid prefix: ${prefix}`, 'INVALID_PREFIX')
  }

  const { network, amountMsat, amountSat } = parseHrp(prefix)

  // Minimum: 7 (timestamp) + 104 (signature) = 111 words
  if (words.length < 111) {
    throw new Bolt11Error('Invoice too short', 'INVALID_LENGTH')
  }

  // ── Timestamp: first 7 words (35 bits) ──
  const timestamp = wordsToNum(words.slice(0, 7))

  // ── Signature: last 104 words (520 bits → 65 bytes) ──
  const sigBytes = wordsToBytes(words.slice(-104))
  const signature = bytesToHex(sigBytes.slice(0, 64))
  const recoveryFlag = sigBytes[64]

  // ── Tagged fields: between timestamp and signature ──
  const tagWords = words.slice(7, -104)

  let paymentHash: string | undefined
  let paymentSecret: string | undefined
  let description: string | undefined
  let descriptionHash: string | undefined
  let payeeNodeKey: string | undefined
  let signatureRecoveryFailed = false
  let expiry = 3600
  let minFinalCltvExpiry = 18
  let featureBits: Uint8Array | undefined
  let metadata: string | undefined
  const routeHints: Bolt11RouteHint[][] = []
  const fallbackAddresses: Bolt11FallbackAddress[] = []
  const unknownTags: { tag: number; words: number[] }[] = []

  let pos = 0
  while (pos + 3 <= tagWords.length) {
    const tag = tagWords[pos]
    const len = tagWords[pos + 1] * 32 + tagWords[pos + 2]
    pos += 3

    if (pos + len > tagWords.length) {
      throw new Bolt11Error('Tag data overflows invoice', 'INVALID_TAG')
    }

    const d = tagWords.slice(pos, pos + len)
    pos += len

    switch (tag) {
      case TAG_P:
        if (len === 52) paymentHash = bytesToHex(wordsToBytes(d))
        break

      case TAG_S:
        if (len === 52) paymentSecret = bytesToHex(wordsToBytes(d))
        break

      case TAG_D:
        description = new TextDecoder().decode(wordsToBytes(d))
        break

      case TAG_H:
        if (len === 52) descriptionHash = bytesToHex(wordsToBytes(d))
        break

      case TAG_N:
        if (len === 53) payeeNodeKey = bytesToHex(wordsToBytes(d))
        break

      case TAG_X:
        expiry = wordsToNum(d)
        break

      case TAG_C:
        minFinalCltvExpiry = wordsToNum(d)
        break

      case TAG_F:
        if (d.length >= 1) {
          fallbackAddresses.push({
            version: d[0],
            hex: bytesToHex(wordsToBytes(d.slice(1))),
          })
        }
        break

      case TAG_R: {
        const bytes = wordsToBytes(d)
        const hints: Bolt11RouteHint[] = []
        for (let i = 0; i + 51 <= bytes.length; i += 51) {
          hints.push({
            pubkey: bytesToHex(bytes.slice(i, i + 33)),
            shortChannelId: fmtScid(bytes, i + 33),
            feeBaseMsat: readU32(bytes, i + 41),
            feeProportionalMillionths: readU32(bytes, i + 45),
            cltvExpiryDelta: readU16(bytes, i + 49),
          })
        }
        if (hints.length) routeHints.push(hints)
        break
      }

      case TAG_9:
        featureBits = wordsToBytes(d)
        break

      case TAG_M:
        metadata = bytesToHex(wordsToBytes(d))
        break

      default:
        unknownTags.push({ tag, words: Array.from(d) })
    }
  }

  if (!paymentHash) {
    throw new Bolt11Error('Missing required payment hash (tag p)', 'MISSING_PAYMENT_HASH')
  }

  // Recover payee pubkey from signature if not provided via n-tag
  if (!payeeNodeKey) {
    try {
      const hrpBytes = utf8Encoder.encode(prefix)
      const dataBytes = wordsToBytesZeroPad(words.slice(0, -104))
      const buf = new Uint8Array(hrpBytes.length + dataBytes.length)
      buf.set(hrpBytes)
      buf.set(dataBytes, hrpBytes.length)
      const msgHash = sha256(buf)

      const sig = secp256k1.Signature.fromCompact(sigBytes.slice(0, 64))
        .addRecoveryBit(recoveryFlag)
      payeeNodeKey = sig.recoverPublicKey(msgHash).toHex(true)
    } catch {
      signatureRecoveryFailed = true
    }
  }

  const expiresAt = timestamp + expiry
  const isExpired = Math.floor(Date.now() / 1000) > expiresAt

  return {
    paymentRequest: lower,
    prefix,
    network,
    amountMsat,
    amountSat,
    timestamp,
    expiry,
    expiresAt,
    isExpired,
    paymentHash,
    paymentSecret,
    description,
    descriptionHash,
    payeeNodeKey,
    signatureRecoveryFailed: signatureRecoveryFailed || undefined,
    minFinalCltvExpiry,
    featureBits,
    metadata,
    routeHints,
    fallbackAddresses,
    signature,
    recoveryFlag,
    unknownTags,
  }
}
