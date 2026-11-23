import { randomUUID } from 'node:crypto'
import { runInNewContext } from 'node:vm'
import { Constants, Platform, Player, Session, Utils } from 'youtubei.js'
import { loadCaptions, readCaptionTracks, type CaptionSource, type FetchCaptionBody, type RawCaptionTrack } from './captions'
import { readAbout } from './about'
import { readChannelIcon } from './channelIcon'
import { readChapters } from './chapters'
import { createInnertubeLoader } from './innertube'
import { keptCommentPages, readCommentPage, readCommentsSection, type CommentPages, type CommentsSection, type RawCommentPage } from './comments'
import { readStoryboard } from './storyboard'
import { isVideoId } from './ids'
import type { YtConfig } from './page'
import { createPageLoader } from './pageLoader'
import { playerRequestBody } from './playerRequest'
import { createSearcher } from './search'
import type {
  CaptionCue,
  ClientInfo,
  CommentPage,
  CommentSort,
  CommentsRequest,
  MintPoToken,
  PoTokenRequest,
  RawFormat,
  SearchPage,
  SearchRequest,
  StreamingReload,
  VideoDetails,
  VideoPlayback
} from './types'

export type * from './types'

type FetchFunction = typeof fetch
type Context = Session['context']

export interface YoutubeOptions {
  mintPoToken: MintPoToken
  userAgent: string
  fetch?: FetchFunction
}

export interface YoutubeClient {
  /**
   * Loads a video. `onDetails` gets its details as soon as its watch page is read, before the video
   * can play, and from then on its comments load; when the watch page gives no details, it is not called.
   */
  getPlayback(videoId: string, onDetails?: (details: VideoDetails) => void): Promise<VideoPlayback>
  /** Mints a fresh token for a video loaded earlier with getPlayback. */
  refreshPoToken(videoId: string): Promise<string>
  /** Searches YouTube, or loads the next page of an earlier search. */
  search(request: SearchRequest): Promise<SearchPage>
  /** Loads one caption track of a video loaded earlier with getPlayback. */
  getCaptions(videoId: string, trackId: string): Promise<CaptionCue[]>
  /** Loads comments, more comments or replies of a video loaded earlier with getPlayback, or whose details it gave. */
  getComments(request: CommentsRequest): Promise<CommentPage>
  /** The icon of a channel, or an empty string when YouTube gives none. */
  getChannelIcon(channelId: string): Promise<string>
  /** Fresh streaming data for a video loaded earlier with getPlayback, when its SABR server asks for it. */
  reloadStreaming(videoId: string, reloadToken?: string): Promise<StreamingReload>
}

interface LoadedVideo {
  /** What the video's token was minted from, so a rejected token can be replaced. */
  tokenRequest: PoTokenRequest
  captions: CaptionSource[]
  session: Session
  player: Player
  poToken: string
  /** The playback nonce, kept for the whole playback as on youtube.com. */
  cpn: string
}

/** A video's comments, ready once its watch page is read. */
interface VideoComments extends CommentPages {
  session: Session
  comments: CommentsSection
}

const REMEMBERED_VIDEOS = 20
/** Comment continuation tokens kept per video, enough for many pages and their replies. */
const REMEMBERED_COMMENT_TOKENS = 2000

interface RawPlayerResponse {
  playabilityStatus?: { status?: string; reason?: string }
  videoDetails?: {
    title?: string
    author?: string
    channelId?: string
    lengthSeconds?: string
    isLive?: boolean
  }
  streamingData?: {
    serverAbrStreamingUrl?: string
    adaptiveFormats?: RawFormat[]
  }
  captions?: {
    playerCaptionsTracklistRenderer?: { captionTracks?: RawCaptionTrack[] }
  }
  storyboards?: {
    playerStoryboardSpecRenderer?: { spec?: string }
  }
  playerConfig?: {
    mediaCommonConfig?: {
      mediaUstreamerRequestConfig?: { videoPlaybackUstreamerConfig?: string }
    }
  }
}

const DECIPHER_TIMEOUT_MS = 5000

