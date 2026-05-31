import { bytesToHex } from '@noble/hashes/utils.js'
import { schnorr } from '@noble/curves/secp256k1.js'

import { finalizeEvent, type EventTemplate, type VerifiedEvent } from './event.js'
import * as nip04 from './nip04.js'
import * as nip44 from './nip44.js'

export type RelayMap = Record<string, { read: boolean; write: boolean }>

export interface Signer {
  getPublicKey(): Promise<string>
  signEvent(event: EventTemplate): Promise<VerifiedEvent>
  nip04?: {
    encrypt(pubkey: string, plaintext: string): Promise<string>
    decrypt(pubkey: string, ciphertext: string): Promise<string>
  }
  nip44?: {
    encrypt(pubkey: string, plaintext: string): Promise<string>
    decrypt(pubkey: string, ciphertext: string): Promise<string>
  }
  getRelays?(): Promise<RelayMap>
}

export function createSecretKeySigner(secretKey: Uint8Array): Signer {
  const pubkey = bytesToHex(schnorr.getPublicKey(secretKey))

  return {
    async getPublicKey() {
      return pubkey
    },

    async signEvent(event: EventTemplate) {
      return finalizeEvent(event, secretKey)
    },

    nip04: {
      async encrypt(pubkey: string, plaintext: string) {
        return nip04.encrypt(secretKey, pubkey, plaintext)
      },
      async decrypt(pubkey: string, ciphertext: string) {
        return nip04.decrypt(secretKey, pubkey, ciphertext)
      },
    },

    nip44: {
      async encrypt(pubkey: string, plaintext: string) {
        const conversationKey = nip44.getConversationKey(secretKey, pubkey)
        return nip44.encrypt(plaintext, conversationKey)
      },
      async decrypt(pubkey: string, ciphertext: string) {
        const conversationKey = nip44.getConversationKey(secretKey, pubkey)
        return nip44.decrypt(ciphertext, conversationKey)
      },
    },
  }
}
