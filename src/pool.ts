import {
  Relay,
  Subscription,
  parseRelayReason,
  type AuthSigner,
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

/** One relay's outcome of {@link RelayPool.publishDetailed}. */
export type PublishResult = {
  url: string
  ok: boolean
  /** The relay's `OK` reason, or the local error when it never answered. */
  reason: string
  prefix?: RelayReasonPrefix
  message: string
}

export class RelayPool {
  private relays = new Map<string, Relay>()
  private maxWaitForConnection: number
  private _WebSocket?: typeof WebSocket
  private _reconnect?: ReconnectOptions | false
  private _authSigner?: AuthSigner

  constructor(opts?: {
    websocketImplementation?: typeof WebSocket
    maxWaitForConnection?: number
    /** Auto-reconnect settings applied to every relay in the pool. Pass `false` to disable. */
    reconnect?: ReconnectOptions | false
    /**
     * Opt-in NIP-42 signer given to every relay the pool creates: challenges are
     * answered, and `auth-required` refusals are retried once after AUTH.
     */
    authSigner?: AuthSigner
  }) {
    this._WebSocket = opts?.websocketImplementation
    this.maxWaitForConnection = opts?.maxWaitForConnection || 3000
    this._reconnect = opts?.reconnect
    this._authSigner = opts?.authSigner
  }

  async ensureRelay(url: string, opts?: { connectionTimeout?: number }): Promise<Relay> {
    url = normalizeURL(url)
    let relay = this.relays.get(url)
    if (!relay) {
      relay = new Relay(url, {
        websocketImplementation: this._WebSocket,
        reconnect: this._reconnect,
        authSigner: this._authSigner,
      })
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
   * Like {@link publish}, but reports every relay: one result per relay, in input
   * order. Relay trouble never rejects; `onResult` fires as each relay answers.
   */
  async publishDetailed(
    relayUrls: string[],
    event: NostrEvent,
    opts?: { onResult?: (result: PublishResult) => void },
  ): Promise<PublishResult[]> {
    const urls = [...new Set(relayUrls.map(normalizeURL))]
    return Promise.all(
      urls.map(async url => {
        let ok = true
        let reason: string
        try {
          reason = await (await this.ensureRelay(url)).publish(event)
        } catch (err) {
          ok = false
          reason = err instanceof Error ? err.message : String(err)
        }
        const result: PublishResult = { url, ok, reason, ...parseRelayReason(reason) }
        opts?.onResult?.(result)
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
