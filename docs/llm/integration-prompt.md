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

6. RELAY LIST METADATA (NIP-65)
   import { nip65 } from 'nostr-core'
   // Parse a kind 10002 event
   const relays = nip65.parseRelayList(event) // [{ url, read, write }]
   const readRelays = nip65.getReadRelays(relays)   // where to send mentions
   const writeRelays = nip65.getWriteRelays(relays) // where to fetch events
   // Create and sign a relay list
   const event = nip65.createRelayListEvent([{ url: 'wss://...', read: true, write: true }], secretKey)
   // Or create unsigned template for use with a Signer
   const template = nip65.createRelayListEventTemplate(relays)

## Additional NIPs

7. FOLLOW LIST (NIP-02)
   import { nip02 } from 'nostr-core'
   nip02.createFollowListEvent([{ pubkey, relay?, petname? }], secretKey) // kind 3
   nip02.parseFollowList(event) // ContactEntry[]
   nip02.isFollowing(event, pubkey) // boolean

8. DNS VERIFICATION (NIP-05)
   import { nip05 } from 'nostr-core'
   const result = await nip05.queryNip05('bob@example.com') // { pubkey, relays? }
   const valid = await nip05.verifyNip05('bob@example.com', expectedPubkey) // boolean

9. KEY DERIVATION (NIP-06)
   import { nip06 } from 'nostr-core'
   const mnemonic = nip06.generateMnemonic() // 12-word BIP-39
   const { secretKey, publicKey } = nip06.mnemonicToKey(mnemonic, accountIndex?)

10. EVENT DELETION (NIP-09)
    import { nip09 } from 'nostr-core'
    const deletion = nip09.createDeletionEvent({ targets: [{ type: 'event', id }], reason? }, sk)
    nip09.isDeletionOf(deletion, targetEvent) // boolean

11. THREADS (NIP-10)
    import { nip10 } from 'nostr-core'
    const thread = nip10.parseThread(event) // { root?, reply?, mentions[], profiles[] }
    const tags = nip10.buildThreadTags({ root: { id }, reply: { id } })

12. RELAY INFO (NIP-11)
    import { nip11 } from 'nostr-core'
    const info = await nip11.fetchRelayInfo('wss://relay.damus.io')
    nip11.supportsNip(info, 42) // boolean

13. PROOF OF WORK (NIP-13)
    import { nip13 } from 'nostr-core'
    nip13.minePow(template, difficulty) // mine PoW nonce
    nip13.verifyPow(event, minDifficulty) // verify PoW
    nip13.getPowDifficulty(event) // leading zero bits

14. REPOSTS (NIP-18)
    import { nip18 } from 'nostr-core'
    nip18.createRepostEvent({ id, pubkey, kind? }, secretKey, originalEvent?) // kind 6 or 16
    nip18.parseRepost(event) // { targetEventId, targetKind, embeddedEvent? }

15. NOSTR URI (NIP-21)
    import { nip21 } from 'nostr-core'
    nip21.encodeNostrURI('npub1...') // 'nostr:npub1...'
    nip21.decodeNostrURI('nostr:npub1...') // DecodedResult
    nip21.isNostrURI(str) // boolean

16. COMMENTS (NIP-22)
    import { nip22 } from 'nostr-core'
    nip22.createCommentEvent(content, { rootType, rootId, rootKind?, rootPubkey? }, sk)
    nip22.parseComment(event) // { rootType, rootId, content, ... }

17. LONG-FORM CONTENT (NIP-23)
    import { nip23 } from 'nostr-core'
    nip23.createLongFormEvent({ identifier, title?, content, hashtags? }, sk)
    nip23.parseLongForm(event) // { identifier, title, content, isDraft, ... }

18. EXTRA METADATA (NIP-24)
    import { nip24 } from 'nostr-core'
    nip24.parseExtendedMetadata(event) // { display_name?, website?, banner?, bot?, ... }
    nip24.buildUniversalTags({ hashtags: ['nostr'], references: ['https://...'] })

19. REACTIONS (NIP-25)
    import { nip25 } from 'nostr-core'
    nip25.createReactionEvent({ targetEvent: { id, pubkey }, content: '+' }, sk)
    nip25.parseReaction(event) // { isPositive, isNegative, emoji?, ... }

20. TEXT REFERENCES (NIP-27)
    import { nip27 } from 'nostr-core'
    nip27.extractReferences(content) // [{ uri, decoded, start, end }]
    nip27.replaceReferences(content, ref => `<a>${ref.uri}</a>`)

21. PUBLIC CHAT (NIP-28)
    import { nip28 } from 'nostr-core'
    nip28.createChannelEvent({ name, about?, picture? }, secretKey) // kind 40
    nip28.createChannelMessageEvent(channelId, content, secretKey) // kind 42
    nip28.parseChannelMetadata(event) // { name, about?, picture? }

22. GROUPS (NIP-29)
    import { nip29 } from 'nostr-core'
    nip29.createGroupChatEvent(groupId, content, sk)
    nip29.parseGroupMetadata(event) // { id, name, about, ... }

23. CUSTOM EMOJI (NIP-30)
    import { nip30 } from 'nostr-core'
    nip30.parseCustomEmojis(event) // [{ shortcode, url }]
    nip30.buildEmojiTags([{ shortcode: 'sats', url: 'https://...' }])

24. ALT TAG (NIP-31)
    import { nip31 } from 'nostr-core'
    nip31.addAltTag(tags, 'Description for unknown event kind')
    nip31.getAltTag(event) // string | undefined

