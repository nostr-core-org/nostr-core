# NIP-87

Cashu and Fedimint Discoverability - mints announce themselves, users recommend the ones they trust, and other users find a mint through their own social graph rather than a hardcoded list.

## Import

```ts
import { nip87 } from 'nostr-core'
// or import individual functions
import {
  createMintRecommendationTemplate,
  createMintRecommendation,
  parseMintRecommendation,
  createCashuMintAnnouncementTemplate,
  createCashuMintAnnouncement,
  parseCashuMintAnnouncement,
  createFedimintAnnouncementTemplate,
  createFedimintAnnouncement,
  parseFedimintAnnouncement,
  buildMintAnnouncementAddress,
  getMintRecommendationFilter,
  getMintAnnouncementFilter,
  tallyRecommendations,
  isMintDiscoveryEvent,
  MINT_RECOMMENDATION_KIND,
  CASHU_MINT_KIND,
  FEDIMINT_KIND,
} from 'nostr-core'
```

## Event Kinds

| Constant | Value | Description |
|----------|-------|-------------|
| `MINT_RECOMMENDATION_KIND` | `38000` | A user endorsing a mint (addressable) |
| `CASHU_MINT_KIND` | `38172` | A Cashu mint announcement |
| `FEDIMINT_KIND` | `38173` | A Fedimint announcement |

## Cashu Mint Announcement (kind 38172)

```ts
type CashuMintAnnouncement = {
  identifier: string      // d tag: the mint's pubkey from /v1/info
  urls: string[]          // u tags
  nuts?: number[]         // nuts tag, comma-joined on the wire
  network?: MintNetwork
  content?: string        // optional kind-0 style metadata JSON
  extraTags?: string[][]
}

type MintNetwork = 'mainnet' | 'testnet' | 'signet' | 'regtest'
```

```ts
function createCashuMintAnnouncementTemplate(mint: CashuMintAnnouncement): EventTemplate
function createCashuMintAnnouncement(mint: CashuMintAnnouncement, secretKey: Uint8Array): NostrEvent
function parseCashuMintAnnouncement(event: NostrEvent): CashuMintAnnouncement
```

```ts
const announcement = nip87.createCashuMintAnnouncement({
  identifier: mintPubkey,
  urls: ['https://cashu.example.com'],
  nuts: [1, 2, 3, 4, 5, 6, 7],
  network: 'mainnet',
  content: JSON.stringify({ name: 'Example Mint', picture: 'https://...' }),
}, mintSecretKey)
```

Using the mint's pubkey as the `d` tag lets users look a mint up by identity even across duplicate announcements. If `content` is empty, clients should fall back to the announcing pubkey's kind 0 profile.

## Fedimint Announcement (kind 38173)

```ts
type FedimintAnnouncement = {
  identifier: string       // d tag: the federation id
  inviteCodes: string[]    // u tags
  modules?: string[]       // modules tag, comma-joined on the wire
  network?: MintNetwork
  content?: string
  extraTags?: string[][]
}
```

```ts
function createFedimintAnnouncementTemplate(fed: FedimintAnnouncement): EventTemplate
function createFedimintAnnouncement(fed: FedimintAnnouncement, secretKey: Uint8Array): NostrEvent
function parseFedimintAnnouncement(event: NostrEvent): FedimintAnnouncement
```

```ts
const announcement = nip87.createFedimintAnnouncement({
  identifier: federationId,
  inviteCodes: ['fed11abc...', 'fed11xyz...'],
  modules: ['lightning', 'wallet', 'mint'],
  network: 'signet',
}, secretKey)
```

## Recommendation (kind 38000)

Addressable, so a user can revise or withdraw an endorsement rather than piling up events.

```ts
type MintRecommendation = {
  identifier: string                      // d tag: the announcement's identifier
  recommendedKind?: 38172 | 38173         // k tag
  connections?: MintConnection[]          // u tags
  announcements?: MintAnnouncementRef[]   // a tags
  content?: string                        // free-form review
  extraTags?: string[][]
}

type MintConnection = {
  url: string      // mint URL (Cashu) or invite code (Fedimint)
  label?: string   // optional marker, e.g. 'cashu' / 'fedimint'
}

type MintAnnouncementRef = {
  address: string
  relayHint?: string
  label?: string
}
```

