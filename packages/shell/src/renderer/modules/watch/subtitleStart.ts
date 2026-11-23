import { pickCaptionTrack, type CaptionTrackInfo } from '@fraitube/player'

/**
 * The subtitle track a video starts with. A video moved to or from the PiP window brings its own:
 * empty keeps subtitles off, and a track the video has turns on. Otherwise, or for a track the
 * video does not have, the settings decide.
 */
export function startingSubtitleTrack<T extends CaptionTrackInfo & { id: string }>(
  passed: string | undefined,
  tracks: readonly T[],
  startOn: boolean,
  language: string
): string | undefined {
  if (passed === '') {
    return undefined
  }
  if (passed !== undefined && tracks.some((track) => track.id === passed)) {
    return passed
  }
  return startOn ? pickCaptionTrack(tracks, language)?.id : undefined
}
