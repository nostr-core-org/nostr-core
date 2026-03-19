import { bytesToHex, hexToBytes } from '@noble/hashes/utils'

import { getPublicKey } from './crypto.js'
import { finalizeEvent, type NostrEvent, type EventTemplate } from './event.js'
import type { Filter } from './filter.js'
import * as nip04 from './nip04.js'
import * as nip44 from './nip44.js'
import { decode as nip19decode } from './nip19.js'
import { RelayPool } from './pool.js'
import type {
  EncryptionType,
  GetInfoResponse,
  GetBalanceResponse,
  GetBudgetResponse,
  PayResponse,
  Transaction,
  MakeInvoiceRequest,
  PayInvoiceRequest,
  PayKeysendRequest,
  LookupInvoiceRequest,
  ListTransactionsRequest,
  ListTransactionsResponse,
  SignMessageRequest,
  SignMessageResponse,
  Nip47Notification,
  Nip47NotificationType,
  NWCConnectionOptions,
  LightningAddressResponse,
} from './types.js'
import {
  NWCError,
  NWCWalletError,
  NWCTimeoutError,
  NWCPublishTimeoutError,
  NWCReplyTimeoutError,
  NWCPublishError,
  NWCConnectionError,
  NWCDecryptionError,
} from './types.js'
import { fetchInvoice } from './lightning-address.js'
import { fiatToSats } from './fiat.js'

// NIP-47 event kinds
const NWC_INFO_KIND = 13194
const NWC_REQUEST_KIND = 23194
const NWC_RESPONSE_KIND = 23195
const NWC_NOTIFICATION_NIP04_KIND = 23196
const NWC_NOTIFICATION_NIP44_KIND = 23197

type EventHandler = (notification: Nip47Notification) => void

export class NWC {
  private walletPubkey: string
  private relayUrls: string[]
  private secretKey: Uint8Array
  private publicKey: string
  private pool: RelayPool
  private encryptionType: EncryptionType | undefined
  private conversationKey: Uint8Array | undefined
  private _connected = false
  private eventHandlers = new Map<string, Set<EventHandler>>()
  private notificationSub: { close: (reason?: string) => void } | undefined

  // Timeout settings (ms)
  public replyTimeout = 60000
  public publishTimeout = 5000

  /** Primary relay URL (first relay in the connection string) */
  get relayUrl(): string {
    return this.relayUrls[0]
  }

  constructor(connectionString: string) {
    const opts = NWC.parseConnectionString(connectionString)
    this.walletPubkey = opts.walletPubkey
    this.relayUrls = opts.relayUrls
    this.secretKey = hexToBytes(opts.secret)
    this.publicKey = getPublicKey(this.secretKey)
    this.pool = new RelayPool()
  }

  static parseConnectionString(connectionString: string): NWCConnectionOptions {
    // Support both nostr+walletconnect:// and nostrwalletconnect:// formats
    const normalized = connectionString
      .replace('nostrwalletconnect://', 'http://')
      .replace('nostr+walletconnect://', 'http://')
      .replace('nostrwalletconnect:', 'http://')
      .replace('nostr+walletconnect:', 'http://')

    const url = new URL(normalized)
    const walletPubkey = url.host || url.pathname.replace('//', '')
    const relayUrls = url.searchParams.getAll('relay')
    let secret = url.searchParams.get('secret')

    if (!walletPubkey || relayUrls.length === 0 || !secret) {
      throw new NWCError('Invalid NWC connection string: missing pubkey, relay, or secret', 'INVALID_CONNECTION_STRING')
    }

    // Support nsec-encoded secrets
    if (secret.startsWith('nsec')) {
      const decoded = nip19decode(secret)
      if (decoded.type !== 'nsec') throw new NWCError('Invalid nsec in connection string', 'INVALID_CONNECTION_STRING')
      secret = bytesToHex(decoded.data as Uint8Array)
    }

    return {
      walletPubkey,
      relayUrl: relayUrls[0],
      relayUrls,
      secret: secret as string,
    }
  }

