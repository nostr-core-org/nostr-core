import { bytesToHex, concatBytes, hexToBytes } from '@noble/hashes/utils.js'
import { bech32 } from '@scure/base'

import { utf8Decoder, utf8Encoder } from './utils.js'

export type ProfilePointer = {
  pubkey: string
  relays?: string[]
}

export type EventPointer = {
  id: string
  relays?: string[]
  author?: string
  kind?: number
}

export type AddressPointer = {
  identifier: string
  pubkey: string
  kind: number
  relays?: string[]
}

const Bech32MaxSize = 5000

type TLV = { [t: number]: Uint8Array[] }

function integerToUint8Array(number: number): Uint8Array {
  const uint8Array = new Uint8Array(4)
  uint8Array[0] = (number >> 24) & 0xff
  uint8Array[1] = (number >> 16) & 0xff
  uint8Array[2] = (number >> 8) & 0xff
  uint8Array[3] = number & 0xff
  return uint8Array
}

function parseTLV(data: Uint8Array): TLV {
  const result: TLV = {}
  let rest = data
  while (rest.length > 0) {
    const t = rest[0]
    const l = rest[1]
    const v = rest.slice(2, 2 + l)
    rest = rest.slice(2 + l)
    if (v.length < l) throw new Error(`not enough data to read on TLV ${t}`)
    result[t] = result[t] || []
    result[t].push(v)
  }
  return result
}

function encodeBech32<Prefix extends string>(prefix: Prefix, data: Uint8Array): `${Prefix}1${string}` {
  const words = bech32.toWords(data)
  return bech32.encode(prefix, words, Bech32MaxSize) as `${Prefix}1${string}`
}

function encodeTLV(tlv: TLV): Uint8Array {
  const entries: Uint8Array[] = []
  Object.entries(tlv)
    .reverse()
    .forEach(([t, vs]) => {
      vs.forEach(v => {
        const entry = new Uint8Array(v.length + 2)
        entry.set([parseInt(t)], 0)
        entry.set([v.length], 1)
        entry.set(v, 2)
        entries.push(entry)
      })
    })
  return concatBytes(...entries)
}

export type DecodedResult =
  | { type: 'nprofile'; data: ProfilePointer }
  | { type: 'nevent'; data: EventPointer }
  | { type: 'naddr'; data: AddressPointer }
  | { type: 'npub'; data: string }
  | { type: 'nsec'; data: Uint8Array }
  | { type: 'note'; data: string }

export function decode(code: string): DecodedResult {
  const { prefix, words } = bech32.decode(code as `${string}1${string}`, Bech32MaxSize)
  const data = new Uint8Array(bech32.fromWords(words))

  switch (prefix) {
    case 'nprofile': {
      const tlv = parseTLV(data)
      if (!tlv[0]?.[0]) throw new Error('missing TLV 0 for nprofile')
      if (tlv[0][0].length !== 32) throw new Error('TLV 0 should be 32 bytes')
      return {
        type: 'nprofile',
        data: {
          pubkey: bytesToHex(tlv[0][0]),
          relays: tlv[1] ? tlv[1].map(d => utf8Decoder.decode(d)) : [],
        },
      }
    }
    case 'nevent': {
      const tlv = parseTLV(data)
      if (!tlv[0]?.[0]) throw new Error('missing TLV 0 for nevent')
      if (tlv[0][0].length !== 32) throw new Error('TLV 0 should be 32 bytes')
      if (tlv[2] && tlv[2][0].length !== 32) throw new Error('TLV 2 should be 32 bytes')
      if (tlv[3] && tlv[3][0].length !== 4) throw new Error('TLV 3 should be 4 bytes')
      return {
        type: 'nevent',
        data: {
          id: bytesToHex(tlv[0][0]),
          relays: tlv[1] ? tlv[1].map(d => utf8Decoder.decode(d)) : [],
          author: tlv[2]?.[0] ? bytesToHex(tlv[2][0]) : undefined,
          kind: tlv[3]?.[0] ? parseInt(bytesToHex(tlv[3][0]), 16) : undefined,
        },
      }
    }
    case 'naddr': {
      const tlv = parseTLV(data)
      if (!tlv[0]?.[0]) throw new Error('missing TLV 0 for naddr')
      if (!tlv[2]?.[0]) throw new Error('missing TLV 2 for naddr')
      if (tlv[2][0].length !== 32) throw new Error('TLV 2 should be 32 bytes')
      if (!tlv[3]?.[0]) throw new Error('missing TLV 3 for naddr')
      if (tlv[3][0].length !== 4) throw new Error('TLV 3 should be 4 bytes')
      return {
        type: 'naddr',
        data: {
          identifier: utf8Decoder.decode(tlv[0][0]),
          pubkey: bytesToHex(tlv[2][0]),
          kind: parseInt(bytesToHex(tlv[3][0]), 16),
          relays: tlv[1] ? tlv[1].map(d => utf8Decoder.decode(d)) : [],
        },
      }
    }
    case 'nsec':
      return { type: prefix, data }
    case 'npub':
    case 'note':
      return { type: prefix, data: bytesToHex(data) }
    default:
      throw new Error(`unknown prefix ${prefix}`)
  }
}

export function nsecEncode(key: Uint8Array): string {
  return encodeBech32('nsec', key)
}

export function npubEncode(hex: string): string {
  return encodeBech32('npub', hexToBytes(hex))
}

export function noteEncode(hex: string): string {
  return encodeBech32('note', hexToBytes(hex))
}

export function nprofileEncode(profile: ProfilePointer): string {
  const data = encodeTLV({
    0: [hexToBytes(profile.pubkey)],
    1: (profile.relays || []).map(url => utf8Encoder.encode(url)),
  })
  return encodeBech32('nprofile', data)
}

export function neventEncode(event: EventPointer): string {
  const data = encodeTLV({
    0: [hexToBytes(event.id)],
    1: (event.relays || []).map(url => utf8Encoder.encode(url)),
    2: event.author ? [hexToBytes(event.author)] : [],
    3: event.kind !== undefined ? [integerToUint8Array(event.kind)] : [],
  })
  return encodeBech32('nevent', data)
}

export function naddrEncode(addr: AddressPointer): string {
  const kind = new ArrayBuffer(4)
  new DataView(kind).setUint32(0, addr.kind, false)
  const data = encodeTLV({
    0: [utf8Encoder.encode(addr.identifier)],
    1: (addr.relays || []).map(url => utf8Encoder.encode(url)),
    2: [hexToBytes(addr.pubkey)],
    3: [new Uint8Array(kind)],
  })
  return encodeBech32('naddr', data)
}
