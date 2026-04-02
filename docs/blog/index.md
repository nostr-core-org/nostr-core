---
layout: page
title: Blogs
---

<div class="blog-hero">
  <h1>Blogs</h1>
  <p>Thoughts on building with Nostr, from the team behind nostr-core.</p>
</div>

<div class="blog-grid">

<BlogCard
  title="What nostr-core Actually Is"
  description="One package. 48 NIPs. The protocol, ready to use."
  image="/headers/blog-01-what-nostr-core-actually-is.png"
  link="/blog/01-what-nostr-core-actually-is"
/>

<BlogCard
  title="One Class, One Connection String"
  description="The entire NWC spec in five lines of code. That's not a simplification; it's the actual API."
  image="/headers/blog-02-one-class-one-connection-string.png"
  link="/blog/02-one-class-one-connection-string"
/>

<BlogCard
  title="Build a Nostr Client From Scratch"
  description="Keys, events, relays, encryption, threads, reactions. All typed, all ready."
  image="/headers/blog-03-build-a-nostr-client.png"
  link="/blog/03-build-a-nostr-client-from-scratch"
/>

<BlogCard
  title="The Library That Doesn't Lock You In"
  description="No OAuth. No API keys. No vendor. Just the protocol."
  image="/headers/blog-04-no-lock-in.png"
  link="/blog/04-the-library-that-doesnt-lock-you-in"
/>

<BlogCard
  title="Forty-Eight NIPs, One Import"
  description="Most Nostr libraries give you the basics. nostr-core gives you the protocol."
  image="/headers/blog-05-forty-eight-nips.png"
  link="/blog/05-forty-eight-nips-one-import"
/>

<BlogCard
  title="Nostr Needs Boring Infrastructure"
  description="The protocol is interesting. The libraries should be boring. That's a good thing."
  image="/headers/blog-06-boring-infrastructure.png"
  link="/blog/06-nostr-needs-boring-infrastructure"
/>

<BlogCard
  title="Lightning Without the Lightning Code"
  description="A connection string and five methods cover most use cases."
  image="/headers/blog-07-lightning-payments.png"
  link="/blog/07-lightning-without-the-lightning-code"
/>

<BlogCard
  title="Ecash on Nostr"
  description="Your wallet state lives on relays. Your proofs travel with your keys. No sync service."
  image="/headers/blog-08-ecash-on-nostr.png"
  link="/blog/08-ecash-on-nostr"
/>

<BlogCard
  title="Two Wallets, One Protocol"
  description="NIP-47 connects you to a remote wallet. NIP-60 carries one with you. Together they cover every payment scenario."
  image="/headers/blog-09-two-wallets.png"
  link="/blog/09-two-wallets-one-protocol"
/>

<BlogCard
  title="Media Without Middlemen"
  description="Content-addressed blobs on Blossom servers, authenticated with your Nostr key."
  image="/headers/blog-10-media-without-middlemen.png"
  link="/blog/10-media-without-middlemen"
/>

<BlogCard
  title="Navigate Nostr"
  description="Agents don't need more protocol knowledge. They need to know where to look. One skill to find every NIP, LUD, NUT, and BUD."
  image="/headers/blog-11-navigate-nostr.svg"
  link="/blog/11-navigate-nostr"
/>

<BlogCard
  title="Teaching Agents to Build"
  description="AI agents are only as good as the instructions they get. We wrote ten. From identity to payments to social -- all guided."
  image="/headers/blog-12-teaching-agents.svg"
  link="/blog/12-teaching-agents-to-build"
/>

</div>

<style>
.blog-hero {
  text-align: center;
  padding: 3rem 1.5rem 2rem;
}

.blog-hero h1 {
  font-size: 2.5rem;
  font-weight: 700;
  background: linear-gradient(180deg, #FFCA4A -5.76%, #F7931A 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 1.2;
  padding-top: 0.1em;
  margin: 0 0 0.75rem;
}

.blog-hero p {
  font-size: 1.1rem;
  color: var(--vp-c-text-2);
  margin: 0;
}

.blog-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1.5rem;
  max-width: 1152px;
  margin: 0 auto;
  padding: 0 1.5rem 3rem;
}
</style>
