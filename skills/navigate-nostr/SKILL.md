---
name: navigate-nostr
description: Navigate the Nostr protocol ecosystem and find the right specifications, repositories, and resources. Use to look up NIPs, discover event kinds, find LNURL and Lightning specs, locate Blossom media docs, understand eCash/Cashu on Nostr, and identify which nostr-core modules implement a given feature.
license: CC-BY-SA-4.0
---

# Navigate Nostr

A guide for finding the right specification, repository, or resource when building on Nostr. Covers the core protocol, Lightning/LNURL, eCash, media storage, and how each maps to nostr-core.

## Nostr Protocol (NIPs)

All Nostr protocol documentation is maintained in the NIPs (Nostr Implementation Possibilities) repository. To access this information:

### Reading Individual NIPs

Individual NIPs can be fetched from:
```
https://github.com/nostr-protocol/nips/blob/master/{NIP}.md
```

For example, NIP-01 (the basic protocol specification) is available at:
```
https://github.com/nostr-protocol/nips/blob/master/01.md
```

### Finding Event Kinds

Documentation for Nostr event kinds is spread across one or more NIPs. **There is no direct relationship between the NIP number and the kind number.**

To find which NIPs document a specific event kind:

1. First, fetch the README:
   ```
   https://github.com/nostr-protocol/nips/blob/master/README.md
   ```
2. Reference the **Event Kinds** table in the README to find which NIP(s) document the kind you need.

### Discovering Existing Capabilities

The README should be consulted to:
- **View the list of NIPs** -- discover what capabilities already exist on the Nostr network
- **Review client and relay messages** -- understand the communication protocol
- **Check the list of tags** -- see what standardized tags are available
- **Decide on using existing NIPs** -- before implementing a feature, check if an existing NIP already covers it

Always start by fetching and reviewing the README to understand the current state of the protocol and avoid reinventing existing functionality.

---

## Lightning & Payments

### LNURL Protocol

LNURL extends Lightning with human-readable payment flows. The specs live in a dedicated repository:
```
https://github.com/lnurl/luds
```

Individual LUDs can be fetched from:
```
https://github.com/lnurl/luds/blob/luds/{LUD}.md
```

Key documents to know about:
- **LUD-01** -- Base LNURL encoding
- **LUD-03** -- LNURL-withdraw
- **LUD-06** -- LNURL-pay (pay requests)
- **LUD-09/10** -- successAction (plain and AES)
- **LUD-12** -- Comments in pay requests
- **LUD-16** -- Lightning Address (pay to user@domain)
- **LUD-18** -- Payer data

Consult the LUDs README for the full list of documents and their status.

### BOLT-11 Invoices

The invoice format used across Lightning:
```
https://github.com/lightning/bolts/blob/master/11-payment-encoding.md
```

### Nostr Wallet Connect (NWC / NIP-47)

NWC connects apps to Lightning wallets over Nostr relays. Fetch NIP-47 for the full specification:
```
https://github.com/nostr-protocol/nips/blob/master/47.md
```

---

## eCash / Cashu on Nostr

Cashu wallet and token storage on Nostr is defined in NIP-60:
```
https://github.com/nostr-protocol/nips/blob/master/60.md
```

The Cashu protocol itself is documented through NUTs (Notation, Usage, and Terminology):
```
https://github.com/cashubtc/nuts
```

Individual NUTs can be fetched from:
```
https://github.com/cashubtc/nuts/blob/main/{NUT}.md
```

Consult the NUTs README for the full list. Key NUTs: 00 (token format), 03 (swap), 04 (mint), 05 (melt).

---

## Media Storage (Blossom)

Blossom is a protocol for storing and retrieving blobs (images, video, files) on servers identified by content hash. The specs are called BUDs:
```
https://github.com/hzrd149/blossom/tree/master/buds
```

Individual BUDs can be fetched from:
```
https://github.com/hzrd149/blossom/blob/master/buds/{BUD}.md
```

