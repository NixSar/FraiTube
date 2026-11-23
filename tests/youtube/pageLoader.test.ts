import { describe, expect, it } from 'vitest'
import { createPageLoader, HOME_PAGE_URL, watchPageUrl } from '../../packages/youtube/src/pageLoader'

const ytcfg = 'ytcfg.set({"INNERTUBE_API_KEY":"key","PLAYER_JS_URL":"/s/player/abc123/player_ias.vflset/en_US/base.js"});'
const challenge = 'window.ytAtN({"program":"p","globalName":"g"})'
const playerResponse = 'var ytInitialPlayerResponse = {"playabilityStatus":{"status":"OK"}};'

const watchHtml = `<script>${ytcfg}${challenge}${playerResponse}</script>`
const homeHtml = `<script>${ytcfg}${challenge}</script>`
const captchaHtml = '<html><body>Our systems have detected unusual traffic</body></html>'

function fakeFetch(pages: Record<string, string | Error>): { fetchHtml: (url: string) => Promise<string>; requested: string[] } {
  const requested: string[] = []
  return {
    requested,
    fetchHtml: async (url) => {
      requested.push(url)
      const page = pages[url] ?? pages['*']
      if (page instanceof Error || page === undefined) {
        throw page ?? new Error('not found')
      }
      return page
    }
  }
}

describe('createPageLoader', () => {
  it('uses the watch page while YouTube serves it', async () => {
    const { fetchHtml, requested } = fakeFetch({ '*': watchHtml })
    const loader = createPageLoader(fetchHtml)
    const page = await loader.load('dQw4w9WgXcQ')
    expect(requested).toEqual([watchPageUrl('dQw4w9WgXcQ')])
    expect(page.playerId).toBe('abc123')
    expect(page.playerResponse).toEqual({ playabilityStatus: { status: 'OK' } })
    expect(loader.usingHomePage).toBe(false)
  })

  it('falls back to the home page after a refused watch page and stays there', async () => {
    const { fetchHtml, requested } = fakeFetch({
      [watchPageUrl('dQw4w9WgXcQ')]: new Error('Page request failed with status 429'),
      [HOME_PAGE_URL]: homeHtml,
      '*': watchHtml
    })
    const loader = createPageLoader(fetchHtml)

    const first = await loader.load('dQw4w9WgXcQ')
    expect(first.playerId).toBe('abc123')
    expect(first.playerResponse).toBeUndefined()
    expect(loader.usingHomePage).toBe(true)

    await loader.load('jNQXAC9IVRw')
    expect(requested).toEqual([watchPageUrl('dQw4w9WgXcQ'), HOME_PAGE_URL, HOME_PAGE_URL])
  })

  it('falls back when the watch page is a captcha page without ytcfg', async () => {
    const { fetchHtml } = fakeFetch({ [watchPageUrl('dQw4w9WgXcQ')]: captchaHtml, [HOME_PAGE_URL]: homeHtml })
    const loader = createPageLoader(fetchHtml)
    const page = await loader.load('dQw4w9WgXcQ')
    expect(page.ytConfig['INNERTUBE_API_KEY']).toBe('key')
    expect(loader.usingHomePage).toBe(true)
  })

  it('fails when the home page is refused too', async () => {
    const { fetchHtml } = fakeFetch({ '*': new Error('Page request failed with status 429') })
    await expect(createPageLoader(fetchHtml).load('dQw4w9WgXcQ')).rejects.toThrow('429')
  })
})
