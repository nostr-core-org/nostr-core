<p align="center">
  <img src="/headers/blog-06-boring-infrastructure.svg" alt="Nostr Needs Boring Infrastructure" width="100%">
</p>

# Nostr Needs Boring Infrastructure

**The protocol is interesting. The libraries should be boring. That's a good thing.**

---

Nostr works because the protocol is simple. Events, signatures, relays. A few primitives that combine into something much larger than the sum of their parts.

The problem has never been the protocol. The problem is the layer between the protocol and the applications people want to build. That layer (the libraries, the tooling, the shared infrastructure) is where projects succeed or stall.

I've been thinking about what it means to build that layer well.

## Simple Protocols Need Simple Tools

There's a temptation, when building developer tools for a new protocol, to add value by adding complexity. Convenience wrappers that hide the protocol. Abstractions that "simplify" things by replacing one mental model with another. Integrations with specific services because that's what users want right now.

Each of these is a reasonable decision in isolation. Together, they produce a tool that's harder to understand than the protocol it wraps.

nostr-core takes a different approach. The API mirrors the protocol. NIP-01 is events and relays. NIP-19 is encoding. NIP-44 is encryption. NIP-47 is wallet connect. The library is organized by NIP number because the protocol is organized by NIP number.

That's boring. It's supposed to be.

When you read nostr-core code, you're reading the protocol with types. When something goes wrong, you can check the NIP spec directly because the library doesn't reinterpret it. When a NIP updates, the corresponding module updates. The mapping is one-to-one.

## The Cost of Vendor Coupling

I notice a pattern in developer ecosystems. A company builds a useful service. They release an SDK. The SDK is good (great, even) but it assumes their service. The types carry their branding. The auth flow requires their platform. The errors reference their dashboard.

Developers adopt it because it works. Then they're coupled to a service they chose for convenience, not for technical reasons. Switching costs accumulate quietly.

Nostr was designed to avoid this. The protocol is open. Relays are interchangeable. Wallets communicate through a standard protocol. But if the dominant library for that protocol is coupled to a specific wallet provider, the vendor-neutrality of the protocol doesn't matter in practice.

nostr-core is deliberately vendor-neutral. Not because vendor-specific tools are bad (they serve their users well) but because the ecosystem also needs a tool that serves the protocol itself.

## Forty-Eight NIPs Is an Investment

Implementing forty-eight NIPs in a single, coherent package is not exciting work. Each NIP has its own edge cases, its own type requirements, its own relationship to other NIPs. Getting the types right across all of them, making them compose naturally, ensuring the encryption modules work the same way everywhere. That's infrastructure work.

It's the kind of work that makes everything else easier. A developer building a social client doesn't need to think about NIP-10 thread parsing or NIP-44 encryption details. They import the module and use it. The protocol complexity is resolved once, in the library, not repeatedly in every application.

That's what infrastructure does. It absorbs complexity so applications don't have to.

## Trust Models Should Be Explicit

nostr-core's cryptography comes from Paul Miller's noble libraries. That's a specific choice with specific properties: audited code, minimal implementations, no unnecessary dependencies.

Seventy-nine total dependencies. One hundred thirty-two packages in the full tree. Those are numbers you can actually audit. You can read the dependency list in a few minutes and know what you're shipping.

Is it perfectly minimal? No. Could the dependency count be lower? Probably. But it's in a range where a team can make informed decisions about their supply chain. That matters when you're handling keys and payments.

## What I Think nostr-core Gets Right

It maps cleanly to the protocol. It doesn't add unnecessary abstractions. It works with any wallet, any relay, any signer. It ships the full NIP surface so developers don't need to assemble it from parts. It's typed end-to-end.

These aren't flashy properties. They're the properties of infrastructure that ages well.

## What It Gets Wrong, or Doesn't Solve Yet

The Nostr protocol is still evolving. Some NIPs in nostr-core will change as the community refines them. That's unavoidable and healthy, but it means the library is a moving target for anyone building production software.

There are also NIPs that nostr-core doesn't implement yet. The long tail of Nostr proposals is long, and protocol completeness is a moving goalpost.

And nostr-core is one library in one language. Nostr needs the same quality of tooling in Rust, Python, Swift, Kotlin, Go. The ecosystem is bigger than any single package.

## Infrastructure Ages Differently

Flashy tools get attention when they launch. Infrastructure gets attention when it breaks. Or more precisely, it earns trust by not breaking.

nostr-core isn't trying to be the most exciting project in the Nostr ecosystem. It's trying to be the most reliable foundation for the applications that are. A boring, complete, honest implementation of the protocol that developers can build on without thinking about it.

Nostr needs interesting applications. It needs boring infrastructure.

That's what this is.

---

**[GitHub](https://github.com/nostr-core-org/nostr-core)**
