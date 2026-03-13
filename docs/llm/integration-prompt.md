# Integration Prompt

Use this prompt to quickly set up an AI agent for nostr-core / NWC wallet integration.

## Copy-Paste System Prompt

```
You are integrating with Lightning wallets using nostr-core, a JavaScript/TypeScript NWC (Nostr Wallet Connect) client implementing NIP-47.

## Setup
- Package: nostr-core (npm install nostr-core)
- Module: ESM only ("type": "module" in package.json)
- Runtime: Node.js 18+, Deno, Bun, Cloudflare Workers
- Auth: Connection string from user (nostr+walletconnect://...)

## Core Operations

1. CONNECT
   new NWC(connectionString) → await nwc.connect()
   Auto-detects NIP-04/NIP-44 encryption.

2. GET BALANCE
   await nwc.getBalance()
   Returns: { balance: number } (millisatoshis, 1 sat = 1000 msats)

3. PAY INVOICE
   await nwc.payInvoice(bolt11String, optionalAmountMsats?)
   Returns: { preimage: string, fees_paid?: number }

4. CREATE INVOICE
   await nwc.makeInvoice({ amount: msats, description?: string, expiry?: seconds })
   Returns: Transaction { invoice, payment_hash, amount, ... }

5. LIST TRANSACTIONS
   await nwc.listTransactions({ limit?, offset?, type?: 'incoming'|'outgoing', from?, until?, unpaid? })
   Returns: { transactions: Transaction[] }

6. KEYSEND
   await nwc.payKeysend({ amount: msats, pubkey: string, tlv_records?: [{type, value}] })
   Returns: { preimage, fees_paid? }

7. LOOKUP INVOICE
   await nwc.lookupInvoice({ payment_hash?: string, invoice?: string })
   Returns: Transaction

8. WALLET INFO
   await nwc.getInfo()
   Returns: { alias, network, methods[], block_height, ... }

9. BUDGET
   await nwc.getBudget()
   Returns: { used_budget?, total_budget?, renews_at?, renewal_period? }

10. SIGN MESSAGE
    await nwc.signMessage(message)
    Returns: { message, signature }

11. NOTIFICATIONS
    nwc.on('payment_received', handler)
    nwc.on('payment_sent', handler)
    Handler receives: { notification_type, notification: Transaction }

12. CLOSE
    nwc.close() - always call when done

## Signer Abstraction (NIP-07 & NIP-46)

nostr-core provides a unified Signer interface for event signing:

1. SECRET KEY SIGNER
   import { createSecretKeySigner, generateSecretKey } from 'nostr-core'
   const signer = createSecretKeySigner(generateSecretKey())

2. BROWSER EXTENSION (NIP-07)
   import { Nip07Signer } from 'nostr-core'
   const signer = new Nip07Signer() // wraps window.nostr

3. REMOTE SIGNER (NIP-46)
   import { NostrConnect } from 'nostr-core'
   // Supports nostrconnect:// and bunker:// URIs, multiple relays, optional secret
   const signer = new NostrConnect('nostrconnect://<pubkey>?relay=wss://...')
   // Or: new NostrConnect({ remotePubkey: '<hex>', relayUrls: ['wss://...'], secret: 'token' })
   await signer.connect() // tries each relay until one succeeds
   const methods = await signer.describe() // discover supported methods
   const relays = await signer.getRelays() // get relay list

All signers: signer.getPublicKey(), signer.signEvent(template), signer.nip04?.encrypt/decrypt, signer.nip44?.encrypt/decrypt

4. GIFT WRAP (NIP-59)
   import { nip59 } from 'nostr-core'
   const rumor = nip59.createRumor(eventTemplate, senderPubkey)
   const seal = nip59.createSeal(rumor, senderSecretKey, recipientPubkey)
   const wrap = nip59.createWrap(seal, recipientPubkey)
   const unwrapped = nip59.unwrap(wrap, recipientSecretKey)

5. PRIVATE DMs (NIP-17)
   import { nip17 } from 'nostr-core'
   const wrap = nip17.wrapDirectMessage('Hello!', senderSk, recipientPk)
   const dm = nip17.unwrapDirectMessage(wrap, recipientSk)
   // dm.sender, dm.content, dm.tags, dm.created_at, dm.id

## Rules
- All amounts are in millisatoshis (1 sat = 1000 msats)
- Always call connect() before operations and close() when done
- Check getInfo().methods to verify wallet supports an operation before calling it
- Connection strings are secrets - never log or display them
- Use getBudget() to check spending limits before large payments
- Errors have a .code property: INSUFFICIENT_BALANCE, REPLY_TIMEOUT, CONNECTION_ERROR, etc.
- Default reply timeout is 60s. Set nwc.replyTimeout for custom values
- Confirm payment amounts with the user before calling payInvoice
```

## Quick Start Code Template

### JavaScript (ESM)

