import type { NostrEvent } from './event.js'
import { verifyEvent } from './event.js'
import { matchFilters, type Filter } from './filter.js'
import { normalizeURL } from './utils.js'

export type SubscriptionParams = {
  onevent?: (evt: NostrEvent) => void
  oneose?: () => void
  onclose?: (reason: string) => void
  eoseTimeout?: number
}

/**
 * Auto-reconnect behaviour for a {@link Relay}.
 *
 * A WebSocket that closes unexpectedly (laptop sleep, NAT/proxy idle timeout,
 * relay restart) would otherwise take every standing subscription with it.
 * When enabled, the relay retries with exponential backoff and re-fires its
 * open REQs once the socket is back.
 */
export type ReconnectOptions = {
  /** Default: true. */
  enabled?: boolean
  /** Delay before the first retry, in ms. Default: 1000. */
  initialDelay?: number
  /** Upper bound on the backoff delay, in ms. Default: 30000. */
  maxDelay?: number
  /** Backoff multiplier. Default: 2. */
  factor?: number
  /** Give up after this many consecutive failures. Default: Infinity. */
  maxAttempts?: number
  /** Fraction of the delay applied as random jitter, 0-1. Default: 0.3. */
  jitter?: number
  /** Connection timeout for each retry, in ms. Default: 5000. */
  connectionTimeout?: number
}

type ResolvedReconnectOptions = Required<ReconnectOptions>

const DEFAULT_RECONNECT: ResolvedReconnectOptions = {
  enabled: true,
  initialDelay: 1000,
  maxDelay: 30000,
  factor: 2,
  maxAttempts: Infinity,
  jitter: 0.3,
  connectionTimeout: 5000,
}

/** Keep a pending reconnect from holding a Node process open. */
function unrefTimer(timer: ReturnType<typeof setTimeout>): ReturnType<typeof setTimeout> {
  ;(timer as unknown as { unref?: () => void }).unref?.()
  return timer
}

export class Subscription {
  public readonly relay: Relay
  public readonly id: string
  public closed = false
  public eosed = false
  public filters: Filter[]

  public onevent: (evt: NostrEvent) => void
  public oneose: (() => void) | undefined
  public onclose: ((reason: string) => void) | undefined

  private eoseTimeoutHandle: ReturnType<typeof setTimeout> | undefined

  constructor(relay: Relay, id: string, filters: Filter[], params: SubscriptionParams) {
    this.relay = relay
    this.filters = filters
    this.id = id
    this.onevent = params.onevent || (() => {})
    this.oneose = params.oneose
    this.onclose = params.onclose
  }

  fire() {
    this.relay.send('["REQ","' + this.id + '",' + JSON.stringify(this.filters).substring(1))
    this.eoseTimeoutHandle = setTimeout(() => this.receivedEose(), this.relay.eoseTimeout)
  }

  /**
   * Clear the per-connection state so the subscription can be re-fired on a
   * fresh socket. The relay replays the REQ from scratch, so a new EOSE is
   * expected and previously delivered events may arrive again.
   */
  reset() {
    clearTimeout(this.eoseTimeoutHandle)
    this.eoseTimeoutHandle = undefined
    this.eosed = false
  }

  receivedEose() {
    if (this.eosed) return
    clearTimeout(this.eoseTimeoutHandle)
    this.eosed = true
    this.oneose?.()
  }

  close(reason = 'closed by caller') {
    if (this.closed) return
    this.closed = true
    clearTimeout(this.eoseTimeoutHandle)
    if (this.relay.connected) {
      try {
        this.relay.send('["CLOSE",' + JSON.stringify(this.id) + ']')
      } catch {
        // ignore send errors on close
      }
    }
    this.relay.openSubs.delete(this.id)
    this.onclose?.(reason)
  }
}

export class Relay {
  public readonly url: string
  private _connected = false
  public eoseTimeout = 4400
  public publishTimeout = 4400
  public openSubs = new Map<string, Subscription>()
  public onauth: ((challenge: string) => void) | undefined

  /** Fired when an established connection drops, before a retry is scheduled. */
  public ondisconnect: ((reason: string) => void) | undefined
  /** Fired after a dropped connection is re-established and its REQs replayed. */
  public onreconnect: (() => void) | undefined
  /** Fired when auto-reconnect gives up (maxAttempts reached). */
  public onreconnectfailed: ((err: Error) => void) | undefined

