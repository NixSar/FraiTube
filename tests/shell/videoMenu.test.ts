import { describe, expect, it } from 'vitest'
import { playInNewWindowItem, VIDEO_MENU_ITEM_HEIGHT, VIDEO_MENU_WIDTH, videoMenuPosition } from '../../packages/shell/src/renderer/components/videoMenu'

const windowSize = { width: 1200, height: 800 }

describe('playInNewWindowItem', () => {
  it('opens the video\'s watch page in a new window', () => {
    const opened: string[] = []
    const item = playInNewWindowItem('l8qxFcaLSM4', (path) => opened.push(path))
    expect(item.label).toBe('Play in new window')
    item.run()
    expect(opened).toEqual(['/watch/l8qxFcaLSM4'])
  })
})

describe('videoMenuPosition', () => {
  it('shows the menu at the point', () => {
    expect(videoMenuPosition({ x: 300, y: 200 }, 2, windowSize)).toEqual({ left: 300, top: 200 })
  })

  it('moves the menu left and up to stay inside the window', () => {
    const position = videoMenuPosition({ x: 1190, y: 790 }, 2, windowSize)
    expect(position.left).toBe(1200 - VIDEO_MENU_WIDTH)
    expect(position.top).toBeLessThanOrEqual(800 - 2 * VIDEO_MENU_ITEM_HEIGHT)
  })

  it('never places the menu off the top or left edge', () => {
    expect(videoMenuPosition({ x: -20, y: -5 }, 1, windowSize)).toEqual({ left: 0, top: 0 })
    expect(videoMenuPosition({ x: 100, y: 100 }, 1, { width: 100, height: 20 })).toEqual({ left: 0, top: 0 })
  })
})
