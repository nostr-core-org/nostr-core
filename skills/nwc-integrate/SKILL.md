---
name: nwc-integrate
description: Set up a project with nostr-core and connect to any NWC-compatible Lightning wallet. Scaffolds connection lifecycle, environment configuration, capability detection, and error handling. Use when integrating Lightning wallet functionality into a JavaScript or TypeScript application.
user-invocable: true
argument-hint: "[project path or description of what you're building]"
---

# NWC Wallet Integration with nostr-core

You are helping the user integrate Lightning wallet functionality into their project using **nostr-core**, a vendor-neutral NWC (Nostr Wallet Connect) client implementing the NIP-47 protocol.

## Step 1: Install nostr-core

```bash
npm install nostr-core
```

Requirements:
- Node.js 18+ (or Deno, Bun, Cloudflare Workers)
- ESM only - ensure `"type": "module"` is in `package.json`

## Step 2: Connection String

The user must provide an NWC connection string from their wallet. Ask them:

> "I need your NWC connection string to connect to your Lightning wallet. You can find it in your wallet's settings under 'Nostr Wallet Connect' or 'NWC'. It starts with `nostr+walletconnect://`. Please paste it here."

**Format:** `nostr+walletconnect://<walletPubkey>?relay=<relayUrl>&secret=<hexOrNsec>`

Multiple relays are supported — all are parsed and used for redundancy:

`nostr+walletconnect://<pubkey>?relay=wss://r1.com&relay=wss://r2.com&secret=<hex>`

**SECURITY RULES:**
- NEVER log, echo, commit, or display the connection string - it contains a private key
- Store it as an environment variable: `NWC_CONNECTION_STRING`
- Add `.env` to `.gitignore` if using dotenv

## Step 3: Connection Lifecycle

Always follow the connect → operate → close pattern:

```typescript
import { NWC } from 'nostr-core'

const nwc = new NWC(process.env.NWC_CONNECTION_STRING!)
await nwc.connect() // Auto-detects NIP-04 or NIP-44 encryption

try {
  // Wallet operations go here
  const { balance } = await nwc.getBalance()
  console.log(`Balance: ${balance} msats`)
} finally {
  nwc.close() // Always close when done
}
```

**Configuration:**
```typescript
nwc.replyTimeout = 30000   // Wallet reply timeout in ms (default: 60000)
nwc.publishTimeout = 10000 // Relay publish timeout in ms (default: 5000)
```

## Step 4: Capability Detection

Not all wallets support every NIP-47 method. Always check before calling:

```typescript
const info = await nwc.getInfo()
console.log('Wallet:', info.alias)
console.log('Network:', info.network)
console.log('Methods:', info.methods)
console.log('Notifications:', info.notifications)

// Check before using a method
if (info.methods.includes('pay_invoice')) {
  // Safe to call nwc.payInvoice()
}
```

**Available NIP-47 methods:**
`pay_invoice`, `get_balance`, `make_invoice`, `list_transactions`, `pay_keysend`, `lookup_invoice`, `get_info`, `get_budget`, `sign_message`, `multi_pay_invoice`, `multi_pay_keysend`

## Step 5: Error Handling

Import and handle the typed error hierarchy:

```typescript
import {
  NWC,
  NWCWalletError,
  NWCTimeoutError,
  NWCPublishTimeoutError,
  NWCReplyTimeoutError,
  NWCPublishError,
  NWCConnectionError,
  NWCDecryptionError,
  LightningAddressError,
  FiatConversionError,
} from 'nostr-core'

try {
  await nwc.payInvoice('lnbc...')
} catch (err) {
  if (err instanceof NWCWalletError) {
    // Wallet rejected request - err.code has the reason
    // Common codes: INSUFFICIENT_BALANCE, QUOTA_EXCEEDED, NOT_FOUND, PAYMENT_FAILED
  } else if (err instanceof NWCPublishTimeoutError) {
    // Relay didn't acknowledge - check relay URL, try different relay
  } else if (err instanceof NWCReplyTimeoutError) {
    // Wallet didn't respond - may be offline, increase replyTimeout
  } else if (err instanceof NWCConnectionError) {
    // Not connected - call nwc.connect() first
  } else if (err instanceof NWCDecryptionError) {
    // Connection string may be invalid or expired
  }
}
```

## Step 6: TypeScript Types

Key types to import for full type safety:

```typescript
import type {
  GetInfoResponse,
  GetBalanceResponse,
  GetBudgetResponse,
  PayResponse,
  Transaction,
  MakeInvoiceRequest,
  PayKeysendRequest,
  LookupInvoiceRequest,
  ListTransactionsRequest,
  ListTransactionsResponse,
  SignMessageResponse,
  Nip47Notification,
} from 'nostr-core'
```

## Complete Scaffold Template

```typescript
import {
  NWC,
  NWCWalletError,
  NWCTimeoutError,
  NWCConnectionError,
  type GetInfoResponse,
} from 'nostr-core'

async function main() {
  const connectionString = process.env.NWC_CONNECTION_STRING
  if (!connectionString) {
    throw new Error('Set NWC_CONNECTION_STRING environment variable')
  }

  const nwc = new NWC(connectionString)
  await nwc.connect()

  try {
    const info: GetInfoResponse = await nwc.getInfo()
    console.log(`Connected to ${info.alias} on ${info.network}`)
    console.log(`Supported: ${info.methods.join(', ')}`)

    const { balance } = await nwc.getBalance()
    console.log(`Balance: ${Math.floor(balance / 1000)} sats`)

    // Your wallet operations here...

  } catch (err) {
    if (err instanceof NWCWalletError) {
      console.error(`Wallet error [${err.code}]: ${err.message}`)
    } else if (err instanceof NWCTimeoutError) {
      console.error(`Timeout [${err.code}]: ${err.message}`)
    } else if (err instanceof NWCConnectionError) {
      console.error(`Connection error: ${err.message}`)
    } else {
      throw err
    }
  } finally {
    nwc.close()
  }
}

main()
```

## Key Rules

- All amounts are in **millisatoshis** (1 sat = 1,000 msats)
- Always call `connect()` before operations and `close()` when done
- Check `getInfo().methods` to verify wallet support before calling a method
- Connection strings are secrets - never log or display them
- Default reply timeout is 60s - set `nwc.replyTimeout` for custom values
- Use `getBudget()` to check spending limits before large payments
