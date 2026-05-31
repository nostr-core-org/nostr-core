import { finalizeEvent, type NostrEvent, type EventTemplate } from './event.js'

export type CommentScope = {
  rootType: 'event' | 'address' | 'external'
  rootId: string
  rootKind?: number
  rootPubkey?: string
  parentType?: 'event' | 'address' | 'external'
  parentId?: string
  parentKind?: number
  parentPubkey?: string
}

/**
 * Create a kind 1111 comment event template (unsigned).
 */
export function createCommentEventTemplate(content: string, scope: CommentScope): EventTemplate {
  const tags: string[][] = []

  // Root tag
  if (scope.rootType === 'event') {
    const rootTag = ['E', scope.rootId]
    if (scope.rootPubkey) rootTag.push('', scope.rootPubkey)
    tags.push(rootTag)
    if (scope.rootKind !== undefined) tags.push(['K', String(scope.rootKind)])
  } else if (scope.rootType === 'address') {
    tags.push(['A', scope.rootId])
    if (scope.rootKind !== undefined) tags.push(['K', String(scope.rootKind)])
  } else {
    tags.push(['I', scope.rootId])
  }

  // NIP-22: uppercase tags refer to the root scope, lowercase to the
  // immediate parent. The separate root pubkey tag must therefore be 'P',
  // not 'p' — otherwise the root and parent author tags collide on
  // top-level comments where parentPubkey is also set later.
  if (scope.rootPubkey) tags.push(['P', scope.rootPubkey])

  // Parent tag (if replying to a comment)
  if (scope.parentId) {
    if (scope.parentType === 'event') {
      const parentTag = ['e', scope.parentId]
      if (scope.parentPubkey) parentTag.push('', scope.parentPubkey)
      tags.push(parentTag)
      if (scope.parentKind !== undefined) tags.push(['k', String(scope.parentKind)])
    } else if (scope.parentType === 'address') {
      tags.push(['a', scope.parentId])
      if (scope.parentKind !== undefined) tags.push(['k', String(scope.parentKind)])
    } else if (scope.parentType === 'external') {
      tags.push(['i', scope.parentId])
    }

    if (scope.parentPubkey) tags.push(['p', scope.parentPubkey])
  }

  return {
    kind: 1111,
    tags,
    content,
    created_at: Math.floor(Date.now() / 1000),
  }
}

/**
 * Create and sign a kind 1111 comment event.
 */
export function createCommentEvent(content: string, scope: CommentScope, secretKey: Uint8Array): NostrEvent {
  return finalizeEvent(createCommentEventTemplate(content, scope), secretKey)
}

/**
 * Parse a kind 1111 comment event.
 */
export function parseComment(event: NostrEvent): CommentScope & { content: string } {
  const result: CommentScope & { content: string } = {
    rootType: 'external',
    rootId: '',
    content: event.content,
  }

  for (const tag of event.tags) {
    switch (tag[0]) {
      case 'E':
        result.rootType = 'event'
        result.rootId = tag[1]
        if (tag[3]) result.rootPubkey = tag[3]
        break
      case 'A':
        result.rootType = 'address'
        result.rootId = tag[1]
        break
      case 'I':
        result.rootType = 'external'
        result.rootId = tag[1]
        break
      case 'K':
        result.rootKind = parseInt(tag[1], 10)
        break
      case 'P':
        result.rootPubkey = tag[1]
        break
      case 'e':
        result.parentType = 'event'
        result.parentId = tag[1]
        if (tag[3]) result.parentPubkey = tag[3]
        break
      case 'a':
        result.parentType = 'address'
        result.parentId = tag[1]
        break
      case 'i':
        result.parentType = 'external'
        result.parentId = tag[1]
        break
      case 'k':
        result.parentKind = parseInt(tag[1], 10)
        break
      case 'p':
        result.parentPubkey = tag[1]
        break
    }
  }

  return result
}
