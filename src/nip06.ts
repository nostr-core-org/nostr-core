import { HDKey } from '@scure/bip32'
import { generateMnemonic as genMnemonic, mnemonicToSeedSync, validateMnemonic as valMnemonic } from '@scure/bip39'
import { wordlist as english } from '@scure/bip39/wordlists/english.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { schnorr } from '@noble/curves/secp256k1.js'

export type DerivedKey = {
  secretKey: Uint8Array
  publicKey: string
}

/**
 * Get the BIP-44 derivation path for Nostr keys.
 * Path: m/44'/1237'/<account>'/0/0
 */
export function getDerivationPath(accountIndex: number): string {
  return `m/44'/1237'/${accountIndex}'/0/0`
}

/**
 * Generate a BIP-39 mnemonic phrase.
 */
export function generateMnemonic(wordCount: 12 | 24 = 12): string {
  const strength = wordCount === 24 ? 256 : 128
  return genMnemonic(english, strength)
}

/**
 * Validate a BIP-39 mnemonic phrase.
 */
export function validateMnemonic(mnemonic: string): boolean {
  return valMnemonic(mnemonic, english)
}

/**
 * Derive a Nostr key pair from a BIP-39 mnemonic phrase.
 */
export function mnemonicToKey(mnemonic: string, accountIndex = 0, passphrase = ''): DerivedKey {
  if (!validateMnemonic(mnemonic)) {
    throw new Error('Invalid mnemonic')
  }
  const seed = mnemonicToSeedSync(mnemonic, passphrase)
  return deriveKey(seed, accountIndex)
}

/**
 * Derive a Nostr key pair from a BIP-32 seed.
 */
export function deriveKey(seed: Uint8Array, accountIndex = 0): DerivedKey {
  const path = getDerivationPath(accountIndex)
  const root = HDKey.fromMasterSeed(seed)
  const child = root.derive(path)

  if (!child.privateKey) throw new Error('Failed to derive private key')

  const secretKey = child.privateKey
  const publicKey = bytesToHex(schnorr.getPublicKey(secretKey))

  return { secretKey, publicKey }
}