  get connected(): boolean {
    return this._connected
  }

  async connect(): Promise<void> {
    // Connect to all relays in parallel; succeed if at least one connects
    const results = await Promise.allSettled(
      this.relayUrls.map(url => this.pool.ensureRelay(url, { connectionTimeout: 5000 })),
    )

    const anyConnected = results.some(r => r.status === 'fulfilled')
    if (!anyConnected) {
      const firstError = results.find(r => r.status === 'rejected') as PromiseRejectedResult | undefined
      throw new NWCConnectionError(
        `Failed to connect to relays [${this.relayUrls.join(', ')}]: ${firstError?.reason?.message || 'unknown error'}`,
      )
    }
    this._connected = true

    // Auto-detect encryption type
    await this._detectEncryption()

    // Start notification subscription if we have handlers
    if (this.eventHandlers.size > 0) {
      this._startNotificationSub()
    }
  }

  // --- Public API Methods ---

  async payInvoice(invoice: string, amount?: number): Promise<PayResponse> {
    const params: PayInvoiceRequest = { invoice }
    if (amount !== undefined) params.amount = amount
    return this._executeRequest<PayResponse>('pay_invoice', params)
  }

  async getBalance(): Promise<GetBalanceResponse> {
    return this._executeRequest<GetBalanceResponse>('get_balance', {}, { replyTimeout: 10000 })
  }

  async makeInvoice(params: MakeInvoiceRequest): Promise<Transaction> {
    return this._executeRequest<Transaction>('make_invoice', params)
  }

  async getInfo(): Promise<GetInfoResponse> {
    return this._executeRequest<GetInfoResponse>('get_info', {}, { replyTimeout: 10000 })
  }

  async getBudget(): Promise<GetBudgetResponse> {
    return this._executeRequest<GetBudgetResponse>('get_budget', {}, { replyTimeout: 10000 })
  }

  async listTransactions(params: ListTransactionsRequest = {}): Promise<ListTransactionsResponse> {
    return this._executeRequest<ListTransactionsResponse>('list_transactions', params, { replyTimeout: 10000 })
  }

  async lookupInvoice(params: LookupInvoiceRequest): Promise<Transaction> {
    return this._executeRequest<Transaction>('lookup_invoice', params)
  }

  async payKeysend(params: PayKeysendRequest): Promise<PayResponse> {
    return this._executeRequest<PayResponse>('pay_keysend', params)
  }

  async signMessage(message: string): Promise<SignMessageResponse> {
    return this._executeRequest<SignMessageResponse>('sign_message', { message } as SignMessageRequest)
  }

  async payLightningAddress(address: string, amountSats: number): Promise<PayResponse & { invoice: string }> {
    const { invoice } = await fetchInvoice(address, amountSats)
    const payResult = await this.payInvoice(invoice)
    return { ...payResult, invoice }
  }

  async payLightningAddressFiat(
    address: string,
    fiatAmount: number,
    currency: string,
  ): Promise<PayResponse & { invoice: string; sats: number; rate: number }> {
    const { sats, rate } = await fiatToSats(fiatAmount, currency)
    const { invoice } = await fetchInvoice(address, sats)
    const payResult = await this.payInvoice(invoice)
    return { ...payResult, invoice, sats, rate }
  }

  // --- Event Emitter ---

