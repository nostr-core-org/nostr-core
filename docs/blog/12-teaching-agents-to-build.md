<p align="center">
  <img src="/headers/blog-12-teaching-agents.svg" alt="Teaching Agents to Build" width="100%">
</p>

# Teaching Agents to Build

**AI agents are only as good as the instructions they get. We wrote ten.**

---

## Agents Have a Cold Start Problem

You've probably tried it. You open an AI assistant, tell it to "build me a Nostr app with Lightning payments," and watch it confidently produce code that's half-right, half-hallucinated. The function names look plausible but don't exist. The imports reference packages that were deprecated two years ago. The relay URL is made up.

This isn't a model problem. It's a context problem. The agent doesn't know where to look, what tools are available, or how the pieces fit together. It's guessing -- and guessing doesn't work when you're dealing with cryptographic keys and real money.

We decided to fix that at the source.

## What Skills Are (And Why They Matter)

A skill is a small document that teaches an AI agent how to do one thing well. Not a tutorial. Not a reference manual. A focused set of instructions that gives the agent the right context, the right code patterns, and the right guardrails for a specific task.

Think of it like briefing a new colleague. You wouldn't hand them the entire company wiki. You'd say: "Here's the project. Here's how we do things. Here are the common mistakes. Go."

That's what each skill does for an AI agent working with nostr-core.

## Ten Skills, Four Layers

We organized the skills into layers that mirror how you'd actually build something:

**Start here.** Before writing any code, you need to know where things are. The Nostr ecosystem spans five specification repositories with four different naming conventions. NIPs for the protocol. LUDs for LNURL. NUTs for Cashu. BUDs for Blossom media. The `/navigate-nostr` skill teaches agents (and humans) how to find the right spec, the right repo, and the right nostr-core module for any feature.

**Set up your identity.** Every Nostr application starts with a keypair. The `/nostr-identity` skill covers key generation, mnemonic backup, NIP-05 verification, and the three signer options (direct key, browser extension, remote bunker). It handles the part that most tutorials skip: how to manage keys safely.

**Connect a wallet.** The `/lnbits-mcp` skill walks through connecting to LNbits, a free and open-source Lightning wallet. It covers getting an NWC connection string, wiring it up to nostr-core, and optionally setting up the LNbits MCP Server so agents can manage wallets through plain conversation.

**Build things.** This is where the bulk of the skills live:

- `/nostr-messaging` -- private DMs, public notes, chat channels, groups, real-time subscriptions
- `/nostr-social` -- threads, reactions, reposts, articles, follow lists, badges, calendar events, zaps
- `/lightning-pay` -- every payment pattern: invoices, Lightning Addresses, fiat conversion, keysend
- `/wallet-monitor` -- transaction history, live notifications, analytics
- `/lightning-agent` -- a complete, copy-paste agent class that ties wallet, messaging, and identity together

And for developers who need to go deeper, `/nwc-integrate` handles generic wallet setup and `/nostr-primitives` exposes the raw protocol surface across 48 NIPs.

## What This Changes

Without skills, an agent working with Nostr has to figure out everything from scratch. Which NIP covers zaps? What's the import path for gift-wrapped DMs? How do you check if a wallet supports a specific method before calling it? Every question is an opportunity for the agent to guess wrong.

With skills loaded, the same agent has the answers in context. It knows the function signatures, the error types, the security rules. It knows to check `getInfo().methods` before calling `payInvoice`. It knows to use NIP-17 for DMs instead of the deprecated NIP-04. It knows to call `nwc.close()` in error paths.

The difference isn't subtle. It's the difference between generated code that looks right and generated code that works.

## Designed for Humans Too

Here's the thing about good AI instructions: they're also good human instructions.

Every skill is a markdown file you can open and read. The code examples are real, complete, and runnable. The patterns are the same ones you'd use in production. If you're a developer who's never worked with Nostr before, reading through `/nostr-identity` and `/nostr-messaging` will teach you the fundamentals faster than most tutorials.

Skills are not hidden configuration files. They're documentation with a specific audience in mind. The AI agent is one audience. You're the other.

## No Vendor, No Lock-In

A deliberate choice: every skill points to open protocols and open-source tools.

The wallet examples use LNbits (free, self-hosted) and standard NWC connection strings that work with any compatible wallet. The relay examples use public relays. The signing examples cover all three options (direct key, browser extension, remote signer) without assuming which one you'll choose.

If you swap LNbits for another NWC provider, the skills still work. If you swap relays, the skills still work. That's what building on protocols instead of products gets you.

## Try It

Install the nostr-core plugin in Claude Code:

```
/plugin install nostr-core-org/nostr-core
```

Then ask your agent to build something. Create a Lightning-enabled bot. Set up an identity. Build a social feed. The skills load automatically based on what you're doing.

Or just read them directly in the `skills/` directory. They're short, focused, and written to be useful whether you're an AI or a person.

Ten skills. One protocol. Everything an agent needs to build on Nostr.

---

**[GitHub](https://github.com/nostr-core-org/nostr-core)** . **[Skills Documentation](https://nostr-core-org.github.io/nostr-core/skills)**
