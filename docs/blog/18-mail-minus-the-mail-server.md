---
date: 2026-08-17T21:00:00+02:00
---

<p align="center">
  <img src="/headers/blog-18-nostr-mail.svg" alt="Mail, Minus the Mail Server" width="100%">
</p>

# Mail, Minus the Mail Server

**To, Cc, and a Bcc that stays blind by construction. Email-shaped messaging over gift wrap.**

---

## The Last Protocol Standing

Email outlived every platform that was supposed to kill it, and it did that on structure alone. A subject line. To for the people who must act, Cc for the people who should know, Bcc for the people nobody else gets to see. Threads that hold together across years. That structure is why contracts, invoices, and board decisions still travel over a protocol from the seventies.

The infrastructure is another story. Anyone who has tried to self-host email knows the ritual: reverse DNS, SPF, DKIM, DMARC, then weeks of pleading with reputation systems anyway. Deliverability is a priesthood, so everyone rents an inbox instead, and the most consequential correspondence in a business sits in a provider's database under a provider's terms.

The experimental mail module in nostr-core keeps email's structure and swaps out its infrastructure: relays instead of mail servers, gift wrap instead of TLS-and-hope.

## Why DMs Don't Cut It

The obvious question: Nostr already has private messages, why not use those? Because NIP-17 models a conversation between equals, and email's whole value is that recipients are not equal. To, Cc, and Bcc are different roles, and Bcc must be invisible to everyone else on the message. There is no way to say that in a DM. That asymmetry is the reason this is a separate module rather than a NIP-17 extension.

## One Message, Many Envelopes

A mail message is a rumor inside a NIP-59 gift wrap: the relay sees an anonymous kind 1059 envelope and nothing else. Not the subject, not the sender, not who is on the thread. `createMailMessage` produces one sealed copy per recipient, plus one for your own sent folder:

```ts
import { mail } from 'nostr-core'

const copies = mail.createMailMessage({
  subject: 'Q3 planning',
  body: 'Agenda attached.',
  to: [bobPubkey],
  cc: [carolPubkey],
  bcc: [davePubkey],
}, aliceSecretKey)

// 4 copies: bob (to), carol (cc), dave (bcc), alice (sender)

for (const copy of copies) {
  await pool.publish(inboxRelaysFor(copy.recipient), copy.wrap)
}
```

Each copy goes to that recipient's kind 10050 DM relay list, the same delivery mechanism NIP-17 uses. Replies come with the etiquette built in: `createReply` flips the recipients, prefixes `Re:` exactly once, and carries the thread id forward. `replyAll` keeps the To and Cc lists. Bcc is never carried into a reply, because the reply-all disaster is a solved problem when the software refuses to create it.

## A Bcc That Cannot Leak

Classic email keeps Bcc secret by politely stripping a header, and every mail admin has a story about the time that went wrong. Here the secrecy is structural. Blind recipients are never tagged in anyone's copy. Each one receives their own rumor, with its own id, whose recipient list names only themselves. The To and Cc copies contain no trace that a blind copy exists, and only the sender's own copy records the full list.

There is nothing to strip and nothing to leak. A recipient cannot reconstruct the blind list, and neither can a relay, because the information was never in their copy to begin with. Privacy by construction, not by convention.

## Attachments the Host Never Reads

Attachments are encrypted with a fresh AES-256-GCM key, uploaded to a Blossom server, and referenced by hash. The decryption key travels only inside the gift wrap:

```ts
const attachment = await mail.uploadMailAttachment(
  { data: pdfBytes, name: 'agenda.pdf', mime: 'application/pdf' },
  'https://blossom.example',
  aliceSecretKey,
)
```

The file host stores ciphertext it cannot open, addressed by content, replicable to any other Blossom server. Your attachments get the same deal your messages do: the infrastructure carries them without being trusted with them.

## A Proposal, Not a Standard

Honesty section. There is no ratified NIP for mail on Nostr. The inner rumor kind, 1314, is provisional and overridable per call, chosen to dodge kind 1301, which is already taken by workout records and, awkwardly, also used by another mail experiment. The transport is entirely standard gift wrap, so nothing about your messages is stranded if the schema moves. But real interoperability needs a NIP and agreement between implementations, and we'd rather say that plainly than ship a private format wearing a standard's clothes.

Email's structure earned fifty years of trust. Its infrastructure is what everyone pays to avoid. Keep the first, drop the second, and your correspondence belongs to the keys that signed it.

---

**[GitHub](https://github.com/nostr-core-org/nostr-core)** · **[Mail API](/api/mail)** · **[NIP-59 Gift Wrap](/api/nip59)**