  private connectionPromise: Promise<void> | undefined
  private openEventPublishes = new Map<string, {
    resolve: (reason: string) => void
    reject: (err: Error) => void
    timeout: ReturnType<typeof setTimeout>
  }>()
  private ws: WebSocket | undefined
  private serial = 0
  private _WebSocket: typeof WebSocket

  private reconnectOptions: ResolvedReconnectOptions
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined
  private reconnectAttempts = 0
  private closedByUser = false
  private hasEverConnected = false

  constructor(url: string, opts?: { websocketImplementation?: typeof WebSocket; reconnect?: ReconnectOptions | false }) {
    this.url = normalizeURL(url)
    this._WebSocket = opts?.websocketImplementation || WebSocket
    this.reconnectOptions =
      opts?.reconnect === false
        ? { ...DEFAULT_RECONNECT, enabled: false }
        : { ...DEFAULT_RECONNECT, ...opts?.reconnect }
  }

  get connected(): boolean {
    return this._connected
  }

  /** True while a reconnect attempt is pending. */
  get reconnecting(): boolean {
    return this.reconnectTimer !== undefined
  }

  async connect(opts?: { timeout?: number }): Promise<void> {
    if (this.connectionPromise) return this.connectionPromise
    this.closedByUser = false

    this.connectionPromise = new Promise((resolve, reject) => {
      let connectionTimeoutHandle: ReturnType<typeof setTimeout> | undefined
      let ws: WebSocket

      if (opts?.timeout) {
        connectionTimeoutHandle = setTimeout(() => {
          reject(new Error('connection timed out'))
          this.connectionPromise = undefined
        }, opts.timeout)
      }

      try {
        ws = new this._WebSocket(this.url)
        this.ws = ws
      } catch (err) {
        clearTimeout(connectionTimeoutHandle)
        this.connectionPromise = undefined
        reject(err)
        return
      }

      ws.onopen = () => {
        clearTimeout(connectionTimeoutHandle)
        this._connected = true
        this.hasEverConnected = true
        this.reconnectAttempts = 0
        resolve()
      }

      ws.onerror = () => {
        clearTimeout(connectionTimeoutHandle)
        reject(new Error('connection failed'))
        this.connectionPromise = undefined
      }

      ws.onclose = () => {
        // A socket we already replaced can still emit close; ignore it.
        if (ws !== this.ws) return
        clearTimeout(connectionTimeoutHandle)
        this._connected = false
        this.connectionPromise = undefined
        this._handleDisconnect('relay connection closed')
      }

      ws.onmessage = this._onmessage.bind(this)
    })

    return this.connectionPromise
  }

  send(message: string) {
    if (!this._connected || !this.ws) throw new Error(`not connected to ${this.url}`)
    this.ws.send(message)
  }

