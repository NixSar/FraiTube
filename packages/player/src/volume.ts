/** Highest volume, in percent of the video's own loudness. */
export const MAX_VOLUME = 200

/** Turns a volume in percent into a gain factor, clamped to 0 to MAX_VOLUME percent. */
export function volumeToGain(percent: number): number {
  if (!Number.isFinite(percent)) {
    return 1
  }
  return Math.min(Math.max(percent, 0), MAX_VOLUME) / 100
}

export interface VolumeControl {
  setVolume(percent: number): void
  setMuted(muted: boolean): void
}

const controls = new WeakMap<HTMLMediaElement, VolumeControl>()

/**
 * Routes the element's sound through a gain stage, so volume can go above 100%.
 * A media element can feed only one audio graph, so each element gets one control for its lifetime.
 */
export function getVolumeControl(media: HTMLMediaElement): VolumeControl {
  const existing = controls.get(media)
  if (existing) {
    return existing
  }

  const context = new AudioContext()
  const gain = context.createGain()
  context.createMediaElementSource(media).connect(gain).connect(context.destination)
  media.volume = 1

  let volume = 100
  let muted = false
  const apply = (): void => {
    gain.gain.value = muted ? 0 : volumeToGain(volume)
  }

  // The audio context may start suspended until playback begins.
  media.addEventListener('play', () => {
    void context.resume()
  })

  const control: VolumeControl = {
    setVolume(percent) {
      volume = percent
      apply()
    },
    setMuted(value) {
      muted = value
      apply()
    }
  }
  controls.set(media, control)
  return control
}
