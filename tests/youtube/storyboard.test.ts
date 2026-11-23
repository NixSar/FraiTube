import { describe, expect, it } from 'vitest'
import { readStoryboard } from '../../packages/youtube/src/storyboard'

const template = 'https://i.ytimg.com/sb/l8qxFcaLSM4/storyboard3_L$L/$N.jpg?sqp=abc'
const spec = [
  template,
  '48#27#100#10#10#0#default#rs$AAA',
  '80#45#100#10#10#2000#M$M#rs$BBB',
  '160#90#100#5#5#2000#M$M#rs$CCC'
].join('|')

describe('readStoryboard', () => {
  it('uses the level with the largest pictures and signs its URL', () => {
    expect(readStoryboard(spec, 200)).toEqual({
      url: 'https://i.ytimg.com/sb/l8qxFcaLSM4/storyboard3_L2/M$M.jpg?sqp=abc&sigh=rs%24CCC',
      width: 160,
      height: 90,
      count: 100,
      columns: 5,
      rows: 5,
      intervalMs: 2000
    })
  })

  it('spreads the pictures over the video when the level gives no interval', () => {
    expect(readStoryboard(`${template}|48#27#100#10#10#0#default#rs$AAA`, 200)?.intervalMs).toBe(2000)
  })

  it('refuses specs from other hosts or of another shape', () => {
    expect(readStoryboard(spec.replace('i.ytimg.com', 'example.com'), 200)).toBeUndefined()
    expect(readStoryboard(template, 200)).toBeUndefined()
    expect(readStoryboard(`${template}|160#90#x#5#5#2000#M$M#rs$CCC`, 200)).toBeUndefined()
    expect(readStoryboard(undefined, 200)).toBeUndefined()
  })
})