Key BUDs: 01 (server spec), 02 (blob retrieval), 03 (Nostr server list, kind 10063), 04 (mirroring).

---

## Encryption

Two encryption schemes exist in Nostr. Fetch the respective NIP for details:

- **NIP-04** -- Legacy AES-256-CBC (deprecated, backward compatibility only)
- **NIP-44** -- Modern versioned encryption (ChaCha20, preferred for all new code)

---

## nostr-core Module Map

nostr-core implements all of the above. When you need to use a feature, consult this table to find the right module, then check the linked spec for edge cases:

| Feature | nostr-core module | Spec |
|---|---|---|
| NWC client | `NWC` (main class) | NIP-47 |
| LNURL pay/withdraw | `lnurl` | LUD-01/03/06/16 |
| Lightning Address | `lightning-address` | LUD-16 |
| BOLT-11 decoding | `bolt11` | BOLT-11 |
| Fiat conversion | `fiat` | -- |
| Key generation | `crypto` | -- |
| Event signing | `event` | NIP-01 |
| Event filtering | `filter` | NIP-01 |
| Relay connection | `relay`, `pool` | NIP-01 |
| Signer interface | `signer` | -- |
| AES encryption | `nip04` | NIP-04 |
| ChaCha20 encryption | `nip44` | NIP-44 |
| Contacts | `nip02` | NIP-02 |
| DNS identity | `nip05` | NIP-05 |
| Mnemonic keys | `nip06` | NIP-06 |
| Browser signer | `nip07` | NIP-07 |
| Deletion | `nip09` | NIP-09 |
| Threads | `nip10` | NIP-10 |
| Relay info | `nip11` | NIP-11 |
| Proof of work | `nip13` | NIP-13 |
| Private DMs | `nip17` | NIP-17 |
| Reposts | `nip18` | NIP-18 |
| Bech32 encoding | `nip19` | NIP-19 |
| nostr: URIs | `nip21` | NIP-21 |
| Comments | `nip22` | NIP-22 |
| Long-form content | `nip23` | NIP-23 |
| Extended metadata | `nip24` | NIP-24 |
| Reactions | `nip25` | NIP-25 |
| Text references | `nip27` | NIP-27 |
| Public chat | `nip28` | NIP-28 |
| Groups | `nip29` | NIP-29 |
| Custom emoji | `nip30` | NIP-30 |
| Alt tag | `nip31` | NIP-31 |
| Content warnings | `nip36` | NIP-36 |
| Expiration | `nip40` | NIP-40 |
| Relay auth | `nip42` | NIP-42 |
| Remote signer | `nip46` | NIP-46 |
| Proxy tags | `nip48` | NIP-48 |
| Search | `nip50` | NIP-50 |
| Lists | `nip51` | NIP-51 |
| Calendar | `nip52` | NIP-52 |
| Reporting | `nip56` | NIP-56 |
| Zaps | `nip57` | NIP-57 |
| Badges | `nip58` | NIP-58 |
| Gift wrap | `nip59` | NIP-59 |
| eCash / Cashu | `nip60` | NIP-60 |
| Relay list | `nip65` | NIP-65 |
| Zap goals | `nip75` | NIP-75 |
| HTTP auth | `nip98` | NIP-98 |
| Blossom media | `blossom` | BUD-01/02/03/04 |
| Utilities | `utils` | -- |

### nostr-core Repository

```
https://github.com/nostr-core-org/nostr-core
```

Full API documentation:
```
https://nostr-core-org.github.io/nostr-core/
```

### Best Practices

1. **Start with the spec README** before implementing any feature -- check what already exists.
2. **Check the module map** above to find if nostr-core already has a ready-made implementation.
3. **Prefer NIP-44 over NIP-04** for encryption in new code.
4. **Consult the spec** for edge cases -- the module implements the spec, so the spec is the authority.
5. **Use NWC (NIP-47)** for Lightning wallet operations rather than direct node access.
