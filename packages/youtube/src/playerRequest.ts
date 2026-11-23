/** The body of an Innertube /player request, as youtube.com sends it. */
export function playerRequestBody(
  videoId: string,
  signatureTimestamp: number | undefined,
  poToken: string,
  reloadToken?: string
): Record<string, unknown> {
  return {
    videoId,
    racyCheckOk: true,
    contentCheckOk: true,
    playbackContext: {
      contentPlaybackContext: { vis: 0, splay: false, lactMilliseconds: '-1', signatureTimestamp },
      // Sent when the SABR server asks for fresh streaming data in the middle of playback.
      ...(reloadToken ? { reloadPlaybackContext: { reloadPlaybackParams: { token: reloadToken } } } : {})
    },
    serviceIntegrityDimensions: { poToken }
  }
}
