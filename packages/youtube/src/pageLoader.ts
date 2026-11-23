import { parseWatchPage, type WatchPage } from './page'

/** Loads a page and returns its HTML, throwing when the server refuses it. */
export type FetchHtml = (url: string) => Promise<string>

export interface PageLoader {
  /** The watch page of a video, or the home page once YouTube has refused a watch page. */
  load(videoId: string): Promise<WatchPage>
  readonly usingHomePage: boolean
}

export const HOME_PAGE_URL = 'https://www.youtube.com/'

export function watchPageUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}&bpctr=9999999999&has_verified=1`
}

/**
 * When YouTube answers a watch page with a captcha or an error, it keeps doing so for a while.
 * From then on, until the app restarts, the home page provides ytcfg and the BotGuard challenge,
 * and the player response is requested separately.
 */
export function createPageLoader(fetchHtml: FetchHtml): PageLoader {
  let usingHomePage = false

  async function loadHomePage(): Promise<WatchPage> {
    const page = parseWatchPage(await fetchHtml(HOME_PAGE_URL))
    return { ...page, playerResponse: undefined, initialData: undefined }
  }

  return {
    get usingHomePage() {
      return usingHomePage
    },
    async load(videoId) {
      if (!usingHomePage) {
        try {
          return parseWatchPage(await fetchHtml(watchPageUrl(videoId)))
        } catch {
          usingHomePage = true
        }
      }
      return loadHomePage()
    }
  }
}
