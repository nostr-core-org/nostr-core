# Blossom Media (NIP-B7)

Blossom media support for uploading, downloading, and managing blobs on content-addressable Blossom servers. Implements BUD-01 (retrieval), BUD-02 (upload/delete/list), BUD-03 (server lists, kind 10063), BUD-04 (mirroring), and BUD-11 (authorization, kind 24242).

## Import

```ts
import { blossom } from 'nostr-core'
// or import individual functions
import {
  createServerListEvent,
  parseServerList,
  createBlossomAuthEvent,
  getBlossomAuthHeader,
  uploadBlob,
  getBlob,
  checkBlob,
  deleteBlob,
  listBlobs,
  mirrorBlob,
  getBlobHash,
  BlossomError,
} from 'nostr-core'
```

## Event Kinds

| Constant | Value | Description |
|----------|-------|-------------|
| `SERVER_LIST_KIND` | `10063` | User server list (replaceable, BUD-03) |
| `AUTH_KIND` | `24242` | Authorization token (BUD-11) |

## BlobDescriptor Type

```ts
type BlobDescriptor = {
  url: string
  sha256: string
  size: number
  type?: string
  uploaded?: number
}
```

| Field | Type | Description |
|-------|------|-------------|
| `url` | `string` | Public URL of the blob (with file extension) |
| `sha256` | `string` | SHA-256 hash of the blob content (hex) |
| `size` | `number` | Size in bytes |
| `type` | `string` (optional) | MIME type (default: `application/octet-stream`) |
| `uploaded` | `number` (optional) | Unix timestamp of upload |

## BlossomError Class

```ts
class BlossomError extends Error {
  code: string
  status?: number
}
```

| Code | Description |
|------|-------------|
| `UPLOAD_ERROR` | Upload rejected by server |
| `NOT_FOUND` | Blob not found on server |
| `DELETE_ERROR` | Delete rejected by server |
| `LIST_ERROR` | List request failed |
| `MIRROR_ERROR` | Mirror request failed |

## blossom.createServerListEvent

```ts
function createServerListEvent(servers: string[], secretKey: Uint8Array): NostrEvent
function createServerListEventTemplate(servers: string[]): EventTemplate
```

Creates a kind 10063 replaceable event declaring the user's preferred Blossom servers (BUD-03).

```ts
const event = blossom.createServerListEvent(
  ['https://blossom.self.hosted', 'https://cdn.blossom.cloud'],
  secretKey,
)
```

## blossom.parseServerList

```ts
function parseServerList(event: NostrEvent): string[]
```

Parses a kind 10063 event to extract server URLs.

```ts
const servers = blossom.parseServerList(event)
// ['https://blossom.self.hosted', 'https://cdn.blossom.cloud']
```

## blossom.createAuthEvent

```ts
function createAuthEvent(opts: {
  action: BlossomAuthAction     // 'get' | 'upload' | 'list' | 'delete' | 'media'
  content: string               // Human-readable description
  expiration: number            // Unix timestamp
  hashes?: string[]             // SHA-256 hashes (x tags)
  size?: number                 // Blob size in bytes
  servers?: string[]            // Restrict to specific servers
}, secretKey: Uint8Array): NostrEvent
```

Creates a signed kind 24242 authorization event (BUD-11).

```ts
const authEvent = blossom.createAuthEvent({
  action: 'upload',
  content: 'Upload Blob',
  expiration: Math.floor(Date.now() / 1000) + 300,  // 5 minutes
  hashes: [blossom.getBlobHash(data)],
  size: data.length,
}, secretKey)
```

## blossom.getAuthorizationHeader

```ts
function getAuthorizationHeader(event: NostrEvent): string
```

Encodes a signed auth event as an HTTP Authorization header value.

**Returns:** `"Nostr <base64url-no-pad-encoded-event>"`

## blossom.uploadBlob

```ts
function uploadBlob(
  serverUrl: string,
  data: Uint8Array,
  authEvent: NostrEvent,
  contentType?: string,
): Promise<BlobDescriptor>
```

Upload a blob to a Blossom server (BUD-02). Requires a signed auth event with action `"upload"`.

```ts
const data = new Uint8Array([...])
const hash = blossom.getBlobHash(data)

const auth = blossom.createAuthEvent({
  action: 'upload',
  content: 'Upload Image',
  expiration: Math.floor(Date.now() / 1000) + 300,
  hashes: [hash],
  size: data.length,
}, secretKey)

const descriptor = await blossom.uploadBlob(
  'https://blossom.self.hosted',
  data,
  auth,
  'image/png',
)
console.log(descriptor.url)    // 'https://blossom.self.hosted/abc123...def.png'
console.log(descriptor.sha256) // 'abc123...def'
```

