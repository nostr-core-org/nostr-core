# RSS → Nostr Long-form Import (Python)

Planning outline. No implementation detail. Reusable as a v1 scope brief.

## Goal

Pull articles from RSS 2.0, Atom, and JSON Feed sources and emit NIP-23 long-form events for Nostr. Save unsent items as NIP-37 encrypted drafts. Signing happens through a NIP-46 remote bunker.

## Scope (v1)

- Fetch and parse RSS 2.0, Atom, JSON Feed.
- Normalize to one internal item shape.
- Convert HTML body to Markdown.
- Derive a deterministic NIP-23 `d`-tag per item.
- Wrap each item as a NIP-37 draft (kind 31234, encrypted to self).
- Sign via NIP-46 remote signer.
- Publish drafts to configured relays.
- Apply the curated filter policy below.
- Local cache for idempotent re-runs.

## Out of Scope (v2+)

- Blossom image rehosting. Leave a no-op hook (`rehost_images(markdown) -> markdown`) and a `TODO(blossom-v2)` block describing the BUD-01 / BUD-04 / BUD-11 contract.
- NIP-07 browser signer (not relevant for a Python pipeline).
- Readability fallback for truncated feeds (opt-in flag exists, implementation deferred).
- UI / CLI polish beyond a single command.

## Stack Decisions (locked)

| Concern | Choice |
|---|---|
| HTTP | `httpx` (async, ties in with NIP-46) |
| Feed parsing | `feedparser` for RSS / Atom, stdlib `json` for JSON Feed |
| HTML to Markdown | `markdownify` |
| Hashing | stdlib `hashlib` |
| Nostr lib | TBD: `pynostr` vs `nostr-sdk` (Python bindings). Must expose NIP-44 encrypt and NIP-46 client. |
| Local state | single JSON file, keyed by feed URL, stores seen `d`-tags + last run timestamp |

## Components Needed

1. **Fetcher** with proper User-Agent and conditional GET (`ETag`, `If-Modified-Since`).
2. **Format detector** (first non-whitespace char + XML root element check).
3. **Parser + normalizer** producing a single `FeedItem` shape.
4. **HTML to Markdown converter** with ATX headings.
5. **`d`-tag deriver**: `sha256(guid || link || title)[:16]`, optional prefix.
6. **Filter pipeline** (see Filter Policy section).
7. **NIP-37 wrapper**: NIP-44 encrypt the kind 30023 template into a kind 31234 envelope.
8. **NIP-46 client**: connect, fetch pubkey, request `sign_event` and `nip44_encrypt`.
9. **Relay publisher**.
10. **State store** for idempotency and resumable runs.
11. **Blossom hook** (no-op in v1, signature stable).

## Filter Policy (curated)

Three tiers. Hard gates always on. Smart defaults on but tunable. Opt-in off by default.

### Hard gates

- `require_title`
- `require_identifier` (guid OR link OR title must exist)
- `require_content` (non-empty after HTML to Markdown)
- `skip_seen_d_tags`
- `skip_future_dated`

### Smart defaults

- `limit`: 25 items per run
- `order`: newest first
- `max_age_days`: 365
- `min_content_chars`: 280
- `dedupe_by_title`: on
- `rate_limit_per_min`: 30
- `user_agent`: identifies the importer

### Time scoping

- `since` (unix seconds, overrides `max_age_days`)
- `until` (for chunked backfills)

### Opt-in taxonomy

- `categories_allow`
- `categories_block`
- `authors_allow`
- `language_allow`

### Opt-in content guards

- `domains_block`
- `title_regex_block`
- `require_full_content` (would trigger readability fetch, deferred to v2)

### Pipeline order (cheap rejects first)

1. Hard gates
2. Time window
3. Taxonomy filters
4. Title / domain blocks
5. Content length gate (after Markdown conversion)
6. Readability fetch (v2 hook)
7. `dedupe_by_title`
8. `d`-tag derivation
9. `skip_seen_d_tags`
10. Order, then `limit`
11. Hand to NIP-37 wrap + NIP-46 sign

### Shipped presets

- `DEFAULT_POLICY`: every value at its default.
- `ARCHIVE_BACKFILL`: `limit=500`, `max_age_days=10_000`, `rate_limit_per_min=10`.

## Open Decisions

- Final Nostr library pick (`pynostr` vs `nostr-sdk`). Driven by NIP-44 and NIP-46 support quality.
- Where the state file lives (XDG cache dir vs project dir vs user-passed path).
- Whether multi-author feeds preserve the original author in the body, or are restricted to single-author imports.
- Relay set: shipped defaults vs required user config.
- Bunker connection lifetime: per-run reconnect vs persistent session across runs.

## Footguns to Remember

- Feeds lie about dates (missing, future, wrong timezone). Fall back chain: `published` then `updated` then now.
- Encoding: some feeds claim UTF-8 but are not. Decode from `r.content` based on `Content-Type` and the XML declaration, not `r.text`.
- HTML entities must be decoded before Markdown conversion.
- Relative image and link URLs need resolving against the feed base URL.
- RSS 2.0: prefer `<content:encoded>` over `<description>`.
- WordPress Pages are not in `/feed/`. Posts only.
- Truncated feeds (Medium etc.) need readability or get skipped by `min_content_chars`.
- Idempotency relies on stable `guid`. Some CMSs regenerate it. `dedupe_by_title` is the safety net.
- Author shown on Nostr is the signing pubkey, not the feed's original author. Decide policy.
- Image rehost failures must never abort the post (v2 concern, design it in now).
- Draft promotion: a 30023 published version must reuse the same `d`-tag as the 31234 draft so replacement works cleanly.
- Bunker rate: NIP-46 signers can disconnect under flood. `rate_limit_per_min` exists for this.

## Build Order

1. Parser + normalizer + `d`-tag deriver. Pure functions, unit tested.
2. HTML to Markdown wired in. End-to-end produces a plain `dict` per item.
3. Filter pipeline applied to the dicts.
4. NIP-46 client connected, pubkey fetched.
5. NIP-37 wrap (NIP-44 encrypt template, sign envelope).
6. Relay publish.
7. State store for seen `d`-tags.
8. CLI entrypoint with feed URL, bunker URI, relay list, policy overrides.
9. **v2:** Blossom rehost, readability fallback, full-archive UX.
