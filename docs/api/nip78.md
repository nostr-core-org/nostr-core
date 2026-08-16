# NIP-78

Arbitrary Custom App Data - relays as a personal database. Kind 30078 is addressable and keyed by a `d` tag naming your app or a context within it; kind 78 is a regular event for apps that need many entries in the same category. The NIP puts no constraints on the payload.

## Import

```ts
import { nip78 } from 'nostr-core'
// or import individual functions
import {
  createAppDataTemplate,
  createAppDataEvent,
  parseAppData,
  createAppDataJsonTemplate,
  createAppDataJsonEvent,
  parseAppDataJson,
  createEncryptedAppDataTemplate,
  createEncryptedAppDataEvent,
  parseEncryptedAppData,
  createEncryptedAppDataJsonEvent,
  parseEncryptedAppDataJson,
  createAppEventTemplate,
  createAppEvent,
  buildAppDataAddress,
  getAppDataFilter,
  APP_DATA_KIND,
  APP_EVENT_KIND,
} from 'nostr-core'
```

## Event Kinds

| Constant | Value | Description |
|----------|-------|-------------|
| `APP_DATA_KIND` | `30078` | Addressable app data, keyed by the `d` tag |
| `APP_EVENT_KIND` | `78` | Regular app event, for many entries per category |

## AppData Type

```ts
type AppData = {
  identifier: string
  content?: string
  tags?: string[][]
}

type ParsedAppData = {
  identifier: string
  content: string
  tags: string[][]     // every tag except `d`
  pubkey: string
  created_at: number
}
```

## Plain App Data

```ts
function createAppDataTemplate(data: AppData): EventTemplate
function createAppDataEvent(data: AppData, secretKey: Uint8Array): NostrEvent
function parseAppData(event: NostrEvent): ParsedAppData
```

```ts
const event = nip78.createAppDataEvent({
  identifier: 'my-app/prefs',
  content: 'theme=dark',
  tags: [['client', 'my-app']],
}, secretKey)

const prefs = nip78.parseAppData(event)
// { identifier: 'my-app/prefs', content: 'theme=dark', tags: [['client','my-app']], ... }
```

A conventional `d` value is `<app-name>/<context>`, which keeps one app's documents from colliding with another's.

## JSON Payloads

```ts
function createAppDataJsonTemplate(identifier: string, value: unknown, tags?: string[][]): EventTemplate
function createAppDataJsonEvent(identifier: string, value: unknown, secretKey: Uint8Array, tags?: string[][]): NostrEvent
function parseAppDataJson<T = unknown>(event: NostrEvent): T
```

```ts
const event = nip78.createAppDataJsonEvent('my-app/state', { theme: 'dark', items: [1, 2] }, secretKey)
const state = nip78.parseAppDataJson<{ theme: string; items: number[] }>(event)
```

`parseAppDataJson` throws if the content is not valid JSON.

## Encrypted App Data

The usual way to keep private application state on a public relay: the content is NIP-44 encrypted to yourself, and only the `d` tag stays readable.

```ts
function createEncryptedAppDataTemplate(data: AppData, secretKey: Uint8Array): EventTemplate
function createEncryptedAppDataEvent(data: AppData, secretKey: Uint8Array): NostrEvent
function parseEncryptedAppData(event: NostrEvent, secretKey: Uint8Array): ParsedAppData
function createEncryptedAppDataJsonEvent(identifier: string, value: unknown, secretKey: Uint8Array, tags?: string[][]): NostrEvent
function parseEncryptedAppDataJson<T = unknown>(event: NostrEvent, secretKey: Uint8Array): T
```

```ts
const folders = nip78.createEncryptedAppDataJsonEvent(
  'mail/folders',
  { inbox: ['id1'], archive: [] },
  secretKey,
)

folders.content        // opaque ciphertext
folders.tags           // [['d', 'mail/folders']] - still public

nip78.parseEncryptedAppDataJson(folders, secretKey)
// { inbox: ['id1'], archive: [] }
```

::: warning
The `d` tag is never encrypted. Do not put anything sensitive in the identifier - `mail/folders` is fine, `mail/folders/alice@example.com` is not.
:::

## Regular App Events (kind 78)

For data that is not replaceable - logs, entries, append-only records - use kind 78 and distinguish entries with your own tags.

```ts
function createAppEventTemplate(content: string, tags?: string[][]): EventTemplate
function createAppEvent(content: string, secretKey: Uint8Array, tags?: string[][]): NostrEvent
```

```ts
const entry = nip78.createAppEvent('user opened settings', secretKey, [
  ['l', 'analytics'],
  ['client', 'my-app'],
])
```

## Addressing & Filters

```ts
function buildAppDataAddress(pubkey: string, identifier: string): string
function getAppDataFilter(pubkey: string, identifier?: string | string[]): Filter
```

```ts
nip78.buildAppDataAddress(pubkey, 'my-app/prefs')
// '30078:<pubkey>:my-app/prefs'

nip78.getAppDataFilter(pubkey, 'my-app/prefs')
// { kinds: [30078], authors: [pubkey], '#d': ['my-app/prefs'] }

nip78.getAppDataFilter(pubkey, ['my-app/prefs', 'my-app/state'])
// { kinds: [30078], authors: [pubkey], '#d': ['my-app/prefs', 'my-app/state'] }
```

## Complete Example

Storing and reloading private app preferences:

```ts
import { nip78, RelayPool } from 'nostr-core'

const pool = new RelayPool()
const relays = ['wss://relay.damus.io']

// Save
await pool.publish(relays, nip78.createEncryptedAppDataJsonEvent(
  'my-app/prefs',
  { theme: 'dark', locale: 'en', mutedUsers: [] },
  secretKey,
))

// Load - kind 30078 is replaceable, so the newest event wins
const events = await pool.querySync(relays, nip78.getAppDataFilter(pubkey, 'my-app/prefs'))
const newest = events.sort((a, b) => b.created_at - a.created_at)[0]
const prefs = newest ? nip78.parseEncryptedAppDataJson(newest, secretKey) : defaults
```

## See Also

- [NIP-44](/api/nip44) - The encryption used for the private variants
- [NIP-51](/api/nip51) - Standardized lists, when interoperability matters