## blossom.getBlob

```ts
function getBlob(serverUrl: string, sha256Hash: string, ext?: string): Promise<ArrayBuffer>
```

Retrieve a blob from a Blossom server (BUD-01).

```ts
const data = await blossom.getBlob('https://blossom.self.hosted', sha256Hash)
```

## blossom.checkBlob

```ts
function checkBlob(serverUrl: string, sha256Hash: string): Promise<boolean>
```

Check if a blob exists on a Blossom server (HEAD request).

## blossom.deleteBlob

```ts
function deleteBlob(serverUrl: string, sha256Hash: string, authEvent: NostrEvent): Promise<void>
```

Delete a blob from a Blossom server (BUD-02). Requires auth event with action `"delete"`.

## blossom.listBlobs

```ts
function listBlobs(
  serverUrl: string,
  pubkey: string,
  opts?: { cursor?: string; limit?: number },
): Promise<BlobDescriptor[]>
```

List blobs uploaded by a pubkey (BUD-02). Returns descriptors sorted by upload date descending.

```ts
const blobs = await blossom.listBlobs('https://cdn.blossom.cloud', pubkey, { limit: 20 })
for (const blob of blobs) {
  console.log(blob.url, blob.size, blob.type)
}
```

## blossom.mirrorBlob

```ts
function mirrorBlob(
  serverUrl: string,
  sourceUrl: string,
  authEvent: NostrEvent,
): Promise<BlobDescriptor>
```

Mirror a blob from a remote URL to a Blossom server (BUD-04). Requires auth event with action `"upload"`.

```ts
const mirrored = await blossom.mirrorBlob(
  'https://cdn.blossom.cloud',
  'https://other-server.com/abc123.png',
  authEvent,
)
```

## blossom.getBlobHash

```ts
function getBlobHash(data: Uint8Array): string
```

Compute the SHA-256 hash of blob data (hex). This is the content-addressable identifier used by Blossom servers.

## Full Example

```ts
import { blossom, generateSecretKey, getPublicKey, Relay } from 'nostr-core'

const sk = generateSecretKey()
const pk = getPublicKey(sk)

// Step 1: Declare your Blossom servers
const serverList = blossom.createServerListEvent(
  ['https://blossom.self.hosted', 'https://cdn.blossom.cloud'],
  sk,
)
// Publish serverList to your relays

// Step 2: Upload an image
const imageData = new Uint8Array([...]) // Your image bytes
const hash = blossom.getBlobHash(imageData)

const uploadAuth = blossom.createAuthEvent({
  action: 'upload',
  content: 'Upload Image',
  expiration: Math.floor(Date.now() / 1000) + 300,
  hashes: [hash],
  size: imageData.length,
}, sk)

const descriptor = await blossom.uploadBlob(
  'https://blossom.self.hosted',
  imageData,
  uploadAuth,
  'image/png',
)
console.log('Uploaded:', descriptor.url)

// Step 3: Check if blob exists on another server
const exists = await blossom.checkBlob('https://cdn.blossom.cloud', hash)
if (!exists) {
  // Mirror to backup server
  const mirrorAuth = blossom.createAuthEvent({
    action: 'upload',
    content: 'Mirror Blob',
    expiration: Math.floor(Date.now() / 1000) + 300,
    hashes: [hash],
  }, sk)
  await blossom.mirrorBlob('https://cdn.blossom.cloud', descriptor.url, mirrorAuth)
}

// Step 4: List all your uploads
const myBlobs = await blossom.listBlobs('https://blossom.self.hosted', pk)
console.log(`You have ${myBlobs.length} blobs`)
```

## How It Works

- **Kind 10063** (BUD-03) declares a user's preferred Blossom servers. Clients should fetch this to discover where a user's media is stored.
- **Kind 24242** (BUD-11) is a signed authorization token. It scopes access by action type, blob hash, and expiration.
- Blobs are **content-addressed** by their SHA-256 hash. The same file always has the same hash.
- When a media URL is unavailable, clients should look up the user's kind 10063 server list and try to retrieve the blob from those servers using its SHA-256 hash.
- Clients SHOULD verify that downloaded blob content matches the expected SHA-256 hash.
- The `getAuthorizationHeader()` function encodes the auth event as base64url (no padding) for the HTTP Authorization header.
