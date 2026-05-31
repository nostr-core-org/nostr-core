---
name: lightning-agent
description: Scaffold a complete Lightning-enabled Nostr agent class using nostr-core. Provides a copy-paste agent with wallet operations, Nostr messaging, profile management, and event publishing. Use when the user wants a ready-made agent class, a starting template, or asks "build me an agent."
user-invocable: true
argument-hint: "[full, wallet-only, messaging-only, or minimal]"
---

# Lightning Agent Scaffold

You are an expert in building autonomous Lightning-enabled agents on Nostr using nostr-core. You provide production-ready, copy-paste agent scaffolds that combine wallet operations, encrypted messaging, identity management, and event publishing into a single reusable class. You tailor the scaffold to the developer's use case -- minimal wallet-only agents for payment bots, or full agents with messaging and social capabilities.

## Minimal Agent (Wallet Only)

The smallest useful agent -- connects to a wallet and handles payments:

```ts
import {
  NWC,
  NWCWalletError,
  NWCTimeoutError,
  fetchInvoice,
  type PayResponse,
  type Transaction
} from 'nostr-core'

class WalletAgent {
  private nwc: NWC

  constructor(connectionString: string) {
    this.nwc = new NWC(connectionString)
  }

  async connect(): Promise<string[]> {
    await this.nwc.connect()
    const info = await this.nwc.getInfo()
    return info.methods
  }

  async getBalance(): Promise<number> {
    const { balance } = await this.nwc.getBalance()
    return Math.floor(balance / 1000)
  }

  async createInvoice(sats: number, memo?: string): Promise<string> {
    const tx = await this.nwc.makeInvoice({ amount: sats * 1000, description: memo })
    return tx.invoice
  }

  async payInvoice(bolt11: string): Promise<PayResponse> {
    return await this.nwc.payInvoice(bolt11)
  }

  async payAddress(address: string, sats: number): Promise<PayResponse> {
    const invoice = await fetchInvoice(address, sats * 1000)
    return await this.nwc.payInvoice(invoice)
  }

  async listPayments(limit = 20, type?: 'incoming' | 'outgoing'): Promise<Transaction[]> {
    const { transactions } = await this.nwc.listTransactions({ limit, type })
    return transactions
  }

  onPaymentReceived(handler: (tx: Transaction) => void): void {
    this.nwc.on('payment_received', (n) => handler(n.notification as Transaction))
  }

  close(): void {
    this.nwc.close()
  }
}
```

## Full Agent (Wallet + Messaging + Identity)

The complete scaffold -- payments, DMs, notes, profile, and relay management:

```ts
import {
  NWC,
  NWCWalletError,
  NWCTimeoutError,
  NWCConnectionError,
  generateSecretKey,
  getPublicKey,
  finalizeEvent,
  nip17,
  nip19,
  nip24,
  Relay,
  RelayPool,
  fetchInvoice,
  fiatToSats,
  getExchangeRate,
  hexToBytes,
  bytesToHex,
  type NostrEvent,
  type PayResponse,
  type Transaction,
  type Nip47Notification
} from 'nostr-core'

interface AgentConfig {
  /** NWC connection string (nostr+walletconnect://...) */
  nwcConnectionString: string
  /** Hex-encoded secret key */
  secretKeyHex: string
  /** Relay URLs for publishing and subscribing */
  relays?: string[]
}

const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net'
]

class LightningAgent {
  private nwc: NWC
  private secretKey: Uint8Array
  private pool: RelayPool
  readonly publicKey: string
  readonly npub: string

  constructor(config: AgentConfig) {
    this.nwc = new NWC(config.nwcConnectionString)
    this.secretKey = hexToBytes(config.secretKeyHex)
    this.publicKey = getPublicKey(this.secretKey)
    this.npub = nip19.npubEncode(this.publicKey)
    this.pool = new RelayPool(config.relays ?? DEFAULT_RELAYS)
  }

  // --- Lifecycle ---

  async connect(): Promise<{ alias: string; methods: string[] }> {
    await this.nwc.connect()
    const info = await this.nwc.getInfo()
    return { alias: info.alias, methods: info.methods }
  }

  close(): void {
    this.nwc.close()
    for (const relay of this.pool.relays.values()) {
      relay.close()
    }
  }

  // --- Wallet ---

  async getBalance(): Promise<{ sats: number; msats: number }> {
    const { balance } = await this.nwc.getBalance()
    return { sats: Math.floor(balance / 1000), msats: balance }
  }

  async createInvoice(sats: number, memo?: string): Promise<{ invoice: string; hash: string }> {
    const tx = await this.nwc.makeInvoice({ amount: sats * 1000, description: memo })
    return { invoice: tx.invoice, hash: tx.payment_hash }
  }

  async payInvoice(bolt11: string): Promise<PayResponse> {
    return await this.nwc.payInvoice(bolt11)
  }

  async payAddress(address: string, sats: number): Promise<PayResponse> {
    const invoice = await fetchInvoice(address, sats * 1000)
    return await this.nwc.payInvoice(invoice)
  }

  async payFiat(address: string, amount: number, currency: string): Promise<PayResponse> {
    const rate = await getExchangeRate(currency)
    const sats = fiatToSats(amount, rate)
    return await this.payAddress(address, sats)
  }

  async listPayments(limit = 20, type?: 'incoming' | 'outgoing'): Promise<Transaction[]> {
    const { transactions } = await this.nwc.listTransactions({ limit, type })
    return transactions
  }

  onPaymentReceived(handler: (notification: Nip47Notification) => void): void {
    this.nwc.on('payment_received', handler)
  }

  // --- Messaging ---

  async sendDM(recipientPubkey: string, message: string): Promise<void> {
    const wrap = nip17.wrapDirectMessage(message, this.secretKey, recipientPubkey)
    await this.publishToFirstRelay(wrap)
  }

  async postNote(content: string): Promise<NostrEvent> {
    const event = finalizeEvent({
      kind: 1,
      content,
      created_at: Math.floor(Date.now() / 1000),
      tags: []
    }, this.secretKey)
    await this.publishToFirstRelay(event)
    return event
  }

  // --- Identity ---

  async updateProfile(profile: {
    name?: string
    about?: string
    picture?: string
    nip05?: string
    banner?: string
    website?: string
  }): Promise<NostrEvent> {
    const event = finalizeEvent({
      kind: 0,
      content: JSON.stringify(profile),
      created_at: Math.floor(Date.now() / 1000),
      tags: []
    }, this.secretKey)
    await this.publishToFirstRelay(event)
    return event
  }

  // --- Internal ---

  private async publishToFirstRelay(event: NostrEvent): Promise<void> {
    const url = [...this.pool.relays.keys()][0]
    if (!url) throw new Error('No relays configured')
    const relay = new Relay(url)
    await relay.connect()
    await relay.publish(event)
    relay.close()
  }
}

export { LightningAgent, type AgentConfig }
```

