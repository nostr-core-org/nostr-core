// Main API
export { NWC } from './nwc.js'

// Types
export type {
  EncryptionType,
  Nip47Method,
  Nip47NotificationType,
  GetInfoResponse,
  GetBalanceResponse,
  GetBudgetResponse,
  PayResponse,
  Transaction,
  MakeInvoiceRequest,
  PayInvoiceRequest,
  PayKeysendRequest,
  LookupInvoiceRequest,
  ListTransactionsRequest,
  ListTransactionsResponse,
  SignMessageRequest,
  SignMessageResponse,
  Nip47Notification,
  NWCConnectionOptions,
  LightningAddressResponse,
  FiatRate,
  FiatConversion,
} from './types.js'

// Error classes
export {
  NWCError,
  NWCWalletError,
  NWCTimeoutError,
  NWCPublishTimeoutError,
  NWCReplyTimeoutError,
  NWCPublishError,
  NWCConnectionError,
  NWCDecryptionError,
  LightningAddressError,
  FiatConversionError,
} from './types.js'

// Lightning Address
export { fetchInvoice, validateLightningAddress, parseLightningAddress } from './lightning-address.js'

// LNURL Protocol
export * as lnurl from './lnurl.js'
export {
  encodeLnurl,
  decodeLnurl,
  isLnurl,
  resolveUrl as resolveLnurl,
  fetchPayRequest,
  requestInvoice as requestLnurlInvoice,
  fetchWithdrawRequest,
  submitWithdrawRequest,
  parseLnurlMetadata,
  parseSuccessAction,
  decryptAesSuccessAction,
  verifyPayment,
  LnurlError,
} from './lnurl.js'
export type {
  SuccessAction,
  PayerDataSpec,
  PayerData,
  LnurlMetadata,
  PayRequestResponse,
  PayRequestCallbackResponse,
  WithdrawRequestResponse,
  VerifyResponse as LnurlVerifyResponse,
  RequestInvoiceOptions,
} from './lnurl.js'

// Fiat Conversion
export { getExchangeRate, fiatToSats, satsToFiat } from './fiat.js'

// Crypto
export { generateSecretKey, getPublicKey } from './crypto.js'

// Event system
export { finalizeEvent, verifyEvent, getEventHash, serializeEvent, validateEvent, verifiedSymbol } from './event.js'
export type { NostrEvent, EventTemplate, UnsignedEvent, VerifiedEvent } from './event.js'

// Filters
export { matchFilter, matchFilters } from './filter.js'
export type { Filter } from './filter.js'

// NIPs
export * as nip02 from './nip02.js'
export * as nip04 from './nip04.js'
export * as nip05 from './nip05.js'
export * as nip06 from './nip06.js'
export * as nip07 from './nip07.js'
export * as nip09 from './nip09.js'
export * as nip10 from './nip10.js'
export * as nip11 from './nip11.js'
export * as nip13 from './nip13.js'
export * as nip17 from './nip17.js'
export * as nip18 from './nip18.js'
export * as nip19 from './nip19.js'
export * as nip21 from './nip21.js'
export * as nip22 from './nip22.js'
export * as nip23 from './nip23.js'
export * as nip24 from './nip24.js'
export * as nip25 from './nip25.js'
export * as nip27 from './nip27.js'
export * as nip28 from './nip28.js'
export * as nip29 from './nip29.js'
export * as nip30 from './nip30.js'
export * as nip31 from './nip31.js'
export * as nip36 from './nip36.js'
export * as nip40 from './nip40.js'
export * as nip42 from './nip42.js'
export * as nip44 from './nip44.js'
export * as nip46 from './nip46.js'
export * as nip48 from './nip48.js'
export * as nip50 from './nip50.js'
export * as nip51 from './nip51.js'
export * as nip56 from './nip56.js'
export * as nip57 from './nip57.js'
export * as nip52 from './nip52.js'
export * as nip58 from './nip58.js'
export * as nip59 from './nip59.js'
export * as nip60 from './nip60.js'
export * as nip65 from './nip65.js'
export * as nip75 from './nip75.js'
export * as nip98 from './nip98.js'

// Signer
export type { Signer, RelayMap } from './signer.js'
export { createSecretKeySigner } from './signer.js'

// NIP-07
export { Nip07Signer, getExtension, Nip07Error, Nip07NotAvailableError } from './nip07.js'
export type { Nip07Extension } from './nip07.js'

// NIP-46
export { NostrConnect, parseConnectionURI, Nip46Error, Nip46TimeoutError, Nip46ConnectionError, Nip46RemoteError } from './nip46.js'
export type { Nip46ConnectionOptions, Nip46Method, Nip46AppMetadata } from './nip46.js'

