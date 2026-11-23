import { describe, expect, it } from 'vitest'
import { confirmsClear } from '../../packages/shell/src/renderer/components/confirmClear'
import { historyClearWarning } from '../../packages/shell/src/renderer/modules/history/clearHistory'
import { subscriptionsClearWarning } from '../../packages/shell/src/renderer/modules/subscriptions/clearSubscriptions'

describe('confirmsClear', () => {
  it('allows clearing only once CLEAR is typed in capitals', () => {
    expect(confirmsClear('CLEAR')).toBe(true)
    expect(confirmsClear('  CLEAR ')).toBe(true)
    expect(confirmsClear('')).toBe(false)
    expect(confirmsClear('clear')).toBe(false)
    expect(confirmsClear('CLEA')).toBe(false)
    expect(confirmsClear('CLEAR!')).toBe(false)
  })
})

describe('clear warnings', () => {
  it('name how many videos are deleted, here and on other computers, and that it cannot be undone', () => {
    expect(historyClearWarning(1)).toMatch(/^The 1 video, with its saved position and watched mark, is deleted here/)
    expect(historyClearWarning(250)).toMatch(/^All 250 videos, with their saved positions and watched marks, are deleted here/)
    expect(historyClearWarning(250)).toContain('other computers')
    expect(historyClearWarning(250)).toContain('cannot be undone')
  })

  it('name how many channels are unsubscribed, here and on other computers, and that it cannot be undone', () => {
    expect(subscriptionsClearWarning(1)).toMatch(/^The 1 channel is unsubscribed here/)
    expect(subscriptionsClearWarning(40)).toMatch(/^All 40 channels are unsubscribed here/)
    expect(subscriptionsClearWarning(40)).toContain('other computers')
    expect(subscriptionsClearWarning(40)).toContain('cannot be undone')
  })
})
