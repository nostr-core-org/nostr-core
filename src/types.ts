// NIP-47 Error Hierarchy

export class NWCError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'NWCError'
    this.code = code
  }
}

export class NWCWalletError extends NWCError {
  constructor(message: string, code: string) {
    super(message, code)
    this.name = 'NWCWalletError'
  }
}

export class NWCTimeoutError extends NWCError {
  constructor(message: string, code = 'TIMEOUT') {
    super(message, code)
    this.name = 'NWCTimeoutError'
  }
}

export class NWCPublishTimeoutError extends NWCTimeoutError {
  constructor(message: string) {
    super(message, 'PUBLISH_TIMEOUT')
    this.name = 'NWCPublishTimeoutError'
  }
}

export class NWCReplyTimeoutError extends NWCTimeoutError {
  constructor(message: string) {
    super(message, 'REPLY_TIMEOUT')
    this.name = 'NWCReplyTimeoutError'
  }
}

export class NWCPublishError extends NWCError {
  constructor(message: string) {
    super(message, 'PUBLISH_ERROR')
    this.name = 'NWCPublishError'
  }
}

export class NWCConnectionError extends NWCError {
  constructor(message: string) {
    super(message, 'CONNECTION_ERROR')
    this.name = 'NWCConnectionError'
  }
}

export class NWCDecryptionError extends NWCError {
  constructor(message: string) {
    super(message, 'DECRYPTION_ERROR')
    this.name = 'NWCDecryptionError'
  }
}

export class LightningAddressError extends NWCError {
  constructor(message: string) {
    super(message, 'LIGHTNING_ADDRESS_ERROR')
    this.name = 'LightningAddressError'
  }
}

export class FiatConversionError extends NWCError {
  constructor(message: string) {
    super(message, 'FIAT_CONVERSION_ERROR')
    this.name = 'FiatConversionError'
  }
}

// Fiat Conversion Types
export type FiatRate = {
  rate: number
  currency: string
  timestamp: number
}

export type FiatConversion = {
  sats: number
  rate: number
  currency: string
}

// Lightning Address Types
export type LightningAddressResponse = {
  invoice: string
  metadata?: Record<string, unknown>
}

// NIP-47 Encryption Types
export type EncryptionType = 'nip04' | 'nip44'

// NIP-47 Methods
export type Nip47Method =
  | 'get_info'
  | 'get_balance'
  | 'get_budget'
  | 'make_invoice'
  | 'pay_invoice'
  | 'pay_keysend'
  | 'lookup_invoice'
  | 'list_transactions'
  | 'sign_message'

export type Nip47NotificationType = 'payment_received' | 'payment_sent' | 'hold_invoice_accepted'

// NIP-47 Request/Response Types

export type GetInfoResponse = {
  alias: string
  color: string
  pubkey: string
  network: string
  block_height: number
  block_hash: string
  methods: string[]
  notifications?: string[]
}

export type GetBalanceResponse = {
  balance: number // msats
}

export type GetBudgetResponse = {
  used_budget?: number
  total_budget?: number
  renews_at?: number
  renewal_period?: string
}

export type PayResponse = {
  preimage: string
  fees_paid?: number
}

export type Transaction = {
  type: 'incoming' | 'outgoing'
  state: 'settled' | 'pending' | 'failed' | 'accepted'
  invoice: string
  description: string
  description_hash: string
  preimage: string
  payment_hash: string
  amount: number
  fees_paid: number
  settled_at: number
  created_at: number
  expires_at: number
  metadata?: Record<string, unknown>
}

export type MakeInvoiceRequest = {
  amount: number // msats
  description?: string
  description_hash?: string
  expiry?: number // seconds
}

export type PayInvoiceRequest = {
  invoice: string
  amount?: number // msats, for zero-amount invoices
}

export type PayKeysendRequest = {
  amount: number // msats
  pubkey: string
  preimage?: string
  tlv_records?: { type: number; value: string }[]
}

export type LookupInvoiceRequest = {
  payment_hash?: string
  invoice?: string
}

export type ListTransactionsRequest = {
  from?: number
  until?: number
  limit?: number
  offset?: number
  unpaid?: boolean
  type?: 'incoming' | 'outgoing'
}

export type ListTransactionsResponse = {
  transactions: Transaction[]
}

export type SignMessageRequest = {
  message: string
}

export type SignMessageResponse = {
  message: string
  signature: string
}

// NIP-47 Notification
export type Nip47Notification = {
  notification_type: Nip47NotificationType
  notification: Transaction
}

// Parsed NWC connection options
export type NWCConnectionOptions = {
  walletPubkey: string
  /** Primary relay URL (first relay in the connection string) */
  relayUrl: string
  /** All relay URLs from the connection string */
  relayUrls: string[]
  secret: string
}