// NIP-59
export { createRumor, createSeal, createWrap, unwrap } from './nip59.js'
export type { Rumor } from './nip59.js'

// NIP-65
export { parseRelayList, createRelayListEventTemplate, createRelayListEvent, getReadRelays, getWriteRelays } from './nip65.js'
export type { RelayReadWrite } from './nip65.js'

// NIP-05
export { queryNip05, verifyNip05, parseNip05Address, Nip05Error } from './nip05.js'
export type { Nip05Result } from './nip05.js'

// NIP-06
export { generateMnemonic, validateMnemonic, mnemonicToKey, deriveKey, getDerivationPath } from './nip06.js'
export type { DerivedKey } from './nip06.js'

// NIP-09
export { createDeletionEventTemplate, createDeletionEvent, parseDeletion, isDeletionOf } from './nip09.js'
export type { DeletionTarget, DeletionRequest } from './nip09.js'

// NIP-10
export { parseThread, buildThreadTags } from './nip10.js'
export type { ThreadReference } from './nip10.js'

// NIP-11
export { fetchRelayInfo, supportsNip, Nip11Error } from './nip11.js'
export type { RelayInfo } from './nip11.js'

// NIP-17
export { wrapDirectMessage, unwrapDirectMessage } from './nip17.js'
export type { DirectMessage } from './nip17.js'

// NIP-21
export { encodeNostrURI, decodeNostrURI, isNostrURI } from './nip21.js'

// NIP-22
export { createCommentEventTemplate, createCommentEvent, parseComment } from './nip22.js'
export type { CommentScope } from './nip22.js'

// NIP-23
export { createLongFormEventTemplate, createLongFormEvent, parseLongForm } from './nip23.js'
export type { LongFormContent } from './nip23.js'

// NIP-24
export { parseExtendedMetadata, buildMetadataContent, parseUniversalTags, buildUniversalTags } from './nip24.js'
export type { ExtendedMetadata, UniversalTags } from './nip24.js'

// NIP-25
export { createReactionEventTemplate, createReactionEvent, parseReaction } from './nip25.js'
export type { Reaction } from './nip25.js'

// NIP-27
export { extractReferences, replaceReferences } from './nip27.js'
export type { ContentReference } from './nip27.js'

// NIP-29
export { createGroupChatTemplate, createGroupChatEvent, createGroupAdminTemplate, parseGroupMetadata, parseGroupMembers, parseGroupAdmins } from './nip29.js'
export type { GroupMetadata, GroupAdminAction } from './nip29.js'

// NIP-30
export { parseCustomEmojis, buildEmojiTags, extractEmojiShortcodes } from './nip30.js'
export type { CustomEmoji } from './nip30.js'

// NIP-31
export { addAltTag, getAltTag } from './nip31.js'

// NIP-42
export { createAuthEventTemplate, createAuthEvent, verifyAuthEvent } from './nip42.js'

// NIP-51
export { createListEventTemplate as createListTemplate, createListEvent, parseList, getEventIds, getPubkeys, getHashtags, getRelayUrls, getAddresses } from './nip51.js'
export type { ListItem, ParsedList } from './nip51.js'

// NIP-52
export {
  createDateBasedCalendarEventTemplate, createDateBasedCalendarEvent, parseDateBasedCalendarEvent,
  createTimeBasedCalendarEventTemplate, createTimeBasedCalendarEvent, parseTimeBasedCalendarEvent,
  createCalendarTemplate, createCalendarEvent, parseCalendar,
  createCalendarEventRSVPTemplate, createCalendarEventRSVP, parseCalendarEventRSVP,
  buildCalendarEventAddress, isCalendarEvent,
} from './nip52.js'
export type {
  DateBasedCalendarEvent, TimeBasedCalendarEvent, CalendarEventParticipant,
  Calendar, CalendarEventRSVP, RSVPStatus, FreeBusy,
} from './nip52.js'

// NIP-57
export { createZapRequestEventTemplate, createZapRequestEvent, parseZapReceipt, validateZapReceipt, fetchZapInvoice, ZapError } from './nip57.js'
export type { ZapRequest, ZapReceipt } from './nip57.js'

// NIP-58
export {
  createBadgeDefinitionTemplate, createBadgeDefinitionEvent, parseBadgeDefinition,
  createBadgeAwardTemplate, createBadgeAwardEvent, parseBadgeAward,
  createProfileBadgesTemplate, createProfileBadgesEvent, parseProfileBadges,
  createBadgeRequestTemplate, parseBadgeRequest, extractBadgeProof, verifyBadgeProof, validateBadgeAward,
  createBadgeAcceptanceTemplate, createBadgeAcceptanceEvent,
  createBadgeRejectionTemplate, createBadgeRejectionEvent,
  buildBadgeAddress, hasBeenAwarded,
} from './nip58.js'
export type {
  BadgeDefinition, BadgeAward, ProfileBadge,
  BadgeProof, BadgeProofPow, BadgeProofPayment, BadgeProofMembership,
  BadgeRequest, BadgeAcceptance, BadgeRejection,
} from './nip58.js'

