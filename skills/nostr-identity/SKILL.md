---
name: nostr-identity
description: Generate and manage Nostr identities using nostr-core. Create keypairs, derive keys from mnemonics, verify NIP-05 addresses, set up signers (secret key, browser extension, remote signer), and publish profiles. Use when an agent needs a Nostr identity or the user asks about keys, signing, or NIP-05.
user-invocable: true
argument-hint: "[keys, mnemonic, nip05, signer, nip07, nip46, or profile]"
---

# Nostr Identity with nostr-core

You are an expert in Nostr identity management using nostr-core. You help developers generate keypairs, derive keys from mnemonics, verify NIP-05 identities, configure signers (secret key, browser extension, remote bunker), and publish profiles. You understand the security implications of key handling and always guide toward best practices.

## Generate a Keypair

```ts
import { generateSecretKey, getPublicKey, nip19, bytesToHex } from 'nostr-core'

const secretKey = generateSecretKey()
const publicKey = getPublicKey(secretKey)

const nsec = nip19.nsecEncode(secretKey)
const npub = nip19.npubEncode(publicKey)

console.log('npub:', npub)
console.log('hex pubkey:', publicKey)
console.log('nsec:', nsec)
console.log('hex secret:', bytesToHex(secretKey))
```

> Never log or expose the secret key in production. Store it in an environment variable or secure vault.

## Derive Keys from Mnemonic (NIP-06)

For deterministic key recovery using a BIP-39 mnemonic:

```ts
import { nip06 } from 'nostr-core'

// Generate a new mnemonic
const mnemonic = nip06.generateMnemonic()
console.log('Mnemonic (store securely):', mnemonic)

// Derive the default keypair (account 0)
const { secretKey, publicKey } = nip06.mnemonicToKey(mnemonic)

// Derive additional accounts
const account1 = nip06.mnemonicToKey(mnemonic, 1)
const account2 = nip06.mnemonicToKey(mnemonic, 2)

// Validate an existing mnemonic
const isValid = nip06.validateMnemonic('word1 word2 ...')
```

## Verify a NIP-05 Address

NIP-05 maps `user@domain` to a public key via DNS:

```ts
import { nip05 } from 'nostr-core'

// Look up a NIP-05 address
const result = await nip05.queryNip05('bob@example.com')
if (result) {
  console.log('Public key:', result.pubkey)
  console.log('Relays:', result.relays)
}

// Verify a specific pubkey owns an address
const valid = await nip05.verifyNip05('bob@example.com', expectedPubkey)
```

## Signer Interface

nostr-core provides a unified `Signer` interface. All three signers are interchangeable -- pick the one that fits the use case.

### Secret Key Signer (direct signing)

For agents and server-side code:

```ts
import { createSecretKeySigner, generateSecretKey } from 'nostr-core'

const signer = createSecretKeySigner(generateSecretKey())

const pubkey = await signer.getPublicKey()
const signed = await signer.signEvent(eventTemplate)
```

### Browser Extension Signer (NIP-07)

For web apps where the user has a browser extension (nos2x, Alby, etc.):

```ts
import { Nip07Signer, Nip07NotAvailableError } from 'nostr-core'

try {
  const signer = new Nip07Signer()
  const pubkey = await signer.getPublicKey()
  const signed = await signer.signEvent(eventTemplate)

  // Encryption is also available
  const encrypted = await signer.nip44.encrypt(recipientPubkey, plaintext)
} catch (err) {
  if (err instanceof Nip07NotAvailableError) {
    console.error('No Nostr extension found')
  }
}
```

### Remote Signer (NIP-46 / Nostr Connect)

For apps where keys are held by a remote signer (bunker):

```ts
import { NostrConnect } from 'nostr-core'

// From a connection URI
const signer = new NostrConnect('bunker://pubkey?relay=wss://relay.example.com')
await signer.connect()

// Or from explicit options
const signer2 = new NostrConnect({
  remotePubkey: 'hex_pubkey',
  relayUrls: ['wss://relay1.example.com', 'wss://relay2.example.com'],
  secret: 'optional_token'
})
await signer2.connect()

// Discover what the signer supports
const methods = await signer.describe()
const relays = await signer.getRelays()

// Use like any other signer
const signed = await signer.signEvent(eventTemplate)
```

## Publish a Profile (Kind 0)

```ts
import { finalizeEvent, hexToBytes } from 'nostr-core'

const secretKey = hexToBytes(process.env.NOSTR_SECRET_KEY)

const profile = finalizeEvent({
  kind: 0,
  content: JSON.stringify({
    name: 'My Agent',
    about: 'A Lightning-enabled Nostr agent',
    picture: 'https://example.com/avatar.png',
    nip05: 'agent@example.com'
  }),
  created_at: Math.floor(Date.now() / 1000),
  tags: []
}, secretKey)
```

## Bech32 Encoding/Decoding (NIP-19)

Convert between hex and human-readable formats:

```ts
import { nip19 } from 'nostr-core'

// Encode
const npub = nip19.npubEncode(hexPubkey)
const nsec = nip19.nsecEncode(secretKeyBytes)
const nevent = nip19.neventEncode({ id: eventId, relays: ['wss://relay.example.com'] })
const nprofile = nip19.nprofileEncode({ pubkey: hexPubkey, relays: ['wss://relay.example.com'] })

// Decode any bech32 entity
const decoded = nip19.decode('npub1...')
// decoded.type === 'npub', decoded.data === hex pubkey
```

## nostr: URI Scheme (NIP-21)

```ts
import { nip21 } from 'nostr-core'

const uri = nip21.encodeNostrURI('npub1...')    // 'nostr:npub1...'
const decoded = nip21.decodeNostrURI('nostr:npub1...')
const isNostr = nip21.isNostrURI('nostr:npub1...') // true
```

## Security Rules

1. Never commit secret keys or mnemonics to source control.
2. Use environment variables or secret managers for key storage.
3. Prefer NIP-46 remote signing over raw secret keys when possible.
4. Validate NIP-05 addresses before trusting them -- they can change.
5. Generate separate keypairs for separate agents or roles.
