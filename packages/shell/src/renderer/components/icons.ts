/** One line or shape of an icon, on a 24 by 24 grid: drawn as a line unless filled. */
export interface IconPath {
  d: string
  fill?: boolean
}

/** A circle as a path, for icons drawn from paths only. */
function circle(x: number, y: number, r: number): string {
  return `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`
}

/** The app's icons: simple line drawings, drawn in the current text color. */
export const ICONS = {
  subscriptions: [
    { d: 'M6 5h12a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z' },
    { d: 'M10 9l5 3-5 3z', fill: true }
  ],
  favorites: [
    { d: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z' }
  ],
  history: [
    { d: circle(12, 12, 9) },
    { d: 'M12 7v5l3 2' }
  ],
  channels: [
    { d: circle(5, 6, 1.5), fill: true },
    { d: circle(5, 12, 1.5), fill: true },
    { d: circle(5, 18, 1.5), fill: true },
    { d: 'M9 6h11M9 12h11M9 18h11' }
  ],
  settings: [
    { d: 'M4 7h9M17 7h3M4 17h3M11 17h9' },
    { d: circle(15, 7, 2) },
    { d: circle(9, 17, 2) }
  ],
  about: [
    { d: circle(12, 12, 9) },
    { d: 'M12 11v6' },
    { d: circle(12, 7.5, 1), fill: true }
  ],
  play: [
    { d: 'M8 5v14l11-7z', fill: true }
  ],
  pause: [
    { d: 'M7 5h4v14H7zM13 5h4v14h-4z', fill: true }
  ],
  volume: [
    { d: 'M4 9h4l5-4v14l-5-4H4z', fill: true },
    { d: 'M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11' }
  ],
  mute: [
    { d: 'M4 9h4l5-4v14l-5-4H4z', fill: true },
    { d: 'M16 9l5 6M21 9l-5 6' }
  ],
  subtitles: [
    { d: 'M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z' },
    { d: 'M10.5 10.2a2.5 2.5 0 1 0 0 3.6M17 10.2a2.5 2.5 0 1 0 0 3.6' }
  ],
  fullscreen: [
    { d: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5' }
  ],
  exitFullscreen: [
    { d: 'M9 4v5H4M15 4v5h5M20 15h-5v5M4 15h5v5' }
  ],
  search: [
    { d: circle(10.5, 10.5, 6.5) },
    { d: 'M15.5 15.5L20 20' }
  ],
  back: [
    { d: 'M19 12H5M11 6l-6 6 6 6' }
  ],
  forward: [
    { d: 'M5 12h14M13 6l6 6-6 6' }
  ],
  pip: [
    { d: 'M4.5 4.5h15a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2z' },
    { d: 'M13 11h6a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z', fill: true }
  ]
} satisfies Record<string, IconPath[]>

export type IconName = keyof typeof ICONS

export function isIconName(value: unknown): value is IconName {
  return typeof value === 'string' && Object.hasOwn(ICONS, value)
}
