---
date: 2026-08-17T21:00:00+02:00
---

<p align="center">
  <img src="/headers/blog-21-reconnect.svg" alt="Connections That Heal Themselves" width="100%">
</p>

# Connections That Heal Themselves

**Laptops sleep. NATs time out. Relays restart. Your subscriptions no longer die with the socket.**

---

## The Feed That Quietly Died

This one arrived as a bug report, issue #62, and it describes an afternoon most Nostr builders have lived through. A dashboard on a screen, subscribed to a few relays, working perfectly. Someone closes the laptop for lunch. The machine sleeps, the WebSocket dies, and here is the cruel part: nothing errors. No exception, no red text, no rejected promise. The subscriptions are simply gone, and the app sits there looking healthy, showing a feed that stopped at 12:47.

WebSockets close for a living. Laptop sleep, a NAT or proxy that drops idle connections, a relay deploy on the other end. None of these are exceptional events, and until this release, any one of them permanently killed every live subscription on the connection. The only cure was a reload, applied by a confused user.

## Reconnect Is the Default Now

As of this release, a dropped relay connection retries with exponential backoff and jitter, and when the socket comes back, every open subscription is replayed with its original id and filters. This is on by default, on `Relay` and on every relay a `RelayPool` manages, because a connection that stays down was never the behavior anyone wanted.

```ts
import { Relay } from 'nostr-core'

const relay = new Relay('wss://relay.damus.io', {
  reconnect: { initialDelay: 500, maxDelay: 15_000, maxAttempts: 20 },
})

relay.ondisconnect = (reason) => showOffline(reason)
relay.onreconnect = () => showLive()   // subscriptions already replayed
relay.onreconnectfailed = (err) => showGaveUp(err)
```

Every knob has a sane default: start at a second, double up to thirty, add jitter so a relay restart doesn't get a synchronized stampede of every client it dropped, retry forever unless told otherwise. Most apps will never pass a single option and never think about this again. The callbacks exist for the apps that want an offline indicator instead of a mystery.

## Replay, With Eyes Open

The details are where reconnect logic earns or loses your trust, so here is exactly what happens.

The open subscriptions survive the drop, which is the point: those filters are precisely what must be replayed. A replayed REQ is a fresh REQ, though, so the relay resends matching history and `oneose` fires again. Dedupe incoming events by id, the same guidance that already applies when you subscribe across multiple relays.

Publishes are the opposite case, and they stay honest: an in-flight publish on a dead socket rejects immediately. A publish is a one-shot request, and pretending it might still succeed would just move the failure somewhere harder to see.

Two boundaries keep the behavior predictable. An initial `connect()` that fails still rejects, no silent background retrying against a relay that was never reachable; retries only apply to connections that had actually opened. And `close()` means closed: it cancels any pending retry and shuts the subscriptions down. Calling `subscribe()` while a retry is pending queues the REQ and fires it on reconnect, so your startup code doesn't need to care what state the socket is in.

## Why Not Just Ping

The keepalive question comes up every time. Browsers cannot send WebSocket ping frames, full stop, so client-side keepalive is not available where most Nostr apps run. Reconnect-on-close is not the workaround, it is the remedy: accept that sockets die, and make death boring.

A while back we wrote that Nostr needs boring infrastructure. This is the most boring feature we have ever shipped, and we mean that as high praise. Nobody will screenshot it. Nobody will notice it. Their feed will just still be moving when they get back from lunch.

---

**[GitHub](https://github.com/nostr-core-org/nostr-core)** · **[Relay API](/api/relay)** · **[RelayPool API](/api/pool)**
