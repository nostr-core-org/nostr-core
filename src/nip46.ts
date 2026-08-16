import { hexToBytes, randomBytes, bytesToHex } from '@noble/hashes/utils.js'

import { getPublicKey } from './crypto.js'
import { finalizeEvent, type EventTemplate, type NostrEvent, type VerifiedEvent } from './event.js'
import type { Filter } from './filter.js'
import * as nip04 from './nip04.js'
import * as nip44 from './nip44.js'
import { Relay } from './relay.js'
import type { Signer, RelayMap } from './signer.js'

// NIP-46 event kind
const NIP46_KIND = 24133

// Error classes

export class Nip46Error extends Error {
  code: string
  constructor(message: string, code = 'NIP46_ERROR') {
    super(message)
    this.name = 'Nip46Error'
    this.code = code
  }
}

export class Nip46TimeoutError extends Nip46Error {
  constructor(message: string) {
    super(message, 'NIP46_TIMEOUT')
    this.name = 'Nip46TimeoutError'
  }
}

export class Nip46ConnectionError extends Nip46Error {
  constructor(message: string) {
    super(message, 'NIP46_CONNECTION_ERROR')
    this.name = 'Nip46ConnectionError'
  }
}

export class Nip46RemoteError extends Nip46Error {
  constructor(message: string) {
    super(message, 'NIP46_REMOTE_ERROR')
    this.name = 'Nip46RemoteError'
  }
}

// Types

export type Nip46Method =
  | 'connect'
  | 'disconnect'
  | 'describe'
  | 'get_public_key'
  | 'sign_event'
  | 'nip04_encrypt'
  | 'nip04_decrypt'
  | 'nip44_encrypt'
  | 'nip44_decrypt'
  | 'get_relays'

/** Transport encryption for the NIP-46 RPC channel. */
export type Nip46Encryption = 'nip44' | 'nip04'

/**
 * How to pick the RPC transport encryption.
 *
 * NIP-46 specifies NIP-44 and current signers (Amber, nsec.app) require it;
 * NIP-04 is kept only for backwards compatibility with older bunkers.
 * `'auto'` starts on NIP-44 and falls back to NIP-04 when the remote signer
 * either answers in NIP-04 or does not answer the NIP-44 handshake at all.
 */
export type Nip46EncryptionMode = Nip46Encryption | 'auto'

export type Nip46ConnectionOptions = {
  remotePubkey: string
  relayUrls: string[]
  secretKey?: Uint8Array
  secret?: string
  /** Default: `'auto'`. */
  encryption?: Nip46EncryptionMode
}

export type Nip46AppMetadata = {
  name?: string
  url?: string
  image?: string
}