// The player script's n and signature functions run in a separate V8 context with no Node access.
Platform.shim.eval = (data) => {
  const sandbox = { URL, URLSearchParams }
  return runInNewContext(`(function () {\n${data.output}\n})()`, sandbox, { timeout: DECIPHER_TIMEOUT_MS }) as Record<string, unknown>
}

function buildSession(ytConfig: YtConfig, fetchFunction: FetchFunction): Session {
  const context = structuredClone(ytConfig['INNERTUBE_CONTEXT']) as Context & { clickTracking?: unknown }
  delete context.clickTracking

  const client = context.client as Context['client'] & Record<string, unknown>
  client['timeZone'] ??= Intl.DateTimeFormat().resolvedOptions().timeZone
  client['utcOffsetMinutes'] ??= -new Date().getTimezoneOffset()
  client['screenDensityFloat'] ??= 1
  client['screenHeightPoints'] ??= 1080
  client['screenPixelDensity'] ??= 1
  client['screenWidthPoints'] ??= 1920

  context.user = { enableSafetyMode: false, lockedSafetyMode: false } as Context['user']

  return new Session(
    context,
    String(ytConfig['INNERTUBE_API_KEY']),
    String(ytConfig['INNERTUBE_API_VERSION']),
    0,
    undefined,
    undefined,
    undefined,
    fetchFunction
  )
}

function readClientInfo(context: Context): ClientInfo {
  const { clientName, clientVersion, osName, osVersion } = context.client
  const id = (Constants.CLIENT_NAME_IDS as Record<string, string>)[clientName]
  if (!id) {
    throw new Error(`Unknown client name ${clientName}`)
  }
  return { clientName: Number(id), clientVersion, osName, osVersion }
}

function isPlayerResponse(value: unknown): value is RawPlayerResponse {
  return typeof value === 'object' && value !== null && 'playabilityStatus' in value
}

/** What the watch page shows about a video, from its player response and watch data. */
function readDetails(videoId: string, response: RawPlayerResponse, watchData: unknown): VideoDetails {
  const details = response.videoDetails ?? {}
  const durationSeconds = Number(details.lengthSeconds ?? 0)
  const isLive = details.isLive ?? false
  return {
    videoId,
    title: details.title ?? '',
    author: details.author ?? '',
    channelId: details.channelId ?? '',
    durationSeconds,
    isLive,
    chapters: isLive ? [] : readChapters(watchData, durationSeconds),
    storyboard: isLive ? undefined : readStoryboard(response.storyboards?.playerStoryboardSpecRenderer?.spec, durationSeconds),
    about: readAbout(watchData, videoId)
  }
}