```javascript
import { NWC, NWCWalletError, NWCTimeoutError, NWCConnectionError } from 'nostr-core'

class WalletAgent {
  constructor(connectionString) {
    this.nwc = new NWC(connectionString)
  }

  async connect() {
    await this.nwc.connect()
    const info = await this.nwc.getInfo()
    return { alias: info.alias, methods: info.methods }
  }

  async getBalance() {
    const { balance } = await this.nwc.getBalance()
    return { msats: balance, sats: Math.floor(balance / 1000) }
  }

  async pay(invoice, amountMsats) {
    return await this.nwc.payInvoice(invoice, amountMsats)
  }

  async createInvoice(amountMsats, description) {
    return await this.nwc.makeInvoice({ amount: amountMsats, description })
  }

  async listPayments(limit = 20, type) {
    const { transactions } = await this.nwc.listTransactions({ limit, type })
    return transactions
  }

  async checkBudget() {
    return await this.nwc.getBudget()
  }

  onPaymentReceived(handler) {
    this.nwc.on('payment_received', handler)
  }

  close() {
    this.nwc.close()
  }
}

// Usage
const agent = new WalletAgent(process.env.NWC_CONNECTION_STRING)

try {
  const info = await agent.connect()
  console.log('Connected:', info.alias)

  const balance = await agent.getBalance()
  console.log(`Balance: ${balance.sats} sats`)

  const invoice = await agent.createInvoice(10000, 'Test payment')
  console.log('Invoice:', invoice.invoice)

  const payments = await agent.listPayments(5, 'incoming')
  console.log('Recent payments:', payments.length)
} catch (err) {
  if (err instanceof NWCWalletError) {
    console.error(`Wallet error [${err.code}]:`, err.message)
  } else if (err instanceof NWCTimeoutError) {
    console.error('Timeout:', err.code)
  } else if (err instanceof NWCConnectionError) {
    console.error('Connection failed:', err.message)
  } else {
    throw err
  }
} finally {
  agent.close()
}
```

### TypeScript

```typescript
import {
  NWC,
  NWCWalletError,
  NWCTimeoutError,
  NWCConnectionError,
  type GetInfoResponse,
  type GetBalanceResponse,
  type PayResponse,
  type Transaction,
  type GetBudgetResponse,
  type Nip47Notification,
} from 'nostr-core'

class WalletAgent {
  private nwc: NWC

  constructor(connectionString: string) {
    this.nwc = new NWC(connectionString)
  }

  async connect(): Promise<{ alias: string; methods: string[] }> {
    await this.nwc.connect()
    const info: GetInfoResponse = await this.nwc.getInfo()
    return { alias: info.alias, methods: info.methods }
  }

  async getBalance(): Promise<{ msats: number; sats: number }> {
    const { balance }: GetBalanceResponse = await this.nwc.getBalance()
    return { msats: balance, sats: Math.floor(balance / 1000) }
  }

  async pay(invoice: string, amountMsats?: number): Promise<PayResponse> {
    return await this.nwc.payInvoice(invoice, amountMsats)
  }

  async createInvoice(amountMsats: number, description?: string): Promise<Transaction> {
    return await this.nwc.makeInvoice({ amount: amountMsats, description })
  }

  async listPayments(limit = 20, type?: 'incoming' | 'outgoing'): Promise<Transaction[]> {
    const { transactions } = await this.nwc.listTransactions({ limit, type })
    return transactions
  }

  async checkBudget(): Promise<GetBudgetResponse> {
    return await this.nwc.getBudget()
  }

  onPaymentReceived(handler: (n: Nip47Notification) => void): void {
    this.nwc.on('payment_received', handler)
  }

  close(): void {
    this.nwc.close()
  }
}
```

### One-Liner Examples

```bash
# Set your connection string
export NWC_CONNECTION_STRING="nostr+walletconnect://..."

# Quick balance check (Node.js)
node -e "
import('nostr-core').then(async ({NWC}) => {
  const nwc = new NWC(process.env.NWC_CONNECTION_STRING);
  await nwc.connect();
  const {balance} = await nwc.getBalance();
  console.log(balance + ' msats');
  nwc.close();
})
"
```

## MCP Server Configuration

```json
{
  "name": "nostr-core-wallet",
  "description": "Lightning wallet operations via NWC (Nostr Wallet Connect)",
  "tools": [
    {
      "name": "wallet_get_balance",
      "description": "Get wallet balance in millisatoshis",
      "parameters": {}
    },
    {
      "name": "wallet_pay_invoice",
      "description": "Pay a BOLT-11 Lightning invoice",
      "parameters": {
        "invoice": { "type": "string", "description": "BOLT-11 invoice string", "required": true },
        "amount": { "type": "number", "description": "Amount in msats (for zero-amount invoices)", "required": false }
      }
    },
    {
      "name": "wallet_create_invoice",
      "description": "Create a Lightning invoice",
      "parameters": {
        "amount": { "type": "number", "description": "Amount in millisatoshis", "required": true },
        "description": { "type": "string", "description": "Invoice description", "required": false },
        "expiry": { "type": "number", "description": "Expiry in seconds", "required": false }
      }
    },
    {
      "name": "wallet_list_transactions",
      "description": "List wallet transactions",
      "parameters": {
        "limit": { "type": "number", "description": "Max results", "required": false },
        "type": { "type": "string", "enum": ["incoming", "outgoing"], "required": false }
      }
    },
    {
      "name": "wallet_lookup_invoice",
      "description": "Look up an invoice by payment hash",
      "parameters": {
        "payment_hash": { "type": "string", "required": false },
        "invoice": { "type": "string", "required": false }
      }
    },
    {
      "name": "wallet_get_info",
      "description": "Get wallet metadata and supported methods",
      "parameters": {}
    }
  ],
  "authentication": {
    "type": "env_var",
    "key": "NWC_CONNECTION_STRING",
    "description": "NWC connection string (nostr+walletconnect://...)"
  }
}
```

## Validation Checklist

- [ ] `npm install nostr-core` succeeds
- [ ] `NWC_CONNECTION_STRING` env var is set
- [ ] `nwc.connect()` completes without error
- [ ] `nwc.getInfo()` returns supported methods
- [ ] `nwc.getBalance()` returns a balance
- [ ] `nwc.makeInvoice()` creates an invoice successfully
- [ ] `nwc.listTransactions()` returns transaction history
- [ ] Error handling works for `NWCWalletError`, `NWCTimeoutError`, `NWCConnectionError`
- [ ] `nwc.close()` is called in all code paths (including error paths)