// NIP-60
export {
  createWalletEventTemplate, createWalletEvent, parseWalletEvent,
  createTokenEventTemplate, createTokenEvent, parseTokenEvent,
  createHistoryEventTemplate, createHistoryEvent, parseHistoryEvent,
  createQuoteEventTemplate, createQuoteEvent, parseQuoteEvent,
  createTokenDeleteTemplate, createTokenDeleteEvent,
  getWalletFilters, getHistoryFilter, getProofsBalance,
  WALLET_KIND, TOKEN_KIND, HISTORY_KIND, QUOTE_KIND,
} from './nip60.js'
export type {
  CashuProof, CashuToken, CashuWallet, CashuHistory, CashuHistoryRef, CashuQuote,
} from './nip60.js'

// NIP-75
export {
  createZapGoalTemplate, createZapGoalEvent, parseZapGoal,
  isZapGoalOpen, calculateZapGoalProgress, buildGoalTag,
} from './nip75.js'
export type { ZapGoal, ZapBeneficiary } from './nip75.js'

// NIP-98
export { createHttpAuthEventTemplate, createHttpAuthEvent, getAuthorizationHeader, verifyHttpAuthEvent } from './nip98.js'
export type { HttpAuthOptions } from './nip98.js'

// NIP-02
export { createFollowListEventTemplate, createFollowListEvent, parseFollowList, isFollowing, getFollowedPubkeys } from './nip02.js'
export type { ContactEntry } from './nip02.js'

// NIP-13
export { countLeadingZeroBits, getPowDifficulty, getTargetDifficulty, verifyPow, minePow } from './nip13.js'

// NIP-18
export { createRepostEventTemplate, createRepostEvent, parseRepost } from './nip18.js'
export type { RepostTarget } from './nip18.js'

// NIP-28
export { createChannelEventTemplate, createChannelEvent, createChannelMetadataEventTemplate, createChannelMetadataEvent, createChannelMessageEventTemplate, createChannelMessageEvent, createChannelHideMessageEventTemplate, createChannelMuteUserEventTemplate, parseChannelMetadata, parseChannelMessage } from './nip28.js'
export type { ChannelMetadata } from './nip28.js'

// NIP-36
export { addContentWarning, getContentWarning, hasContentWarning } from './nip36.js'

// NIP-40
export { addExpiration, getExpiration, isExpired } from './nip40.js'

// NIP-48
export { addProxyTag, getProxyTags, isProxied, getProxyByProtocol } from './nip48.js'
export type { ProxyProtocol, ProxyTag } from './nip48.js'

// NIP-50
export { buildSearchFilter, parseSearchQuery, buildSearchQuery } from './nip50.js'
export type { SearchFilter } from './nip50.js'

// NIP-56
export { createReportEventTemplate, createReportEvent, parseReport } from './nip56.js'
export type { ReportType, ReportTarget } from './nip56.js'

// Networking
export { Relay, Subscription } from './relay.js'
export type { SubscriptionParams } from './relay.js'
export { RelayPool } from './pool.js'
export type { SubCloser, PoolSubscribeParams } from './pool.js'

// Blossom Media (NIP-B7 / BUD)
export * as blossom from './blossom.js'
export {
  createServerListEventTemplate, createServerListEvent, parseServerList,
  createAuthEventTemplate as createBlossomAuthTemplate, createAuthEvent as createBlossomAuthEvent,
  getAuthorizationHeader as getBlossomAuthHeader,
  uploadBlob, getBlob, checkBlob, deleteBlob, listBlobs, mirrorBlob, getBlobHash,
  BlossomError, SERVER_LIST_KIND, AUTH_KIND,
} from './blossom.js'
export type { BlobDescriptor, BlossomAuthAction } from './blossom.js'

// BOLT-11 Invoice Decoding
export * as bolt11 from './bolt11.js'
export { decode as decodeBolt11, Bolt11Error } from './bolt11.js'
export type { Bolt11Invoice, Bolt11Network, Bolt11RouteHint, Bolt11FallbackAddress } from './bolt11.js'

// Utils
export { normalizeURL, utf8Encoder, utf8Decoder, bytesToHex, hexToBytes, randomBytes } from './utils.js'
