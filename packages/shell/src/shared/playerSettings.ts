import type { SettingsSection } from '@fraitube/app-api/settings'

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

/** Heights the highest automatic quality can be set to. */
export const QUALITY_HEIGHTS = [2160, 1440, 1080, 720, 480, 360, 240, 144]

/** Settings owned by the watch page's player. */
export const playerSettings: SettingsSection = {
  title: 'Player',
  settings: [
    {
      key: PlayerSettingKey.defaultQuality,
      label: 'Highest automatic quality',
      group: 'Playback',
      type: 'choice',
      options: QUALITY_HEIGHTS.map((height) => ({ value: String(height), label: `${height}p` })),
      default: '1080'
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
      key: PlayerSettingKey.subtitlePosition,
      label: 'Subtitle position, in percent of the picture height above its bottom',
      group: 'Subtitles',
      type: 'number',
      min: 0,
      max: 90,
      default: SUBTITLE_DEFAULTS.position
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
    }
  ]
}
