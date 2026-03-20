---
layout: home

hero:
  name: nostr-core
  text: The complete Nostr toolkit
  tagline: 40+ NIPs, NWC wallet client, eCash, BOLT-11, Blossom media, and protocol primitives for JavaScript and TypeScript
  image:
    src: /nwc-logo.svg
    alt: nostr-core
  actions:
    - theme: brand
      text: Get Started
      link: /guide/introduction
    - theme: alt
      text: API Reference
      link: /api/nwc
---

<FeatureGrid>
  <FeatureCard
    icon="lucide:zap"
    title="Lightning Payments"
    details="Pay invoices, check balances, and create invoices with a single connection string. Full NIP-47 coverage."
    color="#F7931A"
  />
  <FeatureCard
    icon="lucide:arrow-left-right"
    title="Fiat Conversion"
    details="Built-in fiat-to-sats conversion using public exchange rate APIs. No extra dependencies needed."
    color="#897FFF"
  />
  <FeatureCard
    icon="lucide:at-sign"
    title="Lightning Address"
    details="Native LNURL-pay resolution. Send to Lightning Addresses without any external libraries."
    color="#F7931A"
  />
  <FeatureCard
    icon="lucide:layers"
    title="40+ NIPs Supported"
    details="Social, identity, privacy, eCash wallets (NIP-60), Blossom media (NIP-B7), BOLT-11 invoice decoding, and much more."
    color="#897FFF"
  />
  <FeatureCard
    icon="lucide:shield-check"
    title="Auto-Encryption"
    details="Automatically detects NIP-04 vs NIP-44 encryption support. Zero configuration required."
    color="#F7931A"
  />
  <FeatureCard
    icon="lucide:globe"
    title="Cross-Runtime"
    details="Works on Node.js 18+, Deno, Bun, and Cloudflare Workers. Pure JavaScript, no native bindings."
    color="#897FFF"
  />
</FeatureGrid>

<div class="stat-banner">
  <StatCard number="4" label="dependencies" description="Audited Noble crypto" />
  <StatCard number="82%" label="fewer packages" description="vs @getalby/sdk" />
  <StatCard number="40+" label="NIPs supported" description="Full protocol coverage" />
</div>

<div class="quick-example">

## Quick Example

```ts
import { NWC } from 'nostr-core'

const nwc = new NWC('nostr+walletconnect://...')
await nwc.connect()

const { balance } = await nwc.getBalance()
console.log(`Balance: ${balance} msats`)

nwc.close()
```

</div>

<div class="teaser-section">

## How does nostr-core compare?

40+ NIPs, full LNURL protocol, BOLT-11 decoding, eCash wallets, Blossom media, 82% fewer packages, zero vendor lock-in.

[See the full comparison →](/guide/comparison)

</div>

<div class="home-team-section">

## The Team

<div class="home-team-grid">
  <TeamCard
    name="Pratik Patel"
    role="Founder & Developer"
    avatar="https://avatars.githubusercontent.com/u/34883558?v=4"
    github="https://github.com/pratik227"
    twitter="https://x.com/PratikPatel_227"
  />
  <TeamCard
    name="DoktorShift"
    role="Co-Founder & Developer"
    avatar="https://avatars.githubusercontent.com/u/106493492?v=4"
    github="https://github.com/DoktorShift"
    twitter="https://twitter.com/drshift3"
  />
</div>

</div>

<style>
.home-team-section {
  max-width: 780px;
  margin: 0 auto;
  padding: 2rem 1.5rem 4rem;
  border-top: 1px solid var(--vp-c-divider);
}

.home-team-section h2 {
  text-align: center;
  font-size: 1.6rem;
  font-weight: 700;
  border: none !important;
  margin-top: 0 !important;
  margin-bottom: 1.75rem;
}

.home-team-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 1.5rem;
  justify-items: center;
}

.home-team-grid > * {
  width: 100%;
  max-width: 320px;
}
</style>
