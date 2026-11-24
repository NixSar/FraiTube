import { describe, expect, it } from 'vitest'
import { withoutStart } from '../../packages/shell/src/shared/pip'

describe('withoutStart', () => {
  it('takes the start second and the subtitle track out of a watch page query', () => {
    expect(withoutStart({ t: '120', cc: 'en' })).toEqual({})
    expect(withoutStart({ t: '120' })).toEqual({})
    expect(withoutStart({ cc: '' })).toEqual({})
  })

  it('keeps everything else in the query', () => {
    expect(withoutStart({ t: '120', list: 'abc' })).toEqual({ list: 'abc' })
  })

  it('has nothing to change in a query with neither', () => {
    expect(withoutStart({})).toBeUndefined()
    expect(withoutStart({ list: 'abc' })).toBeUndefined()
  })
})
