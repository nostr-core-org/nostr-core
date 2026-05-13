import { hexToBytes, randomBytes, bytesToHex } from '@noble/hashes/utils.js'

import { getPublicKey } from './crypto.js'
import { finalizeEvent, type EventTemplate, type NostrEvent, type VerifiedEvent } from './event.js'
import type { Filter } from './filter.js'
import * as nip04 from './nip04.js'
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

export type Nip46ConnectionOptions = {
  remotePubkey: string
  relayUrls: string[]
  secretKey?: Uint8Array
  secret?: string
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

  public timeout = 60000

  constructor(connectionOrOpts: string | Nip46ConnectionOptions) {
    const opts = typeof connectionOrOpts === 'string'
      ? parseConnectionURI(connectionOrOpts)
      : connectionOrOpts

    this.remotePubkey = opts.remotePubkey
    this.relayUrls = opts.relayUrls
    this.secretKey = opts.secretKey || randomBytes(32)
    this.publicKey = getPublicKey(this.secretKey)
    this.secret = opts.secret
  }

  get connected(): boolean {
    return this._connected
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

      try {
        await this._sendRequest('connect', params)
      } catch (err) {
        this.relay.close()
        lastError = err as Error
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

  private async _sendRequest(method: Nip46Method, params: string[]): Promise<string> {
    if (method !== 'connect' && !this._connected) {
      throw new Nip46ConnectionError('Not connected. Call connect() first.')
    }

    const id = bytesToHex(randomBytes(16))
    const request = JSON.stringify({ id, method, params })

    // Encrypt with NIP-04
    const encrypted = nip04.encrypt(this.secretKey, this.remotePubkey, request)

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
      }, this.timeout)

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
    try {
      decrypted = nip04.decrypt(this.secretKey, this.remotePubkey, event.content)
    } catch {
      return // Ignore events we can't decrypt
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
