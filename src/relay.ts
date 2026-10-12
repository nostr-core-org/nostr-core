import type { EventTemplate, NostrEvent } from './event.js'
import { verifyEvent } from './event.js'
import { matchFilters, type Filter } from './filter.js'
import { createAuthEventTemplate } from './nip42.js'
import { normalizeURL } from './utils.js'

export type SubscriptionParams = {
  onevent?: (evt: NostrEvent) => void
  oneose?: () => void
  /** Gets the relay's `CLOSED` reason as sent; see {@link parseRelayReason}. */
  onclose?: (reason: string) => void
  eoseTimeout?: number
}

const REASON_PREFIXES = ['duplicate', 'pow', 'blocked', 'rate-limited', 'invalid', 'restricted', 'mute', 'error', 'auth-required'] as const

/** Machine-readable prefix of an `OK` or `CLOSED` reason: NIP-01, plus `auth-required` (NIP-42). */
export type RelayReasonPrefix = (typeof REASON_PREFIXES)[number]

/**
 * Split an `OK` or `CLOSED` reason into its prefix and the human-readable message.
 *
 * ```ts
 * parseRelayReason('rate-limited: slow down') // { prefix: 'rate-limited', message: 'slow down' }
 * parseRelayReason('something went wrong')    // { message: 'something went wrong' }
 * ```
 */