export function createYoutube(options: YoutubeOptions): YoutubeClient {
  const fetchFunction: FetchFunction = options.fetch ?? ((input, init) => fetch(input, init))
  const players = new Map<string, Promise<Player>>()
  const loaded = new Map<string, LoadedVideo>()
  const commentStates = new Map<string, VideoComments>()

  const pages = createPageLoader(async (url) => {
    const response = await fetchFunction(url, { headers: { 'accept-language': 'en-US', 'user-agent': options.userAgent } })
    if (!response.ok) {
      throw new Error(`Page request failed with status ${response.status}`)
    }
    return response.text()
  })

  function remember<T>(videos: Map<string, T>, videoId: string, entry: T): void {
    videos.delete(videoId)
    videos.set(videoId, entry)
    for (const oldest of videos.keys()) {
      if (videos.size <= REMEMBERED_VIDEOS) break
      videos.delete(oldest)
    }
  }

  /** Readies a video's comments; the pages it already handed out stay, so shown comments can still load more. */
  function rememberComments(videoId: string, session: Session, watchData: unknown): void {
    remember(commentStates, videoId, {
      session,
      comments: readCommentsSection(watchData),
      ...keptCommentPages(commentStates.get(videoId))
    })
  }

  function getPlayer(playerId: string | undefined): Promise<Player> {
    const key = playerId ?? ''
    let player = players.get(key)
    if (!player) {
      player = Player.create(undefined, fetchFunction, undefined, playerId)
      player.catch(() => players.delete(key))
      players.set(key, player)
    }
    return player
  }

  async function requestPlayer(video: Pick<LoadedVideo, 'session' | 'player' | 'poToken'>, videoId: string, reloadToken?: string): Promise<RawPlayerResponse> {
    const result = await video.session.actions.execute(
      '/player',
      playerRequestBody(videoId, video.player.signature_timestamp, video.poToken, reloadToken)
    )
    return result.data as RawPlayerResponse
  }

  /** The watch data of a video, when the watch page could not provide it. Undefined when the request fails. */
  async function requestNext(session: Session, videoId: string): Promise<unknown> {
    try {
      return (await session.actions.execute('/next', { videoId })).data
    } catch {
      return undefined
    }
  }

  async function streamingUrl(video: Pick<LoadedVideo, 'player' | 'cpn'>, url: string): Promise<string> {
    const deciphered = new URL(await video.player.decipher(url))
    deciphered.searchParams.set('alr', 'yes')
    deciphered.searchParams.set('cpn', video.cpn)
    return deciphered.toString()
  }

  async function getPlayback(videoId: string, onDetails?: (details: VideoDetails) => void): Promise<VideoPlayback> {
    if (!isVideoId(videoId)) {
      throw new Error('Invalid video ID')
    }

    const page = await pages.load(videoId)
    const session = buildSession(page.ytConfig, fetchFunction)
    const pageResponse = isPlayerResponse(page.playerResponse) ? page.playerResponse : undefined
    // The watch page names the video and holds its watch data, so they show while the token is minted.
    if (page.initialData !== undefined) {
      rememberComments(videoId, session, page.initialData)
      if (pageResponse?.videoDetails) {
        onDetails?.(readDetails(videoId, pageResponse, page.initialData))
      }
    }
    const player = await getPlayer(page.playerId)

    const tokenRequest: PoTokenRequest = {
      videoId,
      context: session.context,
      initialAttestationData: page.initialAttestationData,
      ytConfig: page.ytConfig
    }
    const poToken = await options.mintPoToken(tokenRequest)
    player.po_token = poToken

    let response = pageResponse
    if (!response?.streamingData?.serverAbrStreamingUrl) {
      response = await requestPlayer({ session, player, poToken }, videoId)
    }

    const captions = readCaptionTracks(
      response.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [],
      session.context.client.clientName
    )
    let watchData = page.initialData
    if (watchData === undefined) {
      watchData = await requestNext(session, videoId)
      rememberComments(videoId, session, watchData)
    }
    const video: LoadedVideo = {
      tokenRequest,
      captions,
      session,
      player,
      poToken,
      cpn: Utils.generateRandomString(16)
    }
    remember(loaded, videoId, video)

    const playback: VideoPlayback = {
      ...readDetails(videoId, response, watchData),
      status: response.playabilityStatus?.status ?? 'ERROR',
      reason: response.playabilityStatus?.reason,
      captions: captions.map(({ id, label, language, auto }) => ({ id, label, language, auto }))
    }

    const abrUrl = response.streamingData?.serverAbrStreamingUrl
    const ustreamerConfig = response.playerConfig?.mediaCommonConfig?.mediaUstreamerRequestConfig?.videoPlaybackUstreamerConfig
    if (playback.status === 'OK' && abrUrl && ustreamerConfig) {
      playback.sabr = {
        serverAbrStreamingUrl: await streamingUrl(video, abrUrl),
        ustreamerConfig,
        clientInfo: readClientInfo(session.context),
        poToken,
        formats: response.streamingData?.adaptiveFormats ?? []
      }
    }

    return playback
  }

  function loadedVideo(videoId: string): LoadedVideo {
    const video = loaded.get(videoId)
    if (!video) {
      throw new Error('This video was not loaded')
    }
    return video
  }

  async function refreshPoToken(videoId: string): Promise<string> {
    const video = loadedVideo(videoId)
    video.poToken = await options.mintPoToken(video.tokenRequest)
    video.player.po_token = video.poToken
    return video.poToken
  }

  async function reloadStreaming(videoId: string, reloadToken?: string): Promise<StreamingReload> {
    const video = loadedVideo(videoId)
    const response = await requestPlayer(video, videoId, reloadToken)
    const abrUrl = response.streamingData?.serverAbrStreamingUrl
    const ustreamerConfig = response.playerConfig?.mediaCommonConfig?.mediaUstreamerRequestConfig?.videoPlaybackUstreamerConfig
    if (!abrUrl || !ustreamerConfig) {
      throw new Error(response.playabilityStatus?.reason ?? 'YouTube sent no streaming data')
    }
    return { serverAbrStreamingUrl: await streamingUrl(video, abrUrl), ustreamerConfig }
  }

  async function getCaptions(videoId: string, trackId: string): Promise<CaptionCue[]> {
    const video = loaded.get(videoId)
    const track = video?.captions.find((caption) => caption.id === trackId)
    if (!video || !track) {
      throw new Error('This subtitle track is not available')
    }
    const fetchBody: FetchCaptionBody = async (url) => {
      const response = await fetchFunction(url, { headers: { 'user-agent': options.userAgent } })
      return { status: response.status, body: response.ok ? await response.text() : '' }
    }
    return loadCaptions(fetchBody, track.url, video.poToken, () => refreshPoToken(videoId))
  }

  function videoComments(videoId: string): VideoComments {
    const video = commentStates.get(videoId)
    if (!video) {
      throw new Error('This video was not loaded')
    }
    return video
  }

  /** Gives a page an ID in place of YouTube's token, so tokens never leave this process. */
  function commentHandle(video: VideoComments, token: string | undefined): string | undefined {
    if (!token) return undefined
    const handle = randomUUID()
    video.commentTokens.set(handle, token)
    for (const oldest of video.commentTokens.keys()) {
      if (video.commentTokens.size <= REMEMBERED_COMMENT_TOKENS) break
      video.commentTokens.delete(oldest)
    }
    return handle
  }

  async function requestCommentPage(video: VideoComments, videoId: string, token: string): Promise<RawCommentPage> {
    const result = await video.session.actions.execute('/next', { continuation: token })
    const page = readCommentPage(result.data, videoId)
    video.commentSortTokens.top ??= page.sortTokens.top
    video.commentSortTokens.newest ??= page.sortTokens.newest
    return page
  }

  /** The first page in the asked order; the sort menu that names the orders comes with the first page. */
  async function firstCommentPage(video: VideoComments, videoId: string, sort: CommentSort, sectionToken: string): Promise<RawCommentPage> {
    const known = video.commentSortTokens[sort]
    if (known) {
      return requestCommentPage(video, videoId, known)
    }
    const top = await requestCommentPage(video, videoId, sectionToken)
    const newest = video.commentSortTokens.newest
    return sort === 'newest' && newest ? requestCommentPage(video, videoId, newest) : top
  }

  async function getComments(request: CommentsRequest): Promise<CommentPage> {
    const video = videoComments(request.videoId)
    let page: RawCommentPage
    if (request.continuation) {
      const token = video.commentTokens.get(request.continuation)
      if (!token) {
        throw new Error('These comments have expired. Open the video again.')
      }
      page = await requestCommentPage(video, request.videoId, token)
    } else if (video.comments.token) {
      page = await firstCommentPage(video, request.videoId, request.sort, video.comments.token)
    } else {
      return { comments: [], countText: '', turnedOffText: video.comments.turnedOffText }
    }
    return {
      comments: page.comments.map((comment) => ({ ...comment, replies: commentHandle(video, comment.replies) })),
      continuation: commentHandle(video, page.continuation),
      countText: page.countText,
      turnedOffText: ''
    }
  }

  const getInnertube = createInnertubeLoader(fetchFunction, options.userAgent)
  const searcher = createSearcher(getInnertube)

  async function getChannelIcon(channelId: string): Promise<string> {
    const innertube = await getInnertube()
    const result = await innertube.actions.execute('/browse', { browseId: channelId })
    return readChannelIcon(result.data)
  }

  return {
    getPlayback,
    refreshPoToken: (videoId) => refreshPoToken(videoId),
    getCaptions,
    getComments,
    getChannelIcon,
    reloadStreaming,
    search: (request) => searcher.search(request)
  }
}