type PendingRequest = {
  resolve: (result: string) => void
  reject: (err: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

// URI parsing

export function parseConnectionURI(uri: string): Nip46ConnectionOptions & { appMetadata?: Nip46AppMetadata } {
  // Accept both nostrconnect:// and bunker:// prefixes
  let normalized: string
  if (uri.startsWith('nostrconnect://')) {
    normalized = uri.replace('nostrconnect://', 'http://')
  } else if (uri.startsWith('bunker://')) {
    normalized = uri.replace('bunker://', 'http://')
  } else {
    throw new Nip46Error('Invalid connection URI: must start with nostrconnect:// or bunker://', 'INVALID_URI')
  }

  const url = new URL(normalized)
  const remotePubkey = url.host || url.pathname.replace('//', '')

  // Collect all relay params (supports multiple ?relay= params)
  const relayUrls = url.searchParams.getAll('relay')

  if (!remotePubkey) {
    throw new Nip46Error('Invalid connection URI: missing remote pubkey', 'INVALID_URI')
  }
  if (relayUrls.length === 0) {
    throw new Nip46Error('Invalid connection URI: missing relay parameter', 'INVALID_URI')
  }

  // Extract optional secret
  const secret = url.searchParams.get('secret') || undefined

  // Extract optional app metadata
  const name = url.searchParams.get('name') || undefined
  const appUrl = url.searchParams.get('url') || undefined
  const image = url.searchParams.get('image') || undefined

  const appMetadata: Nip46AppMetadata | undefined =
    name || appUrl || image ? { name, url: appUrl, image } : undefined

  return { remotePubkey, relayUrls, secret, ...(appMetadata ? { appMetadata } : {}) }
}

// NostrConnect class

export class NostrConnect implements Signer {
  private remotePubkey: string
  private relayUrls: string[]
  private secretKey: Uint8Array
  private publicKey: string
  private relay!: Relay
  private secret?: string
  private _connected = false
  private pendingRequests = new Map<string, PendingRequest>()
  private sub: { close: (reason?: string) => void } | undefined
  private encryptionMode: Nip46EncryptionMode
  private encryptionType: Nip46Encryption
  private conversationKey: Uint8Array | undefined

  public timeout = 60000
  /** Per-attempt timeout for the initial `connect` RPC, in ms. */
  public handshakeTimeout = 15000

  constructor(connectionOrOpts: string | Nip46ConnectionOptions) {
    const opts = typeof connectionOrOpts === 'string'
      ? parseConnectionURI(connectionOrOpts)
      : connectionOrOpts

    this.remotePubkey = opts.remotePubkey
    this.relayUrls = opts.relayUrls
    this.secretKey = opts.secretKey || randomBytes(32)
    this.publicKey = getPublicKey(this.secretKey)
    this.secret = opts.secret
    this.encryptionMode = opts.encryption ?? 'auto'
    this.encryptionType = this.encryptionMode === 'nip04' ? 'nip04' : 'nip44'
  }

  get connected(): boolean {
    return this._connected
  }

  /** The transport encryption currently in use for RPC payloads. */
  get encryption(): Nip46Encryption {
    return this.encryptionType
  }

  async connect(): Promise<void> {
    // Try each relay until one succeeds
    let lastError: Error | undefined
    for (const relayUrl of this.relayUrls) {
      const relay = new Relay(relayUrl)
      try {
        await relay.connect({ timeout: 5000 })
      } catch (err) {
        lastError = err as Error
        continue
      }

      this.relay = relay

      // Subscribe to responses from the remote signer
      this.sub = this.relay.subscribe(
        [
          {
            kinds: [NIP46_KIND],
            authors: [this.remotePubkey],
            '#p': [this.publicKey],
          } as Filter,
        ],
        {
          onevent: (event: NostrEvent) => {
            this._handleResponse(event)
          },
        },
      )

      // Send connect RPC with optional secret
      const params = this.secret
        ? [this.publicKey, this.secret]
        : [this.publicKey]

      // In 'auto' mode start on NIP-44 (spec + Amber) and fall back to NIP-04
      // only if the handshake goes unanswered. A signer that *replies* in
      // NIP-04 is detected by _handleResponse and pinned without a retry.
      const attempts: Nip46Encryption[] =
        this.encryptionMode === 'auto' ? ['nip44', 'nip04'] : [this.encryptionMode]

      let handshakeError: Error | undefined
      let handshook = false

      for (const scheme of attempts) {
        this._setEncryption(scheme)
        try {
          await this._sendRequest('connect', params, this.handshakeTimeout)
          handshook = true
          break
        } catch (err) {
          handshakeError = err as Error
          // Only a silent signer justifies trying the other scheme; a real
          // remote error means we were understood and should surface it.
          if (!(err instanceof Nip46TimeoutError)) break
        }
      }

      if (!handshook) {
        this.relay.close()
        lastError = handshakeError
        continue
      }

      this._connected = true
      return
    }

    throw new Nip46ConnectionError(
      `Failed to connect to any relay: ${lastError?.message || 'no relays provided'}`,
    )
  }

  async disconnect(): Promise<void> {
    if (!this._connected) return
    try {
      await this._sendRequest('disconnect', [])
    } catch {
      // Best effort
    }
    this.close()
  }

  close(): void {
    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout)
      pending.reject(new Nip46Error('Connection closed'))
      this.pendingRequests.delete(id)
    }
    this.sub?.close()
    this.sub = undefined
    this.relay?.close()
    this._connected = false
  }

  async describe(): Promise<string[]> {
    const result = await this._sendRequest('describe', [])
    return JSON.parse(result)
  }

  // Signer interface

  async getPublicKey(): Promise<string> {
    return this._sendRequest('get_public_key', [])
  }

  async signEvent(event: EventTemplate): Promise<VerifiedEvent> {
    const result = await this._sendRequest('sign_event', [JSON.stringify(event)])
    return JSON.parse(result)
  }

  nip04 = {
    encrypt: async (pubkey: string, plaintext: string): Promise<string> => {
      return this._sendRequest('nip04_encrypt', [pubkey, plaintext])
    },
    decrypt: async (pubkey: string, ciphertext: string): Promise<string> => {
      return this._sendRequest('nip04_decrypt', [pubkey, ciphertext])
    },
  }

  nip44 = {
    encrypt: async (pubkey: string, plaintext: string): Promise<string> => {
      return this._sendRequest('nip44_encrypt', [pubkey, plaintext])
    },
    decrypt: async (pubkey: string, ciphertext: string): Promise<string> => {
      return this._sendRequest('nip44_decrypt', [pubkey, ciphertext])
    },
  }

  async getRelays(): Promise<RelayMap> {
    const result = await this._sendRequest('get_relays', [])
    return JSON.parse(result)
  }

  // Private methods

  private _setEncryption(scheme: Nip46Encryption): void {
    if (this.encryptionType !== scheme) this.conversationKey = undefined
    this.encryptionType = scheme
  }

  private _encrypt(plaintext: string): string {
    if (this.encryptionType === 'nip44') {
      this.conversationKey ??= nip44.getConversationKey(this.secretKey, this.remotePubkey)
      return nip44.encrypt(plaintext, this.conversationKey)
    }
    return nip04.encrypt(this.secretKey, this.remotePubkey, plaintext)
  }

  private _decryptAs(ciphertext: string, scheme: Nip46Encryption): string {
    if (scheme === 'nip44') {
      this.conversationKey ??= nip44.getConversationKey(this.secretKey, this.remotePubkey)
      return nip44.decrypt(ciphertext, this.conversationKey)
    }
    return nip04.decrypt(this.secretKey, this.remotePubkey, ciphertext)
  }

  /**
   * Decrypt a response and report which scheme worked. NIP-04 ciphertexts carry
   * an `?iv=` marker, so the shape gives a reliable first guess.
   */
  private _decryptWithScheme(ciphertext: string): { plaintext: string; scheme: Nip46Encryption } {
    const order: Nip46Encryption[] = ciphertext.includes('?iv=')
      ? ['nip04', 'nip44']
      : ['nip44', 'nip04']

    for (const scheme of order) {
      try {
        return { plaintext: this._decryptAs(ciphertext, scheme), scheme }
      } catch {
        // try the other scheme
      }
    }
    throw new Nip46Error('Failed to decrypt response', 'NIP46_DECRYPTION_ERROR')
  }

  private async _sendRequest(
    method: Nip46Method,
    params: string[],
    timeoutMs?: number,
  ): Promise<string> {
    if (method !== 'connect' && !this._connected) {
      throw new Nip46ConnectionError('Not connected. Call connect() first.')
    }

    const id = bytesToHex(randomBytes(16))
    const request = JSON.stringify({ id, method, params })

    const encrypted = this._encrypt(request)

    const eventTemplate: EventTemplate = {
      kind: NIP46_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['p', this.remotePubkey]],
      content: encrypted,
    }

    const event = finalizeEvent(eventTemplate, this.secretKey)

    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Nip46TimeoutError(`Request timed out: ${method}`))
      }, timeoutMs ?? this.timeout)

      this.pendingRequests.set(id, { resolve, reject, timeout })

      this.relay.publish(event).catch((err) => {
        clearTimeout(timeout)
        this.pendingRequests.delete(id)
        reject(new Nip46Error(`Failed to publish ${method}: ${(err as Error).message}`))
      })
    })
  }

  private _handleResponse(event: NostrEvent): void {
    let decrypted: string
    let scheme: Nip46Encryption
    try {
      ({ plaintext: decrypted, scheme } = this._decryptWithScheme(event.content))
    } catch {
      return // Ignore events we can't decrypt
    }

    // A signer that answers in NIP-04 only speaks NIP-04; adopt it for the rest
    // of the session unless the caller pinned a scheme explicitly.
    if (this.encryptionMode === 'auto' && scheme !== this.encryptionType) {
      this._setEncryption(scheme)
    }

    let response: { id: string; result?: string; error?: string }
    try {
      response = JSON.parse(decrypted)
    } catch {
      return // Ignore malformed responses
    }

    const pending = this.pendingRequests.get(response.id)
    if (!pending) return

    clearTimeout(pending.timeout)
    this.pendingRequests.delete(response.id)

    if (response.error) {
      pending.reject(new Nip46RemoteError(response.error))
    } else {
      pending.resolve(response.result || '')
    }
  }
}