export function parseRelayReason(reason: string): { prefix?: RelayReasonPrefix; message: string } {
  const text = reason.trim()
  const match = /^([a-z-]+):\s*(.*)$/s.exec(text)
  return match && (REASON_PREFIXES as readonly string[]).includes(match[1])
    ? { prefix: match[1] as RelayReasonPrefix, message: match[2] }
    : { message: text }
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

/**
 * Signs a NIP-42 AUTH event (kind 22242) for a relay challenge.
 *
 * Works with a secret key (`t => finalizeEvent(t, sk)`), a NIP-07 extension
 * (`t => window.nostr.signEvent(t)`) or a NIP-46 signer (`t => signer.signEvent(t)`).
 */
export type AuthSigner = (template: EventTemplate) => Promise<NostrEvent> | NostrEvent

export type RelayOptions = {
  websocketImplementation?: typeof WebSocket
  reconnect?: ReconnectOptions | false
  /**
   * Opt-in NIP-42 authentication. When set, the relay answers AUTH challenges
   * itself, and a REQ closed or an EVENT refused with `auth-required:` is
   * re-sent once after authenticating. Every relay that challenges learns the
   * signer's pubkey. Without it, behaviour is unchanged.
   */
  authSigner?: AuthSigner
}

const AUTH_REQUIRED = 'auth-required:'

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

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = unrefTimer(setTimeout(() => reject(new Error(message)), ms))
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

type OpenPublish = {
  resolve: (reason: string) => void
  reject: (err: Error) => void
  timeout: ReturnType<typeof setTimeout>
  /** The EVENT frame of a publish, kept so an `auth-required` refusal can re-send it once. */
  frame?: string
  authRetried?: boolean
}

export class Subscription {
  public readonly relay: Relay
  public readonly id: string
  public closed = false
  public eosed = false
  /** True once this REQ was re-sent after an `auth-required` CLOSED on the current connection. */
  public authRetried = false
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
    clearTimeout(this.eoseTimeoutHandle)
    this.eoseTimeoutHandle = setTimeout(() => this.receivedEose(), this.relay.eoseTimeout)
  }

  /** Stop the EOSE timer while the relay authenticates; {@link fire} re-arms it. */
  pauseEoseTimeout() {
    clearTimeout(this.eoseTimeoutHandle)
    this.eoseTimeoutHandle = undefined
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
    this.authRetried = false
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
  /** How long to wait for an AUTH challenge, and for `authSigner` to sign it, in ms. */
  public authTimeout = 10000
  public openSubs = new Map<string, Subscription>()
  public onauth: ((challenge: string) => void) | undefined
  /** The latest NIP-42 challenge on the current connection; cleared when it drops. */
  public challenge: string | undefined

  /** Fired when an established connection drops, before a retry is scheduled. */
  public ondisconnect: ((reason: string) => void) | undefined
  /** Fired after a dropped connection is re-established and its REQs replayed. */
  public onreconnect: (() => void) | undefined
  /** Fired when auto-reconnect gives up (maxAttempts reached). */
  public onreconnectfailed: ((err: Error) => void) | undefined

  private connectionPromise: Promise<void> | undefined
  private openEventPublishes = new Map<string, OpenPublish>()
  private ws: WebSocket | undefined
  private serial = 0
  private _WebSocket: typeof WebSocket

  private reconnectOptions: ResolvedReconnectOptions
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined
  private reconnectAttempts = 0
  private closedByUser = false
  private hasEverConnected = false

  private authSigner: AuthSigner | undefined
  /** Bumped whenever the socket goes away, so late auth results for an old socket are ignored. */
  private connectionGen = 0
  private authedChallenge: string | undefined
  /** The one answer per challenge, shared by everyone waiting on it. */
  private authAttempt: { challenge: string; result: Promise<void> } | undefined
  private challengeWaiters = new Set<{ resolve: () => void; reject: (err: Error) => void }>()

  constructor(url: string, opts?: RelayOptions) {
    this.url = normalizeURL(url)
    this.authSigner = opts?.authSigner
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
    const frame = '["EVENT",' + JSON.stringify(event) + ']'
    const ret = new Promise<string>((resolve, reject) => {
      const timeout = this._publishTimer(event.id, 'publish timed out')
      this.openEventPublishes.set(event.id, { resolve, reject, timeout, frame })
    })
    this.send(frame)
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
      const timeout = this._publishTimer(event.id, 'auth timed out')
      this.openEventPublishes.set(event.id, { resolve, reject, timeout })
    })
    this.send('["AUTH",' + JSON.stringify(event) + ']')
    const reason = await ret
    this.authedChallenge = event.tags.find(t => t[0] === 'challenge')?.[1]
    return reason
  }

  close() {
    this.closedByUser = true
    this._cancelReconnect()
    this._resetAuth('relay connection closed by us')
    this.closeAllSubscriptions('relay connection closed by us')
    this._connected = false
    this.connectionPromise = undefined
    if (this.ws?.readyState === this._WebSocket.OPEN) {
      this.ws?.close()
    }
    this.ws = undefined
  }

  private _handleDisconnect(reason: string) {
    this._resetAuth(reason)
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

  private _publishTimer(id: string, message: string): ReturnType<typeof setTimeout> {
    return setTimeout(() => {
      const ep = this.openEventPublishes.get(id)
      if (ep) {
        ep.reject(new Error(message))
        this.openEventPublishes.delete(id)
      }
    }, this.publishTimeout)
  }

  /** Forget the challenge and any authentication; it belonged to the old socket. */
  private _resetAuth(reason: string) {
    this.connectionGen++
    this.challenge = undefined
    this.authedChallenge = undefined
    this.authAttempt = undefined
    for (const waiter of this.challengeWaiters) waiter.reject(new Error(reason))
    this.challengeWaiters.clear()
  }

  private _isAuthRequired(reason: unknown): boolean {
    return this.authSigner !== undefined && typeof reason === 'string' && reason.startsWith(AUTH_REQUIRED)
  }

  /**
   * Authenticate with `authSigner` for the current challenge, waiting for one
   * if the relay has not sent it yet. Each challenge is answered at most once:
   * callers share the same attempt and its outcome.
   */
  private _authenticate(): Promise<void> {
    const challenge = this.challenge
    if (challenge === undefined) return this._nextChallenge().then(() => this._authenticate())
    if (challenge === this.authedChallenge) return Promise.resolve()
    if (this.authAttempt?.challenge !== challenge) {
      const result = this._answerChallenge(challenge)
      result.catch(() => {})
      this.authAttempt = { challenge, result }
    }
    return this.authAttempt.result
  }

  private async _answerChallenge(challenge: string): Promise<void> {
    const gen = this.connectionGen
    const template = createAuthEventTemplate({ relay: this.url, challenge })
    const event = await withTimeout(Promise.resolve(this.authSigner!(template)), this.authTimeout, 'auth signer timed out')
    if (gen !== this.connectionGen) throw new Error('relay connection closed')
    await this.auth(event)
  }

  private _nextChallenge(): Promise<void> {
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject }
      this.challengeWaiters.add(waiter)
      unrefTimer(setTimeout(() => {
        if (this.challengeWaiters.delete(waiter)) reject(new Error('no auth challenge received'))
      }, this.authTimeout))
    })
  }


  /**
   * Authenticate, then run `retry`. `fail` gets a reason when that is not
   * possible. Results that arrive after the socket changed are dropped: the
   * reconnect replays subscriptions, and publishes were already rejected.
   */
  private _retryAfterAuth(retry: () => void, fail: (reason: string) => void) {
    const gen = this.connectionGen
    this._authenticate().then(
      () => {
        if (gen !== this.connectionGen) return
        try {
          retry()
        } catch (err) {
          fail(((err as Error)?.message ?? String(err)))
        }
      },
      err => {
        if (gen === this.connectionGen) fail(`${AUTH_REQUIRED} ${((err as Error)?.message ?? String(err))}`)
      },
    )
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
        if (!ep) return
        clearTimeout(ep.timeout)
        if (!ok && ep.frame && !ep.authRetried && this._isAuthRequired(reason)) {
          ep.authRetried = true
          const current = () => this.openEventPublishes.get(id) === ep
          this._retryAfterAuth(
            () => {
              if (!current()) return
              ep.timeout = this._publishTimer(id, 'publish timed out')
              this.send(ep.frame!)
            },
            failReason => {
              if (!current()) return
              clearTimeout(ep.timeout)
              this.openEventPublishes.delete(id)
              ep.reject(new Error(failReason))
            },
          )
          return
        }
        if (ok) ep.resolve(reason)
        else ep.reject(new Error(reason))
        this.openEventPublishes.delete(id)
        return
      }
      case 'CLOSED': {
        const so = this.openSubs.get(data[1] as string)
        if (!so) return
        const reason = data[2] as string
        if (!so.authRetried && this._isAuthRequired(reason)) {
          so.authRetried = true
          so.pauseEoseTimeout()
          this._retryAfterAuth(
            () => {
              if (!so.closed) so.fire()
            },
            failReason => so.close(failReason),
          )
          return
        }
        so.close(reason)
        return
      }
      case 'AUTH': {
        const challenge = data[1] as string
        this.challenge = challenge
        for (const waiter of this.challengeWaiters) waiter.resolve()
        this.challengeWaiters.clear()
        // An explicit onauth handler stays in charge of answering challenges.
        if (this.onauth) this.onauth(challenge)
        else if (this.authSigner) this._authenticate().catch(() => {})
        return
      }
      case 'NOTICE': {
        return
      }
    }
  }
}
