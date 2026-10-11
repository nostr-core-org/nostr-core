import {
  Relay,
  Subscription,
  parseRelayReason,
  type ReconnectOptions,
  type RelayReasonPrefix,
  type SubscriptionParams,
} from './relay.js'
import type { NostrEvent } from './event.js'
import type { Filter } from './filter.js'
import { normalizeURL } from './utils.js'

export type SubCloser = { close: (reason?: string) => void }

export type PoolSubscribeParams = SubscriptionParams & {
  maxWait?: number
  id?: string
  label?: string
}

/** What one relay made of a {@link RelayPool.publishDetailed} call. */
export type PublishResult = {
  /** Normalised relay URL. */
  url: string
  /** True when the relay answered `OK` with `true`. */
  ok: boolean
  /**
   * The relay's `OK` reason as sent (may be empty when `ok` is true), or the
   * local failure when there was no `OK` at all: `connection failed`,
   * `connection timed out`, `publish timed out`, `relay connection closed`, ...
   */
  reason: string
  /** NIP-01 / NIP-42 prefix of `reason`, see {@link parseRelayReason}. */
  prefix?: RelayReasonPrefix
  /** `reason` without its prefix, trimmed. */
  message: string
}

export type PublishDetailedOptions = {
  /**
   * Called once per relay as soon as that relay's outcome is known, e.g. to
   * show "sent" on the first `ok: true` without waiting for slower relays.
   * Errors it throws are ignored.
   */
  onResult?: (result: PublishResult) => void
}

/** Like normalizeURL, but an unparsable URL is kept as given so it can fail per relay. */
function normalizeOrKeep(url: string): string {
  try {
    return normalizeURL(url)
  } catch {
    return url
  }
}

function publishResult(url: string, ok: boolean, reason: string): PublishResult {
  const { prefix, message } = parseRelayReason(reason)
  return prefix ? { url, ok, reason, prefix, message } : { url, ok, reason, message }
}

export class RelayPool {
  private relays = new Map<string, Relay>()
  private maxWaitForConnection: number
  private _WebSocket?: typeof WebSocket
  private _reconnect?: ReconnectOptions | false

  constructor(opts?: {
    websocketImplementation?: typeof WebSocket
    maxWaitForConnection?: number
    /** Auto-reconnect settings applied to every relay in the pool. Pass `false` to disable. */
    reconnect?: ReconnectOptions | false
  }) {
    this._WebSocket = opts?.websocketImplementation
    this.maxWaitForConnection = opts?.maxWaitForConnection || 3000
    this._reconnect = opts?.reconnect
  }

  async ensureRelay(url: string, opts?: { connectionTimeout?: number }): Promise<Relay> {
    url = normalizeURL(url)
    let relay = this.relays.get(url)
    if (!relay) {
      relay = new Relay(url, { websocketImplementation: this._WebSocket, reconnect: this._reconnect })
      relay.publishTimeout = 5000
      this.relays.set(url, relay)
    }
    if (!relay.connected) {
      await relay.connect({ timeout: opts?.connectionTimeout || this.maxWaitForConnection })
    }
    return relay
  }

  subscribe(relayUrls: string[], filter: Filter, params: PoolSubscribeParams): SubCloser {
    const urls = [...new Set(relayUrls.map(normalizeURL))]
    const subs: Subscription[] = []
    const eosesReceived: boolean[] = new Array(urls.length).fill(false)
    const closesReceived: (string | null)[] = new Array(urls.length).fill(null)

    const handleEose = (i: number) => {
      if (eosesReceived[i]) return
      eosesReceived[i] = true
      if (eosesReceived.every(Boolean)) {
        params.oneose?.()
      }
    }

    const handleClose = (i: number, reason: string) => {
      if (closesReceived[i]) return
      handleEose(i)
      closesReceived[i] = reason
      if (closesReceived.every(Boolean)) {
        params.onclose?.(reason)
      }
    }

    const allOpened = Promise.all(
      urls.map(async (url, i) => {
        let relay: Relay
        try {
          relay = await this.ensureRelay(url, {
            connectionTimeout: params.maxWait || this.maxWaitForConnection,
          })
        } catch (err) {
          handleClose(i, (err as Error)?.message || String(err))
          return
        }

        const sub = relay.subscribe([filter], {
          ...params,
          oneose: () => handleEose(i),
          onclose: (reason) => handleClose(i, reason),
          id: params.id,
        })
        subs.push(sub)
      }),
    )

    return {
      async close(reason?: string) {
        await allOpened
        subs.forEach(sub => sub.close(reason))
      },
    }
  }

  async publish(relayUrls: string[], event: NostrEvent): Promise<string[]> {
    const urls = [...new Set(relayUrls.map(normalizeURL))]
    const results = await Promise.allSettled(
      urls.map(async url => {
        const relay = await this.ensureRelay(url)
        return relay.publish(event)
      }),
    )
    return results
      .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
      .map(r => r.value)
  }

  /**
   * Publish an event to multiple relays and report every relay's outcome.
   *
   * Unlike {@link publish}, nothing is dropped: there is one result per
   * (normalised, deduplicated) relay URL, in input order. Relay trouble never
   * rejects the promise: a failed connection, a timeout or an `OK false` all
   * become `ok: false` with a `reason`.
   */
  async publishDetailed(
    relayUrls: string[],
    event: NostrEvent,
    opts?: PublishDetailedOptions,
  ): Promise<PublishResult[]> {
    const urls = [...new Set(relayUrls.map(normalizeOrKeep))]
    return Promise.all(
      urls.map(async url => {
        let result: PublishResult
        try {
          const relay = await this.ensureRelay(url)
          result = publishResult(url, true, (await relay.publish(event)) ?? '')
        } catch (err) {
          result = publishResult(url, false, err instanceof Error ? err.message : String(err))
        }
        try {
          opts?.onResult?.(result)
        } catch {
          // A throwing callback must not cost the caller the other results.
        }
        return result
      }),
    )
  }

  async querySync(relayUrls: string[], filter: Filter, params?: { maxWait?: number }): Promise<NostrEvent[]> {
    return new Promise(resolve => {
      const events: NostrEvent[] = []
      const sub = this.subscribe(relayUrls, filter, {
        ...params,
        onevent(event: NostrEvent) {
          events.push(event)
        },
        oneose() {
          sub.close()
          resolve(events)
        },
        onclose() {
          resolve(events)
        },
      })
    })
  }

  close(relayUrls?: string[]) {
    const urls = relayUrls ? relayUrls.map(normalizeURL) : [...this.relays.keys()]
    urls.forEach(url => {
      this.relays.get(url)?.close()
      this.relays.delete(url)
    })
  }

  /**
   * Get the pooled {@link Relay} for a URL, if one has been created.
   * Useful for attaching `ondisconnect` / `onreconnect` handlers.
   */
  getRelay(url: string): Relay | undefined {
    return this.relays.get(normalizeURL(url))
  }

  listConnectionStatus(): Map<string, boolean> {
    const map = new Map<string, boolean>()
    this.relays.forEach((relay, url) => map.set(url, relay.connected))
    return map
  }
}
