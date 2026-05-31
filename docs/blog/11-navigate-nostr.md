<p align="center">
  <img src="/headers/blog-11-navigate-nostr.svg" alt="Navigate Nostr" width="100%">
</p>

# Navigate Nostr

**Agents don't need more protocol knowledge. They need to know where to look.**

---

## The Problem Isn't Complexity

Nostr is a big protocol. Forty-eight NIPs and counting. LNURL has its own spec repo. Cashu has NUTs. Blossom has BUDs. Each one lives in a different repository, follows a different numbering scheme, documents a different piece of the puzzle.

For a human developer, this is manageable. You bookmark the repos, learn the naming conventions, know which README has the event kinds table.

For an AI agent, it's a cold start every time. No bookmarks. No muscle memory. No sense of where to look first.

So the agent guesses. It hallucinates a URL. It confuses a NIP number with an event kind number. It reaches for the wrong spec repo. It wastes context on dead ends.

The protocol is well-documented. The documentation is just scattered across five repositories with four different naming conventions.

## A Compass, Not a Map

The `navigate-nostr` skill doesn't try to teach an agent the Nostr protocol. It teaches the agent where the documentation lives and how to find things in it.

That's a subtle but important distinction. A map is static. It goes stale the moment a NIP updates. A compass is a pattern. It tells you:

- NIPs live here: `https://github.com/nostr-protocol/nips/blob/master/{NIP}.md`
- LNURL LUDs live here: `https://github.com/lnurl/luds/blob/luds/{LUD}.md`
- Cashu NUTs live here: `https://github.com/cashubtc/nuts/blob/main/{NUT}.md`
- Blossom BUDs live here: `https://github.com/hzrd149/blossom/blob/master/buds/{BUD}.md`

Four URL patterns. That's the entire Nostr ecosystem, navigable.

## What the Skill Actually Contains

The skill has three layers:

**Layer 1: Protocol navigation.** How to find NIPs, how to look up event kinds (hint: there's no NIP-to-kind mapping; you have to check the README's event kinds table), how to discover what already exists before building something new.

**Layer 2: Ecosystem pointers.** The LNURL LUDs repo, the BOLT-11 spec, the Cashu NUTs, the Blossom BUDs. Each with a URL pattern and the key documents worth knowing about.

**Layer 3: The module map.** A table that connects every nostr-core module to its spec. An agent that knows it needs NIP-57 zaps can look at the table and see: import `nip57`, read the spec at `57.md`. No guessing. No searching.

The three layers work together. The agent navigates from "I need to implement zaps" to the right spec and the right import in two lookups.

## Why Agents Need This

Every agent framework has the same fundamental problem: the agent knows what it wants to do but not where to find the information to do it correctly.

Consider an agent that needs to send a zap. Without navigation, it has to:

1. Search for "nostr zaps" and hope for good results
2. Figure out which NIP covers zaps (it's 57, but that's not obvious)
3. Find the spec URL (is it on GitHub? Which repo? What path?)
4. Figure out which nostr-core module implements it
5. Hope it didn't hallucinate any of the above

With `navigate-nostr` loaded, the same agent:

1. Checks the module map: zaps are `nip57`, spec is NIP-57
2. Fetches `https://github.com/nostr-protocol/nips/blob/master/57.md`
3. Imports `nip57` from `nostr-core`

Three steps. No guessing. No hallucination. The skill turns an open-ended search problem into a lookup.

## The Pattern

This follows a principle that applies beyond Nostr: agents work better when you give them navigation tools rather than knowledge dumps.

A skill that contains the full text of every NIP would be massive, stale within weeks, and would burn context window on information the agent may never need. A skill that teaches the agent how to fetch the right NIP on demand is small, stays current (the URL patterns don't change), and lets the agent pull exactly what it needs.

Teach agents where to look, not what to remember.

## Try It

If you have nostr-core installed as a Claude Code plugin, the skill is already available:

```
/navigate-nostr
```

Or load it directly from the repo:

```
/plugin install nostr-core-org/nostr-core
```

The skill is a single markdown file. Read it yourself if you want to see what a navigation-first skill looks like. It's in `skills/navigate-nostr/SKILL.md`.

The protocol is big. The compass is small. That's the point.

---

**[GitHub](https://github.com/nostr-core-org/nostr-core)** . **[Skills Documentation](https://nostr-core-org.github.io/nostr-core/skills)**