```ts
function createMintRecommendationTemplate(rec: MintRecommendation): EventTemplate
function createMintRecommendation(rec: MintRecommendation, secretKey: Uint8Array): NostrEvent
function parseMintRecommendation(event: NostrEvent): MintRecommendation
```

```ts
const rec = nip87.createMintRecommendation({
  identifier: mintPubkey,
  recommendedKind: 38172,
  connections: [{ url: 'https://cashu.example.com', label: 'cashu' }],
  announcements: [{
    address: nip87.buildMintAnnouncementAddress(38172, mintPubkey, mintPubkey),
    relayHint: 'wss://relay.example',
    label: 'cashu',
  }],
  content: 'Been using this for a year, no issues.',
}, secretKey)
```

The relay hint on the `a` tag matters: it disambiguates between duplicate announcements claiming to be the same mint.

## Filters

```ts
function getMintRecommendationFilter(opts?: {
  authors?: string[]
  kind?: 38172 | 38173
  identifiers?: string[]
}): Filter

function getMintAnnouncementFilter(opts?: {
  kinds?: (38172 | 38173)[]
  identifiers?: string[]
  authors?: string[]
}): Filter
```

```ts
// Recommendations from people the user actually follows
nip87.getMintRecommendationFilter({
  authors: [myPubkey, ...followList],
  kind: 38172,
})
// { kinds: [38000], authors: [...], '#k': ['38172'] }
```

::: warning
Querying `kind:38172` / `kind:38173` directly bypasses the web of trust entirely. Pair it with spam prevention or a curated relay, or you may point users at a malicious mint.
:::

## Utilities

### tallyRecommendations

```ts
function tallyRecommendations(events: NostrEvent[]): Map<string, number>
```

Counts distinct endorsing pubkeys per mint identifier. Because recommendations are addressable, only the newest event per `(author, identifier)` pair is counted, so a user who republishes still counts once.

```ts
const counts = nip87.tallyRecommendations(recommendationEvents)
const ranked = [...counts].sort((a, b) => b[1] - a[1])
```

### isMintDiscoveryEvent

```ts
function isMintDiscoveryEvent(event: NostrEvent): boolean
```

### buildMintAnnouncementAddress

```ts
function buildMintAnnouncementAddress(
  kind: 38172 | 38173,
  pubkey: string,
  identifier: string,
): string
```

## Complete Discovery Flow

```ts
import { nip87, RelayPool } from 'nostr-core'

const pool = new RelayPool()
const relays = ['wss://relay.damus.io']

// 1. Ask the user's social graph which Cashu mints they trust.
const recs = await pool.querySync(relays, nip87.getMintRecommendationFilter({
  authors: followList,
  kind: 38172,
}))

// 2. Rank by how many distinct people vouched for each one.
const counts = nip87.tallyRecommendations(recs)
const ranked = [...counts].sort((a, b) => b[1] - a[1])

// 3. Fetch the announcements for the top mints, following the relay hints.
const parsed = recs.map(nip87.parseMintRecommendation)
const addresses = parsed.flatMap(r => r.announcements ?? [])

const announcements = await pool.querySync(
  [...relays, ...addresses.map(a => a.relayHint).filter(Boolean)],
  nip87.getMintAnnouncementFilter({
    kinds: [38172],
    identifiers: ranked.slice(0, 10).map(([id]) => id),
  }),
)

for (const event of announcements) {
  const mint = nip87.parseCashuMintAnnouncement(event)
  console.log(mint.urls[0], `${counts.get(mint.identifier) ?? 0} recommendations`, mint.nuts)
}
```

## See Also

- [NIP-60](/api/nip60) - Cashu wallet storage
- [NIP-61](/api/nip61) - Nutzaps, which require a mutually trusted mint
