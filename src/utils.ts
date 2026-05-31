export const utf8Decoder = new TextDecoder('utf-8')
export const utf8Encoder = new TextEncoder()

export { bytesToHex, hexToBytes, randomBytes } from '@noble/hashes/utils.js'

export function normalizeURL(url: string): string {
  try {
    if (url.indexOf('://') === -1) url = 'wss://' + url
    const p = new URL(url)
    if (p.protocol === 'http:') p.protocol = 'ws:'
    else if (p.protocol === 'https:') p.protocol = 'wss:'
    p.pathname = p.pathname.replace(/\/+/g, '/')
    if (p.pathname.endsWith('/')) p.pathname = p.pathname.slice(0, -1)
    if ((p.port === '80' && p.protocol === 'ws:') || (p.port === '443' && p.protocol === 'wss:')) p.port = ''
    p.searchParams.sort()
    p.hash = ''
    return p.toString()
  } catch (e) {
    throw new Error(`Invalid URL: ${url}`)
  }
}
