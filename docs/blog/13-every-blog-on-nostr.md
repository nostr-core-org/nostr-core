<p align="center">
  <img src="/headers/blog-13-every-blog-on-nostr.svg" alt="Every Blog You've Written, Now on Nostr" width="100%">
</p>

# Every Blog You've Written, Now on Nostr

**Point it at a feed. Get signed long-form events back. Your archive, finally yours.**

---

## The Web Remembers, Until It Doesn't

There's a lot of writing scattered across the web. Substack newsletters, WordPress archives, Ghost blogs, Medium posts from before the paywall era. Most of it lives in someone else's database, behind someone else's domain, one policy change away from disappearing.

RSS never left. It got ignored while platforms built their walls. nostr-core puts it back to work: an import module that turns any feed into signed Nostr long-form events, with a single function call.

## One Function

```ts
import { rss } from 'nostr-core'

const events = await rss.importFeedAsDrafts('https://yourblog.com/feed/', {
  signer,
  limit: 25,
  draft: { identifierPrefix: 'rss-' },
})

await pool.publish(['wss://relay.example.com'], ...events)
```

That call runs the whole chain. Fetch the feed, detect the format, parse the items, convert each HTML body to Markdown, derive a stable identifier, wrap it as a NIP-23 long-form event, and sign it. You get back signed events. You decide when they go live.

## Drafts First, Then Public

By default each article lands as a kind 30024 draft, not a public post. Nothing surfaces until you choose to publish it. That matters when you're importing a multi-year archive and want to read it over before anything shows up on a relay.

Re-running the importer doesn't create duplicates. Every article gets a deterministic `d`-tag, a SHA-256 of its guid, link, and title. Import the same feed twice and you still get one clean copy of each post. When you're ready, publish the same article with `asDraft: false`. It becomes a kind 30023 post and replaces the draft on the relays automatically. Same identifier, no orphans.

## Three Formats, One Parser

Feeds disagree on almost everything. RSS 2.0, Atom, JSON Feed, each with its own shape and its own quirks. `parseFeed` reads the first character, picks the format, and hands back one normalized result. Dates fall through a chain until something valid sticks. Numeric HTML entities get decoded before conversion. Whatever the feed calls itself, you get title, author, published date, and Markdown content.

Most hosts already expose a feed: WordPress at `/feed/`, Substack at `/feed`, Ghost at `/rss/`, Blogger, Tumblr. Medium too, though it only ships excerpts.

## Images That Outlive the Source

Here's the part that matters for an archive. An imported post still points at images on the original host. If that WordPress install goes dark, the pictures break.

Turn on the Blossom option and the importer rehosts every inline image to a content-addressed media server, then rewrites the Markdown to match. In `mirror` mode the Blossom server pulls each image itself, so it works straight from the browser without CORS headaches.

```ts
const events = await rss.importFeedAsDrafts('https://yourblog.com/feed/', {
  signer,
  blossom: { servers: ['https://blossom.primal.net'], mode: 'mirror' },
})
```

Now the article and its images travel together. The source can disappear. The post survives.

## For Agents, a Pipeline Without Infrastructure

Point an agent at a feed and it gets signed Nostr events. No database to run, no scraper to babysit, no auth to manage. Each event carries clean metadata: title, author, published date, content in Markdown that's ready to embed or summarize.

An agent that curates a topic across dozens of blogs, one that backfills a writer's full history onto Nostr, one that mirrors a newsletter in real time. All of it is `importFeedAsDrafts` in a loop.

## The Right Idea, Finally Housed

RSS was always the right idea. Structured, open content that any tool could read. It just never had a publishing layer that matched its spirit. Nostr does. Signed events, cryptographic ownership, relay distribution with no central chokepoint.

Your old writing deserves a better home. Now it has one.

---

**[GitHub](https://github.com/nostr-core-org/nostr-core)** · **[RSS API](/api/rss)** · **[NIP-23 Long-form](/api/nip23)**