  async publish(event: NostrEvent): Promise<string> {
    const ret = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const ep = this.openEventPublishes.get(event.id)
        if (ep) {
          ep.reject(new Error('publish timed out'))
          this.openEventPublishes.delete(event.id)
        }
      }, this.publishTimeout)
      this.openEventPublishes.set(event.id, { resolve, reject, timeout })
    })
    this.send('["EVENT",' + JSON.stringify(event) + ']')
    return ret
  }

  subscribe(filters: Filter[], params: SubscriptionParams & { id?: string }): Subscription {
    this.serial++
    const id = params.id || 'sub:' + this.serial
    const sub = new Subscription(this, id, filters, params)
    this.openSubs.set(id, sub)

    if (this._connected) {
      sub.fire()
    } else if (!this.reconnecting) {
      // No socket and no retry in flight: behave as before and fail loudly.
      this.openSubs.delete(id)
      throw new Error(`not connected to ${this.url}`)
    }
    // Otherwise the REQ is replayed by _resubscribeAll() once we are back.

    return sub
  }

  async auth(event: NostrEvent): Promise<string> {
    const ret = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const ep = this.openEventPublishes.get(event.id)
        if (ep) {
          ep.reject(new Error('auth timed out'))
          this.openEventPublishes.delete(event.id)
        }
      }, this.publishTimeout)
      this.openEventPublishes.set(event.id, { resolve, reject, timeout })
    })
    this.send('["AUTH",' + JSON.stringify(event) + ']')
    return ret
  }

  close() {
    this.closedByUser = true
    this._cancelReconnect()
    this.closeAllSubscriptions('relay connection closed by us')
    this._connected = false
    this.connectionPromise = undefined
    if (this.ws?.readyState === this._WebSocket.OPEN) {
      this.ws?.close()
    }
    this.ws = undefined
  }

  private _handleDisconnect(reason: string) {
    // In-flight publishes can never be answered on a dead socket.
    this._failOpenEventPublishes(reason)

    const shouldRetry =
      !this.closedByUser && this.reconnectOptions.enabled && this.hasEverConnected

    if (!shouldRetry) {
      this.closeAllSubscriptions(reason)
      return
    }

    // Keep openSubs intact - those filters are exactly what has to be replayed.
    this.ondisconnect?.(reason)
    this._scheduleReconnect()
  }

  private _scheduleReconnect() {
    if (this.reconnectTimer || this.closedByUser) return

    const { initialDelay, maxDelay, factor, maxAttempts, jitter, connectionTimeout } = this.reconnectOptions

    if (this.reconnectAttempts >= maxAttempts) {
      const err = new Error(`giving up reconnecting to ${this.url} after ${maxAttempts} attempts`)
      this.closeAllSubscriptions(err.message)
      this.onreconnectfailed?.(err)
      return
    }

    const base = Math.min(maxDelay, initialDelay * Math.pow(factor, this.reconnectAttempts))
    const delay = base * (1 + (Math.random() * 2 - 1) * jitter)
    this.reconnectAttempts++

    this.reconnectTimer = unrefTimer(
      setTimeout(async () => {
        this.reconnectTimer = undefined
        if (this.closedByUser) return
        try {
          await this.connect({ timeout: connectionTimeout })
          this._resubscribeAll()
          this.onreconnect?.()
        } catch {
          this._scheduleReconnect()
        }
      }, Math.max(0, Math.round(delay))),
    )
  }

  private _cancelReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = undefined
    }
    this.reconnectAttempts = 0
  }

  private _resubscribeAll() {
    for (const sub of [...this.openSubs.values()]) {
      if (sub.closed) {
        this.openSubs.delete(sub.id)
        continue
      }
      sub.reset()
      try {
        sub.fire()
      } catch {
        // Socket died again mid-replay; the close handler schedules another try.
        return
      }
    }
  }

  private _failOpenEventPublishes(reason: string) {
    for (const [, ep] of this.openEventPublishes) {
      clearTimeout(ep.timeout)
      ep.reject(new Error(reason))
    }
    this.openEventPublishes.clear()
  }

  private closeAllSubscriptions(reason: string) {
    for (const [, sub] of this.openSubs) {
      sub.close(reason)
    }
    this.openSubs.clear()
    this._failOpenEventPublishes(reason)
  }

  _onmessage(ev: MessageEvent): void {
    let data: unknown[]
    try {
      data = JSON.parse(ev.data)
    } catch {
      return
    }

    switch (data[0]) {
      case 'EVENT': {
        const so = this.openSubs.get(data[1] as string)
        if (!so) return
        const event = data[2] as NostrEvent
        if (verifyEvent(event) && matchFilters(so.filters, event)) {
          so.onevent(event)
        }
        return
      }
      case 'EOSE': {
        const so = this.openSubs.get(data[1] as string)
        if (!so) return
        so.receivedEose()
        return
      }
      case 'OK': {
        const id = data[1] as string
        const ok = data[2] as boolean
        const reason = data[3] as string
        const ep = this.openEventPublishes.get(id)
        if (ep) {
          clearTimeout(ep.timeout)
          if (ok) ep.resolve(reason)
          else ep.reject(new Error(reason))
          this.openEventPublishes.delete(id)
        }
        return
      }
      case 'CLOSED': {
        const so = this.openSubs.get(data[1] as string)
        if (!so) return
        so.close(data[2] as string)
        return
      }
      case 'AUTH': {
        const challenge = data[1] as string
        this.onauth?.(challenge)
        return
      }
      case 'NOTICE': {
        return
      }
    }
  }
}
