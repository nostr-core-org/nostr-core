<p align="center">
  <img src="/headers/blog-14-your-photos-your-keys.svg" alt="Your Photos, Your Keys" width="100%">
</p>

# Your Photos, Your Keys

**Picture-first feeds come to Nostr. Kind 20, full metadata, no platform in the middle.**

---

## The Algorithm You Never Hired

Every Instagram user knows the feeling. You post something you're proud of, and somewhere a ranking model decides who sees it, when, and whether it sinks under sponsored posts. You never agreed to that. You just accepted it.

NIP-68 describes another way: picture-first posts that live on the protocol, not on a platform. As of today, nostr-core ships a full implementation.

## The Post Is the Event

A photo post is a single self-contained event, kind 20. It carries everything a visual feed needs: the image URL, its type, a SHA-256 hash so nobody can swap the file, pixel dimensions, a blurhash for smooth loading, and fallback mirrors in case the main host goes down. All of it rides inside one `imeta` tag. Add more images, get more tags, and one event becomes a multi-photo story.

```ts
import { nip68 } from 'nostr-core'

const post = nip68.createPictureEvent({
  title: 'Costa Rica',
  description: 'Sunset over the coast',
  images: [{
    url: 'https://nostr.build/i/photo.jpg',
    mimeType: 'image/jpeg',
    alt: 'Coastline at sunset',
    dim: '3024x4032',
    annotations: [{ pubkey: friendPk, x: 1200, y: 800 }],
  }],
  hashtags: ['travel', 'photography'],
  location: 'Costa Rica',
  geohash: 'd1q',
}, secretKey)
```

That produces a signed event, ready to publish. No backend, no account, no content policy to negotiate. It leaves your machine already cryptographically yours.

## Tag a Friend, No Middleman

Look at the `annotations` field. It pins a pubkey to pixel coordinates inside the image. Tag a friend at `x: 1200, y: 800` and any NIP-68 client can draw the dot on the photo and link it straight to their Nostr profile. No platform brokers that connection. The relationship lives in the event.

Place works the same way. A readable location plus a geohash gives any map-aware client spatial context for free. Build a photo map, a local discovery feed, a travel archive. The data is already in the post.

## Relays Can Filter Without Unpacking

Each `imeta` tag mirrors its image type and hash as top-level `m` and `x` tags. So a relay can answer "every kind 20 with an `image/jpeg` from the last week" without parsing the full tag tree. That keeps picture feeds fast at the relay layer, not just the client.

It also plays well with the rest of Nostr. The same `buildImetaTag` and `parseImetaTag` helpers read image metadata out of NIP-92 events, and the primitives carry straight over to video feeds (NIP-71, kind 22).

## For Builders and Agents

Reading a feed is just as clean. `parsePicturePost(event)` returns a tidy object: title, description, every image with its metadata, hashtags, tagged users, location. Feed it to a vision model, a caption generator, a moderation pass, a recommender. No scraping, no pagination tricks, no rate limits. The structure is already there. You just consume it.

Picture what that unlocks. A photo app where the user owns their keys and their posts move between clients without losing a single tag. A portfolio where every image is a signed event, verifiably yours. An assistant that captions and publishes on your behalf.

## A Real First-Class Home

The spec calls them picture-first feeds. What it means is that visual content on Nostr finally has a real home, with all the metadata good tooling needs to build on top of it.

The implementation is in main today. Go build something worth photographing.

---

**[GitHub](https://github.com/nostr-core-org/nostr-core)** · **[NIP-68 API](/api/nip68)**