  on(event: Nip47NotificationType, handler: EventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set())
    }
    this.eventHandlers.get(event)!.add(handler)

    // Start subscription if connected and not already running
    if (this._connected && !this.notificationSub) {
      this._startNotificationSub()
    }
  }

  off(event: Nip47NotificationType, handler: EventHandler): void {
    this.eventHandlers.get(event)?.delete(handler)
  }

  // --- Notification Subscription ---

  async subscribeNotifications(
    onNotification: (notification: Nip47Notification) => void,
    notificationTypes?: Nip47NotificationType[],
  ): Promise<() => void> {
    if (!this._connected) {
      throw new NWCConnectionError('Not connected. Call connect() first.')
    }
    if (!this.encryptionType) {
      await this._detectEncryption()
    }

    const notificationKind =
      this.encryptionType === 'nip04' ? NWC_NOTIFICATION_NIP04_KIND : NWC_NOTIFICATION_NIP44_KIND

    let subscribed = true
    let currentSub: { close: (reason?: string) => void } | undefined

    const startSub = () => {
      if (!subscribed) return

      currentSub = this.pool.subscribe(
        this.relayUrls,
        {
          kinds: [notificationKind],
          authors: [this.walletPubkey],
          '#p': [this.publicKey],
        } as Filter,
        {
          onevent: async (event: NostrEvent) => {
            try {
              const decryptedContent = await this._decrypt(event.content)
              const notification = JSON.parse(decryptedContent) as Nip47Notification
              if (notification.notification_type && notification.notification) {
                if (
                  !notificationTypes ||
                  notificationTypes.includes(notification.notification_type)
                ) {
                  onNotification(notification)
                }
              }
            } catch {
              // Ignore decryption/parse errors for notifications
            }
          },
          onclose: () => {
            // Attempt reconnect after a delay
            if (subscribed) {
              setTimeout(() => startSub(), 1000)
            }
          },
        },
      )
    }

    startSub()

    return () => {
      subscribed = false
      currentSub?.close()
    }
  }

  // --- Cleanup ---

  close(): void {
    this.notificationSub?.close()
    this.notificationSub = undefined
    this.pool.close()
    this._connected = false
    this.eventHandlers.clear()
  }

  // --- Private Methods ---

  private async _detectEncryption(): Promise<void> {
    if (this.encryptionType) return

    // Query the wallet service info event (kind 13194)
    const events = await this.pool.querySync(
      this.relayUrls,
      { kinds: [NWC_INFO_KIND], authors: [this.walletPubkey], limit: 1 } as Filter,
      { maxWait: 10000 },
    )

    if (!events.length) {
      // Default to nip04 if no info event found
      this.encryptionType = 'nip04'
      return
    }

    const infoEvent = events[0]
    const encryptionTag = infoEvent.tags.find(t => t[0] === 'encryption')
    const versionTag = infoEvent.tags.find(t => t[0] === 'v')

    if (encryptionTag) {
      const encryptions = encryptionTag[1].split(' ')
      if (encryptions.includes('nip44_v2') || encryptions.includes('nip44')) {
        this.encryptionType = 'nip44'
      } else {
        this.encryptionType = 'nip04'
      }
    } else if (versionTag && versionTag[1].includes('1.0')) {
      this.encryptionType = 'nip44'
    } else {
      this.encryptionType = 'nip04'
    }

    // Pre-compute conversation key for nip44
    if (this.encryptionType === 'nip44') {
      this.conversationKey = nip44.getConversationKey(this.secretKey, this.walletPubkey)
    }
  }

  private async _encrypt(content: string): Promise<string> {
    if (this.encryptionType === 'nip44') {
      if (!this.conversationKey) {
        this.conversationKey = nip44.getConversationKey(this.secretKey, this.walletPubkey)
      }
      return nip44.encrypt(content, this.conversationKey)
    }
    return nip04.encrypt(this.secretKey, this.walletPubkey, content)
  }

  private async _decrypt(content: string): Promise<string> {
    try {
      if (this.encryptionType === 'nip44') {
        if (!this.conversationKey) {
          this.conversationKey = nip44.getConversationKey(this.secretKey, this.walletPubkey)
        }
        return nip44.decrypt(content, this.conversationKey)
      }
      return nip04.decrypt(this.secretKey, this.walletPubkey, content)
    } catch (err) {
      throw new NWCDecryptionError(`Failed to decrypt response: ${(err as Error).message}`)
    }
  }

  private async _executeRequest<T>(
    method: string,
    params: unknown,
    opts?: { replyTimeout?: number },
  ): Promise<T> {
    if (!this._connected) {
      throw new NWCConnectionError('Not connected. Call connect() first.')
    }

    return new Promise<T>(async (resolve, reject) => {
      try {
        // Build and encrypt the request
        const command = { method, params }
        const encryptedContent = await this._encrypt(JSON.stringify(command))

        const eventTemplate: EventTemplate = {
          kind: NWC_REQUEST_KIND,
          created_at: Math.floor(Date.now() / 1000),
          tags: [['p', this.walletPubkey]],
          content: encryptedContent,
        }

        const event = finalizeEvent(eventTemplate, this.secretKey)

        // Subscribe for the response before publishing
        const replyTimeoutMs = opts?.replyTimeout || this.replyTimeout

        const replyTimer = setTimeout(() => {
          sub.close()
          reject(new NWCReplyTimeoutError(`Reply timeout for ${method}: event ${event.id}`))
        }, replyTimeoutMs)

        let responded = false
        const sub = this.pool.subscribe(
          this.relayUrls,
          {
            kinds: [NWC_RESPONSE_KIND],
            authors: [this.walletPubkey],
            '#e': [event.id],
          } as Filter,
          {
            onevent: async (responseEvent: NostrEvent) => {
              if (responded) return // Deduplicate across relays
              responded = true
              clearTimeout(replyTimer)
              sub.close()

              try {
                const decryptedContent = await this._decrypt(responseEvent.content)
                const response = JSON.parse(decryptedContent)

                if (response.result) {
                  resolve(response.result as T)
                } else if (response.error) {
                  reject(
                    new NWCWalletError(
                      response.error.message || 'Unknown wallet error',
                      response.error.code || 'INTERNAL',
                    ),
                  )
                } else {
                  reject(new NWCError('Unexpected response format', 'INTERNAL'))
                }
              } catch (err) {
                if (err instanceof NWCError) {
                  reject(err)
                } else {
                  reject(new NWCError(`Failed to process response: ${(err as Error).message}`, 'INTERNAL'))
                }
              }
            },
          },
        )

        // Publish the request to all relays
        const publishTimer = setTimeout(() => {
          sub.close()
          clearTimeout(replyTimer)
          reject(new NWCPublishTimeoutError(`Publish timeout for ${method}: event ${event.id}`))
        }, this.publishTimeout)

        try {
          const published = await this.pool.publish(this.relayUrls, event)
          clearTimeout(publishTimer)
          if (published.length === 0) {
            clearTimeout(replyTimer)
            sub.close()
            reject(new NWCPublishError(`Failed to publish ${method}: no relay accepted the event`))
          }
        } catch (err) {
          clearTimeout(publishTimer)
          clearTimeout(replyTimer)
          sub.close()
          reject(new NWCPublishError(`Failed to publish ${method}: ${(err as Error).message}`))
        }
      } catch (err) {
        if (err instanceof NWCError) {
          reject(err)
        } else {
          reject(new NWCError(`Request failed: ${(err as Error).message}`, 'INTERNAL'))
        }
      }
    })
  }

  private _startNotificationSub(): void {
    if (!this.encryptionType) return

    const notificationKind =
      this.encryptionType === 'nip04' ? NWC_NOTIFICATION_NIP04_KIND : NWC_NOTIFICATION_NIP44_KIND

    this.notificationSub = this.pool.subscribe(
      this.relayUrls,
      {
        kinds: [notificationKind],
        authors: [this.walletPubkey],
        '#p': [this.publicKey],
      } as Filter,
      {
        onevent: async (event: NostrEvent) => {
          try {
            const decryptedContent = await this._decrypt(event.content)
            const notification = JSON.parse(decryptedContent) as Nip47Notification
            if (notification.notification_type && notification.notification) {
              const handlers = this.eventHandlers.get(notification.notification_type)
              if (handlers) {
                for (const handler of handlers) {
                  try {
                    handler(notification)
                  } catch {
                    // Don't let handler errors break the subscription
                  }
                }
              }
            }
          } catch {
            // Ignore decryption/parse errors for notifications
          }
        },
      },
    )
  }

}