25. CONTENT WARNING (NIP-36)
    import { nip36 } from 'nostr-core'
    nip36.addContentWarning(tags, reason?) // add content-warning tag
    nip36.getContentWarning(event) // string | undefined
    nip36.hasContentWarning(event) // boolean

26. EXPIRATION (NIP-40)
    import { nip40 } from 'nostr-core'
    nip40.addExpiration(tags, unixTimestamp) // add expiration tag
    nip40.isExpired(event) // boolean

27. RELAY AUTH (NIP-42)
    import { nip42 } from 'nostr-core'
    nip42.createAuthEvent({ relay: relayUrl, challenge }, sk)
    relay.onauth = (challenge) => { relay.auth(nip42.createAuthEvent(...)) }

28. PROXY TAGS (NIP-48)
    import { nip48 } from 'nostr-core'
    nip48.addProxyTag(tags, id, protocol) // add proxy tag
    nip48.getProxyTags(event) // ProxyTag[]
    nip48.isProxied(event) // boolean

29. SEARCH (NIP-50)
    import { nip50 } from 'nostr-core'
    nip50.buildSearchFilter(query, filter?) // SearchFilter with search field
    nip50.parseSearchQuery(query) // { text, modifiers }

30. LISTS (NIP-51)
    import { nip51 } from 'nostr-core'
    nip51.createListEvent({ kind: 10000, publicItems, privateItems? }, sk)
    nip51.parseList(event, sk?) // { publicItems, privateItems }

31. REPORTING (NIP-56)
    import { nip56 } from 'nostr-core'
    nip56.createReportEvent(targets, secretKey, content?) // kind 1984
    nip56.parseReport(event) // { targets: ReportTarget[], content }

32. ZAPS (NIP-57)
    import { nip57 } from 'nostr-core'
    nip57.createZapRequestEvent({ recipientPubkey, amount, relays }, sk)
    nip57.parseZapReceipt(event) // { recipientPubkey, senderPubkey, amount, bolt11 }

33. BADGES (NIP-58)
    import { nip58 } from 'nostr-core'
    nip58.createBadgeDefinitionEvent({ identifier, name, description }, sk)
    nip58.createBadgeAwardEvent({ badgeAddress, recipients }, sk)
    nip58.createBadgeRequestTemplate({ badgeAddress, proof: { type: 'payment', preimage, invoice } })
    nip58.createBadgeAcceptanceEvent({ requestEventId, badgeAddress, recipientPubkey }, sk)
    nip58.createBadgeRejectionEvent({ requestEventId, badgeAddress, reason? }, sk)
    nip58.extractBadgeProof(event) // BadgeProof | undefined
    nip58.hasBeenAwarded(pubkey, awards) // boolean

34. CALENDAR EVENTS (NIP-52)
    import { nip52 } from 'nostr-core'
    nip52.createDateBasedCalendarEvent({ identifier, title, start, end?, locations? }, sk) // kind 31922
    nip52.createTimeBasedCalendarEvent({ identifier, title, start, end?, startTzid? }, sk) // kind 31923
    nip52.createCalendarEvent({ identifier, title, eventAddresses? }, sk) // kind 31924
    nip52.createCalendarEventRSVP({ identifier, calendarEventAddress, status }, sk) // kind 31925
    nip52.parseDateBasedCalendarEvent(event) // DateBasedCalendarEvent
    nip52.parseTimeBasedCalendarEvent(event) // TimeBasedCalendarEvent
    nip52.parseCalendar(event) // Calendar
    nip52.parseCalendarEventRSVP(event) // CalendarEventRSVP

35. ZAP GOALS (NIP-75)
    import { nip75 } from 'nostr-core'
    nip75.createZapGoalEvent({ content, amount, relays, closedAt?, beneficiaries? }, sk) // kind 9041
    nip75.parseZapGoal(event) // ZapGoal
    nip75.isZapGoalOpen(event) // boolean
    nip75.calculateZapGoalProgress(zapReceipts) // number (msats)
    nip75.buildGoalTag(goalEventId, relay?) // ['goal', id, relay?]

36. HTTP AUTH (NIP-98)
    import { nip98 } from 'nostr-core'
    const authEvent = nip98.createHttpAuthEvent({ url, method, body? }, sk)
    const header = nip98.getAuthorizationHeader(authEvent) // "Nostr <base64>"

37. LNURL PROTOCOL (LUD-01/03/06/09/10/12/17/18/20/21)
    import { lnurl } from 'nostr-core'
    const encoded = lnurl.encodeLnurl('https://service.com/api?q=pay') // 'LNURL1...'
    const decoded = lnurl.decodeLnurl('LNURL1...') // 'https://service.com/api?q=pay'
    const isValid = lnurl.isLnurl('LNURL1...') // boolean
    const payReq = await lnurl.fetchPayRequest('LNURL1...') // LnurlPayResponse
    const invoice = await lnurl.requestInvoice({ payRequest, amountMsats, comment? })
    const withdrawReq = await lnurl.fetchWithdrawRequest('LNURL1...') // LnurlWithdrawResponse
    await lnurl.submitWithdrawRequest({ withdrawRequest, invoice })
    const metadata = lnurl.parseLnurlMetadata(payReq.metadata) // ParsedMetadata[]
    const action = lnurl.parseSuccessAction(successAction) // SuccessAction
    const decrypted = lnurl.decryptAesSuccessAction(aesAction, preimage) // plaintext
    const valid = lnurl.verifyPayment(payResponse) // boolean

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
