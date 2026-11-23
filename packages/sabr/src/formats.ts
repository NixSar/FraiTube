import type { SabrFormat } from 'googlevideo/shared-types'

export interface VideoLimits {
  /** Highest quality to pick, as the number in a quality name such as 1080p. */
  maxHeight: number
  /** Whether the playback engine can play this MIME type, for example MediaSource.isTypeSupported. */
  isSupported: (mimeType: string) => boolean
}

export interface Quality {
  /** The number in the quality name, for example 1080 for 1080p. */
  height: number
  label: string
}

// Lower is preferred. VP9 decodes in hardware almost everywhere; AV1 often does not.
const VIDEO_CODEC_RANK: [string, number][] = [['vp9', 0], ['vp09', 0], ['avc1', 1], ['av01', 2]]
const AUDIO_CODEC_RANK: [string, number][] = [['opus', 0], ['mp4a', 1]]

function codecRank(mimeType: string | undefined, ranks: [string, number][]): number {
  const codecs = /codecs="([^"]+)"/.exec(mimeType ?? '')?.[1] ?? ''
  return ranks.find(([prefix]) => codecs.startsWith(prefix))?.[1] ?? ranks.length
}

function isPlayable(format: SabrFormat, isSupported: (mimeType: string) => boolean): boolean {
  return format.mimeType !== undefined && isSupported(format.mimeType)
}

/**
 * The quality number of a format. It comes from the quality label, so a vertical 1080x1920
 * video counts as 1080p, as on YouTube.
 */
export function qualityHeight(format: SabrFormat): number {
  const fromLabel = Number.parseInt(format.qualityLabel ?? '', 10)
  return Number.isFinite(fromLabel) && fromLabel > 0 ? fromLabel : (format.height ?? 0)
}

function playableVideo(formats: SabrFormat[], isSupported: (mimeType: string) => boolean): SabrFormat[] {
  return formats.filter((f) => f.hasVideo && !f.hasAudio && !f.isHdr && isPlayable(f, isSupported))
}

/** Picks the best SDR video-only format within the quality limit, or the lowest one when none fits. */
export function pickVideoFormat(formats: SabrFormat[], limits: VideoLimits): SabrFormat | undefined {
  const sorted = playableVideo(formats, limits.isSupported).sort((a, b) =>
    qualityHeight(b) - qualityHeight(a) ||
    (b.fps ?? 0) - (a.fps ?? 0) ||
    codecRank(a.mimeType, VIDEO_CODEC_RANK) - codecRank(b.mimeType, VIDEO_CODEC_RANK) ||
    b.bitrate - a.bitrate
  )
  return sorted.find((f) => qualityHeight(f) <= limits.maxHeight) ?? sorted.at(-1)
}

/** The qualities the engine can play, highest first, each named after its best format, for example 1080p60. */
export function listQualities(formats: SabrFormat[], isSupported: (mimeType: string) => boolean): Quality[] {
  const heights = [...new Set(playableVideo(formats, isSupported).map(qualityHeight))].sort((a, b) => b - a)
  return heights.map((height) => {
    const best = pickVideoFormat(formats, { maxHeight: height, isSupported })
    const fps = best?.fps ?? 0
    return { height, label: fps > 30 ? `${height}p${fps}` : `${height}p` }
  })
}

/** Picks the best audio-only format in the original language, without dynamic range compression. */
export function pickAudioFormat(formats: SabrFormat[], limits: Pick<VideoLimits, 'isSupported'>): SabrFormat | undefined {
  const audio = formats.filter((f) => f.hasAudio && !f.hasVideo && isPlayable(f, limits.isSupported))
  const original = audio.filter((f) => f.isOriginal || f.audioTrackId === undefined)
  return (original.length > 0 ? original : audio)
    .sort((a, b) =>
      Number(a.isDrc ?? false) - Number(b.isDrc ?? false) ||
      Number(a.isVb ?? false) - Number(b.isVb ?? false) ||
      codecRank(a.mimeType, AUDIO_CODEC_RANK) - codecRank(b.mimeType, AUDIO_CODEC_RANK) ||
      b.bitrate - a.bitrate
    )[0]
}
