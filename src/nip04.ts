import { hexToBytes, randomBytes } from '@noble/hashes/utils.js'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { cbc } from '@noble/ciphers/aes.js'
import { base64 } from '@scure/base'

import { utf8Decoder, utf8Encoder } from './utils.js'

export function encrypt(secretKey: string | Uint8Array, pubkey: string, text: string): string {
  const privkey: Uint8Array = secretKey instanceof Uint8Array ? secretKey : hexToBytes(secretKey)
  const key = secp256k1.getSharedSecret(privkey, hexToBytes('02' + pubkey))
  const normalizedKey = key.slice(1, 33)

  const iv = Uint8Array.from(randomBytes(16))
  const plaintext = utf8Encoder.encode(text)

  const ciphertext = cbc(normalizedKey, iv).encrypt(plaintext)

  const ctb64 = base64.encode(new Uint8Array(ciphertext))
  const ivb64 = base64.encode(new Uint8Array(iv.buffer))

  return `${ctb64}?iv=${ivb64}`
}

export function decrypt(secretKey: string | Uint8Array, pubkey: string, data: string): string {
  const privkey: Uint8Array = secretKey instanceof Uint8Array ? secretKey : hexToBytes(secretKey)
  const [ctb64, ivb64] = data.split('?iv=')
  const key = secp256k1.getSharedSecret(privkey, hexToBytes('02' + pubkey))
  const normalizedKey = key.slice(1, 33)

  const iv = base64.decode(ivb64)
  const ciphertext = base64.decode(ctb64)

  const plaintext = cbc(normalizedKey, iv).decrypt(ciphertext)

  return utf8Decoder.decode(plaintext)
}