## Usage

```ts
const agent = new LightningAgent({
  nwcConnectionString: process.env.NWC_CONNECTION_STRING!,
  secretKeyHex: process.env.NOSTR_SECRET_KEY!,
  relays: ['wss://relay.damus.io', 'wss://nos.lol']
})

try {
  const { alias, methods } = await agent.connect()
  console.log(`Connected to ${alias}`)
  console.log(`npub: ${agent.npub}`)

  // Check balance
  const { sats } = await agent.getBalance()
  console.log(`Balance: ${sats} sats`)

  // Create an invoice
  const { invoice } = await agent.createInvoice(100, 'Agent fee')
  console.log('Invoice:', invoice)

  // Pay a Lightning Address
  await agent.payAddress('tips@lnbits.example.com', 50)

  // Send a DM
  await agent.sendDM(recipientPubkey, 'Payment sent!')

  // Post a note
  await agent.postNote('Agent online. Balance: ' + sats + ' sats.')

  // Update profile
  await agent.updateProfile({
    name: 'Lightning Agent',
    about: 'I process payments and post updates.'
  })

  // Listen for incoming payments
  agent.onPaymentReceived((n) => {
    const sats = Math.floor(n.notification.amount / 1000)
    console.log(`Received ${sats} sats`)
  })
} catch (err) {
  if (err instanceof NWCWalletError) {
    console.error('Wallet error:', err.code)
  } else if (err instanceof NWCTimeoutError) {
    console.error('Timeout')
  } else if (err instanceof NWCConnectionError) {
    console.error('Connection failed')
  } else {
    throw err
  }
} finally {
  agent.close()
}
```

## Environment Setup

```bash
# .env (never commit)
NWC_CONNECTION_STRING=nostr+walletconnect://...
NOSTR_SECRET_KEY=hex_secret_key_here
```

Generate a secret key if you don't have one:

```ts
import { generateSecretKey, bytesToHex } from 'nostr-core'
console.log(bytesToHex(generateSecretKey()))
```

## Extending the Agent

The scaffold is intentionally minimal. Common extensions:

- **Budget guards:** Call `nwc.getBudget()` before large payments
- **Relay management:** Use `RelayPool` for multi-relay publishing
- **Thread replies:** Add `nip10.buildThreadTags()` for reply context
- **Reactions:** Add `nip25.createReactionEvent()` for social feedback
- **Zaps:** Add `nip57.createZapRequestEvent()` for Lightning-powered reactions
- **Subscription loops:** Use `relay.subscribe()` to listen for mentions and DMs

Each of these is covered by a dedicated nostr-core skill:
- `/nostr-messaging` for DMs, notes, and subscriptions
- `/nostr-social` for threads, reactions, zaps, and badges
- `/lightning-pay` for advanced payment patterns
- `/wallet-monitor` for transaction history and analytics
