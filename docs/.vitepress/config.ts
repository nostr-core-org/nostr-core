import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'nostr-core',
  description: 'Dead simple, vendor neutral NWC client',

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/nwc-logo.svg' }],
  ],

  themeConfig: {
    logo: '/nwc-logo.svg',

    search: {
      provider: 'local',
    },

    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/guide/introduction' },
      { text: 'API Reference', link: '/api/nwc' },
      { text: 'Agent Docs', link: '/agent' },
      { text: 'Team', link: '/team' },
    ],

    sidebar: [
      {
        text: 'Guide',
        items: [
          {
            text: 'Getting Started',
            collapsed: true,
            items: [
              { text: 'Introduction', link: '/guide/introduction' },
              { text: 'Installation', link: '/guide/installation' },
              { text: 'Quick Start', link: '/guide/quick-start' },
            ],
          },
          {
            text: 'Core Concepts',
            collapsed: true,
            items: [
              { text: 'Wallet Operations', link: '/guide/wallet-operations' },
              { text: 'Encryption', link: '/guide/encryption' },
              { text: 'Relays', link: '/guide/relays' },
              { text: 'Error Handling', link: '/guide/error-handling' },
            ],
          },
          {
            text: 'Resources',
            collapsed: true,
            items: [
              { text: 'Comparison', link: '/guide/comparison' },
            ],
          },
        ],
      },
      {
        text: 'API Reference',
        items: [
          {
            text: 'Client',
            collapsed: true,
            items: [
              { text: 'NWC', link: '/api/nwc' },
              { text: 'NostrConnect', link: '/api/nip46' },
            ],
          },
          {
            text: 'Primitives',
            collapsed: true,
            items: [
              { text: 'Relay', link: '/api/relay' },
              { text: 'RelayPool', link: '/api/pool' },
              { text: 'Signer', link: '/api/signer' },
              { text: 'Filter', link: '/api/filter' },
              { text: 'Event', link: '/api/event' },
              { text: 'Crypto', link: '/api/crypto' },
            ],
          },
          {
            text: 'NIPs',
            collapsed: true,
            items: [
              { text: 'NIP-02', link: '/api/nip02' },
              { text: 'NIP-04', link: '/api/nip04' },
              { text: 'NIP-05', link: '/api/nip05' },
              { text: 'NIP-06', link: '/api/nip06' },
              { text: 'NIP-07', link: '/api/nip07' },
              { text: 'NIP-09', link: '/api/nip09' },
              { text: 'NIP-10', link: '/api/nip10' },
              { text: 'NIP-11', link: '/api/nip11' },
              { text: 'NIP-13', link: '/api/nip13' },
              { text: 'NIP-17', link: '/api/nip17' },
              { text: 'NIP-18', link: '/api/nip18' },
              { text: 'NIP-19', link: '/api/nip19' },
              { text: 'NIP-21', link: '/api/nip21' },
              { text: 'NIP-22', link: '/api/nip22' },
              { text: 'NIP-23', link: '/api/nip23' },
              { text: 'NIP-24', link: '/api/nip24' },
              { text: 'NIP-25', link: '/api/nip25' },
              { text: 'NIP-27', link: '/api/nip27' },
              { text: 'NIP-28', link: '/api/nip28' },
              { text: 'NIP-29', link: '/api/nip29' },
              { text: 'NIP-30', link: '/api/nip30' },
              { text: 'NIP-31', link: '/api/nip31' },
              { text: 'NIP-36', link: '/api/nip36' },
              { text: 'NIP-40', link: '/api/nip40' },
              { text: 'NIP-42', link: '/api/nip42' },
              { text: 'NIP-44', link: '/api/nip44' },
              { text: 'NIP-46', link: '/api/nip46' },
              { text: 'NIP-48', link: '/api/nip48' },
              { text: 'NIP-50', link: '/api/nip50' },
              { text: 'NIP-51', link: '/api/nip51' },
              { text: 'NIP-56', link: '/api/nip56' },
              { text: 'NIP-57', link: '/api/nip57' },
              { text: 'NIP-58', link: '/api/nip58' },
              { text: 'NIP-59', link: '/api/nip59' },
              { text: 'NIP-65', link: '/api/nip65' },
              { text: 'NIP-98', link: '/api/nip98' },
            ],
          },
          {
            text: 'Protocols',
            collapsed: true,
            items: [
              { text: 'LNURL Protocol', link: '/api/lnurl' },
            ],
          },
          {
            text: 'Utilities',
            collapsed: true,
            items: [
              { text: 'Types', link: '/api/types' },
              { text: 'Errors', link: '/api/errors' },
              { text: 'Utils', link: '/api/utils' },
            ],
          },
        ],
      },
    ],

    socialLinks: [

      { icon: 'github', link: 'https://github.com/nostr-core-org/nostr-core' },
      { icon: 'x', link: 'https://x.com/PratikPatel_227' },
    ],

    footer: {
      message: 'Released under the MIT License.',
    },
  },
})
