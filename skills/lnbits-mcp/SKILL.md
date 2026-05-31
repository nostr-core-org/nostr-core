---
name: lnbits-mcp
description: Connect nostr-core to a LNbits Lightning wallet via NWC and set up the LNbits MCP Server for conversational wallet control. Covers getting an NWC connection string from LNbits, connecting with the NWC class, verifying capabilities, installing and configuring the LNbits MCP Server (30+ tools), and Claude Desktop integration. Use when user mentions LNbits, wants to set up a Lightning wallet, or asks about MCP integration.
user-invocable: true
argument-hint: "[connect, mcp, or full]"
---

# LNbits MCP Integration with nostr-core

You are an expert in connecting nostr-core to LNbits and setting up the LNbits MCP Server for AI agent wallet control. You help developers get NWC connection strings from LNbits, wire up nostr-core's NWC client, verify wallet capabilities, and configure the LNbits MCP Server so AI agents can manage wallets through natural conversation. You know both the programmatic (nostr-core) and conversational (MCP) paths and recommend the right one for each use case.

## What You Need

| Component | What it does | Link |
|-----------|-------------|------|
| LNbits instance | Lightning wallet backend | https://lnbits.com |
| NWC extension | Generates NWC connection strings | Enabled in LNbits Extensions |
| nostr-core | Connects to the wallet via NWC | `npm install nostr-core` |

## Step 1: Get an NWC Connection String from LNbits

1. Open your LNbits instance (self-hosted or `https://demo.lnbits.com` for testing)
2. Go to **Extensions** in the sidebar
3. Enable the **Nostr Wallet Connect (NWC)** extension
4. Open the NWC extension and create a new connection
5. Set permissions (which methods the connection can use) and budget limits
6. Copy the connection string -- it starts with `nostr+walletconnect://`

Store it securely:

```
# .env (never commit this file)
NWC_CONNECTION_STRING=nostr+walletconnect://pubkey?relay=wss://...&secret=...
```

## Step 2: Connect with nostr-core

```ts
import { NWC } from 'nostr-core'

const nwc = new NWC(process.env.NWC_CONNECTION_STRING)

try {
  await nwc.connect()

  const info = await nwc.getInfo()
  console.log('Wallet:', info.alias)
  console.log('Methods:', info.methods)

  const { balance } = await nwc.getBalance()
  console.log('Balance:', Math.floor(balance / 1000), 'sats')
} finally {
  nwc.close()
}
```

## Step 3: Verify Capabilities

LNbits NWC connections can have restricted permissions. Always check:

```ts
const info = await nwc.getInfo()

const can = {
  pay:          info.methods.includes('pay_invoice'),
  receive:      info.methods.includes('make_invoice'),
  history:      info.methods.includes('list_transactions'),
  balance:      info.methods.includes('get_balance'),
  budget:       info.methods.includes('get_budget'),
  notifications: info.methods.includes('notifications')
}

console.log('Capabilities:', can)
```

> If a method is missing, the LNbits NWC connection was created without that permission. Go back to LNbits and update the connection settings.

## Step 4: Basic Operations

### Check balance

```ts
const { balance } = await nwc.getBalance()
console.log(Math.floor(balance / 1000), 'sats')
```

### Create an invoice

```ts
const invoice = await nwc.makeInvoice({
  amount: 1000 * 1000, // 1000 sats in msats
  description: 'Payment to agent'
})
console.log('Invoice:', invoice.invoice)
```

### Pay an invoice

```ts
import { NWCWalletError } from 'nostr-core'

try {
  const result = await nwc.payInvoice('lnbc...')
  console.log('Preimage:', result.preimage)
} catch (err) {
  if (err instanceof NWCWalletError) {
    console.error(err.code, err.message)
  }
}
```

### Listen for payments

```ts
nwc.on('payment_received', (notification) => {
  const sats = Math.floor(notification.notification.amount / 1000)
  console.log(`Received ${sats} sats`)
})
```

## Error Handling

```ts
import {
  NWCWalletError,
  NWCTimeoutError,
  NWCConnectionError,
  NWCDecryptionError
} from 'nostr-core'

try {
  await nwc.payInvoice(bolt11)
} catch (err) {
  if (err instanceof NWCWalletError) {
    // INSUFFICIENT_BALANCE, PAYMENT_FAILED, QUOTA_EXCEEDED, etc.
    console.error('Wallet:', err.code)
  } else if (err instanceof NWCTimeoutError) {
    // No response within timeout
    console.error('Timeout:', err.code)
  } else if (err instanceof NWCConnectionError) {
    // Relay unreachable
    console.error('Connection failed')
  } else if (err instanceof NWCDecryptionError) {
    // Wrong key or encryption mismatch
    console.error('Decryption failed')
  }
}
```

## LNbits MCP Server (Optional)

The LNbits MCP Server exposes 30+ wallet operations as MCP tools. AI agents can call them directly without writing code.

### Install

```bash
git clone https://github.com/lnbits/LNbits-MCP-Server.git
cd LNbits-MCP-Server
pip install -e .
```

Requires Python 3.10+.

### Configure Claude Desktop

Add to your config file:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "lnbits": {
      "command": "lnbits-mcp-server"
    }
  }
}
```

Restart Claude Desktop after saving.

### Connect

Tell the agent:

```
Configure lnbits.
URL: https://your-lnbits-instance.com
Key: your_admin_api_key
Auth method: api_key_header
```

The API key is in the LNbits sidebar under **Node URL, API keys and API docs**. Use the **Admin key** for full access or **Invoice key** for read-only + invoicing.

### Available MCP Tools

| Category | Tools |
|----------|-------|
| Wallet | `get_wallet_balance`, `get_wallet_details`, `get_payments`, `check_connection` |
| Payments | `create_invoice`, `pay_invoice`, `pay_lightning_address`, `decode_invoice`, `get_payment_status` |
| Config | `configure_lnbits`, `get_lnbits_configuration`, `test_lnbits_configuration` |
| Extensions | `create_lnurlp_link`, `create_tpos`, `create_satspay_charge`, `create_watchonly_wallet` |
| Admin | `get_node_info`, `list_users`, `create_user`, `get_system_stats` |

### Environment Variables (Alternative to Runtime Config)

```bash
export LNBITS_URL="https://your-lnbits-instance.com"
export LNBITS_API_KEY="your_api_key"
lnbits-mcp-server
```

### When to Use MCP vs nostr-core

- **MCP Server:** Conversational wallet control, quick operations, no code needed, Claude Desktop or Cursor
- **nostr-core:** Programmatic control, custom logic, payment flows, Nostr messaging, runs anywhere

Use both when you need conversational access AND protocol-level code.

## Resources

- LNbits: https://lnbits.com
- LNbits docs: https://docs.lnbits.com
- LNbits MCP Server: https://github.com/lnbits/LNbits-MCP-Server
- LNbits docs for agents: https://docs.lnbits.com/llm/
- NWC spec (NIP-47): https://github.com/nostr-protocol/nips/blob/master/47.md
