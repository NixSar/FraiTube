import type { SettingsSection } from '@fraitube/app-api/settings'
import { HistorySettingKey } from './history'

export const PlayerSettingKey = {
  defaultQuality: 'player.defaultQuality',
  volume: 'player.volume',
  pipOnLeave: 'player.pipOnLeave',
  subtitleSize: 'subtitles.size',
  subtitleLanguage: 'subtitles.language',
  subtitlesOnStart: 'subtitles.startOn',
  subtitlePosition: 'subtitles.position',
  subtitleFont: 'subtitles.font',
  subtitleColor: 'subtitles.color',
  subtitleBackground: 'subtitles.background',
  subtitleBackgroundOpacity: 'subtitles.backgroundOpacity'
} as const

/** How subtitles look until changed in Settings. */
export const SUBTITLE_DEFAULTS = {
  position: 3,
  font: 'sans',
  size: 5,
  color: '#ffffff',
  background: '#000000',
  backgroundOpacity: 75
} as const

/** The qualities YouTube offers, as the number in a quality name such as 1080p. */
export const QUALITY_HEIGHTS = [4320, 2160, 1440, 1080, 720, 480, 360, 240, 144]
export const DEFAULT_QUALITY_HEIGHT = 1080

/** The quality a video starts at: the highest it has, one of YouTube's qualities, or auto, which fits the player. */
export type DefaultQuality = 'max' | 'auto' | number

/** Settings owned by the watch page's player, with the history's resume setting among them. */
export const playerSettings: SettingsSection = {
  title: 'Player',
  settings: [
    {
      key: PlayerSettingKey.defaultQuality,
      label: 'Default quality',
      group: 'Playback',
      type: 'choice',
      options: [
        { value: 'max', label: 'Max' },
        ...QUALITY_HEIGHTS.map((height) => ({ value: String(height), label: `${height}p` })),
        { value: 'auto', label: 'Auto, fits the player' }
      ],
      default: String(DEFAULT_QUALITY_HEIGHT)
    },
    {
      key: PlayerSettingKey.volume,
      label: 'Volume',
      group: 'Playback',
      type: 'number',
      min: 0,
      max: 200,
      default: 100,
      local: true,
      hidden: true
    },
    {
      key: HistorySettingKey.resume,
      label: 'Resume videos where they stopped',
      group: 'Playback',
      type: 'boolean',
      default: true
    },
    {
      key: PlayerSettingKey.pipOnLeave,
      label: 'Move the video to PiP when leaving its page',
      group: 'Playback',
      type: 'boolean',
      default: true
    },
    {
      key: PlayerSettingKey.subtitlesOnStart,
      label: 'Show subtitles when a video starts',
      group: 'Subtitles',
      type: 'boolean',
      default: false
    },
    {
      key: PlayerSettingKey.subtitleLanguage,
      label: 'Default subtitle language, for example en or de',
      group: 'Subtitles',
      type: 'text',
      maxLength: 20,
      default: 'en'
    },
    {
      key: PlayerSettingKey.subtitleFont,
      label: 'Subtitle font',
      group: 'Subtitles',
      type: 'choice',
      options: [
        { value: 'sans', label: 'Sans-serif' },
        { value: 'serif', label: 'Serif' },
        { value: 'monospace', label: 'Monospace' }
      ],
      default: SUBTITLE_DEFAULTS.font
    },
    {
      key: PlayerSettingKey.subtitleSize,
      label: 'Subtitle size, in percent of the picture height',
      group: 'Subtitles',
      type: 'number',
      min: 2,
      max: 15,
      default: SUBTITLE_DEFAULTS.size
    },
    {
      key: PlayerSettingKey.subtitleColor,
      label: 'Subtitle text color',
      group: 'Subtitles',
      type: 'color',
      default: SUBTITLE_DEFAULTS.color
    },
    {
      key: PlayerSettingKey.subtitleBackground,
      label: 'Subtitle background color',
      group: 'Subtitles',
      type: 'color',
      default: SUBTITLE_DEFAULTS.background
    },
    {
      key: PlayerSettingKey.subtitleBackgroundOpacity,
      label: 'Subtitle background opacity, in percent, 0 for no background',
      group: 'Subtitles',
      type: 'number',
      min: 0,
      max: 100,
      default: SUBTITLE_DEFAULTS.backgroundOpacity
    },
    {
      key: PlayerSettingKey.subtitlePosition,
      label: 'Subtitle position, in percent of the picture height above its bottom',
      group: 'Subtitles',
      type: 'number',
      min: 0,
      max: 90,
      default: SUBTITLE_DEFAULTS.position
    }
  ]
}

/** The default quality a saved setting value names; 1080p for a value that is not one of the choices. */
export function readDefaultQuality(value: unknown): DefaultQuality {
  if (value === 'max' || value === 'auto') {
    return value
  }
  const height = Number(value)
  return QUALITY_HEIGHTS.includes(height) ? height : DEFAULT_QUALITY_HEIGHT
}

/** Of the given qualities, the one nearest the wanted one; the lower one when two are equally near. */
export function nearestHeight(wanted: number, heights: readonly number[]): number | undefined {
  let best: number | undefined
  for (const height of heights) {
    const distance = Math.abs(height - wanted)
    const bestDistance = best === undefined ? Infinity : Math.abs(best - wanted)
    if (distance < bestDistance || (distance === bestDistance && best !== undefined && height < best)) {
      best = height
    }
  }
  return best
}

/**
 * The quality a video starts at, from its qualities: the highest for Max, the nearest one for a set
 * quality, and auto for Auto or a video with no quality listed.
 */
export function startingQuality(quality: DefaultQuality, heights: readonly number[]): 'auto' | number {
  if (quality === 'auto' || heights.length === 0) {
    return 'auto'
  }
  if (quality === 'max') {
    return Math.max(...heights)
  }
  return nearestHeight(quality, heights) ?? 'auto'
}
