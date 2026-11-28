import { parseVideoId } from '@fraitube/youtube/ids'
import { PlayerSettingKey } from '../../shell/src/shared/playerSettings'
import { allSettingDefinitions, SettingKey } from '../../shell/src/shared/settings'
import './android.css'

// What the Android app adds around the screens, without changing them: it tells the Android side
// about the playing video, takes the Android side's wishes for it, and hides what a phone has no use for.

/** What the Android side calls in the page. */
export interface AndroidPage {
  /** The playback notification's button: plays or pauses the video. */
  setPlaying(play: boolean): void
  /** Shrunk into picture-in-picture, only the video shows. */
  setPictureInPicture(on: boolean): void
  /** Opens the video a YouTube link, or a text holding one, points to. */
  openLink(text: string): void
}

declare global {
  interface Window {
    fraitubeAndroid: AndroidPage
  }
}

const PIP_BUTTON = 'button[aria-label="Picture in picture"]'
const NEW_WINDOW_ENTRY = 'Play in new window'

let video: HTMLVideoElement | undefined
let title = ''
let reported = ''

/** Tells the Android side about the video, when anything about it changed. */
function report(): void {
  if (video && !video.isConnected) {
    video = undefined
  }
  const shown = video !== undefined && (video.readyState > 0 || !video.paused)
  const playing = shown && video !== undefined && !video.paused && !video.ended
  const state = [shown, playing, video?.videoWidth ?? 0, video?.videoHeight ?? 0, shown ? title : ''] as const
  const text = JSON.stringify(state)
  if (text !== reported) {
    reported = text
    window.FraiTubeNative.playerState(...state)
  }
}

/** The title of the video being loaded, for the playback notification. */
export function noteVideoTitle(videoTitle: string): void {
  title = videoTitle
  report()
}

/** The video a link points to, also when the link sits inside a shared text. */
function videoIdIn(text: string): string | undefined {
  for (const candidate of text.match(/https?:\/\/\S+/g) ?? [text]) {
    // A link at the end of a sentence or inside brackets carries that punctuation along.
    const id = parseVideoId(candidate.replace(/[)\]}>.,;:!?'"]+$/, ''))
    if (id) {
      return id
    }
  }
  return undefined
}

function openLink(text: string): void {
  const id = videoIdIn(text)
  if (id) {
    window.location.hash = `/watch/${id}`
  }
}

/** Settings a phone has no use for: the one about a second window, and the update check, since the app store delivers updates. */
const HIDDEN_SETTINGS: readonly string[] = [PlayerSettingKey.pipOnLeave, SettingKey.checkUpdates]
const hiddenLabels = new Set(allSettingDefinitions().filter((setting) => HIDDEN_SETTINGS.includes(setting.key)).map((setting) => setting.label))

/** Hides what does not apply on a phone: the settings above, and the menu entry that opens a second window. */
function hideDesktopOnlyParts(): void {
  for (const row of document.querySelectorAll<HTMLElement>('label.row')) {
    if (hiddenLabels.has(row.firstElementChild?.textContent ?? '')) {
      row.style.display = 'none'
    }
  }
  for (const entry of document.querySelectorAll<HTMLElement>('.menu [role="menuitem"]')) {
    if (entry.textContent?.trim() === NEW_WINDOW_ENTRY) {
      entry.style.display = 'none'
    }
  }
}

/** Sets up the Android additions. Call before the screens load, so a link the app was opened with shows first. */
export function installAndroid(): void {
  document.documentElement.classList.add('fraitube-android')

  window.fraitubeAndroid = {
    setPlaying(play) {
      if (!video) {
        return
      }
      if (play) {
        video.play().catch(() => undefined)
      } else {
        video.pause()
      }
    },
    setPictureInPicture(on) {
      document.documentElement.classList.toggle('fraitube-pip', on)
    },
    openLink
  }

  // Media events do not travel up the page, so they are caught on their way down.
  for (const event of ['play', 'playing', 'pause', 'ended', 'emptied', 'loadedmetadata', 'resize']) {
    document.addEventListener(event, ({ target }) => {
      if (target instanceof HTMLVideoElement) {
        video = target
        report()
      }
    }, true)
  }

  // The player's PiP button shrinks the app itself, in place of opening a second window.
  document.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest(PIP_BUTTON)) {
      event.preventDefault()
      event.stopImmediatePropagation()
      window.FraiTubeNative.enterPictureInPicture()
    }
  }, true)

  // The page changes as the user moves about: a closed video is reported, and desktop-only parts are hidden as they appear.
  let scheduled = false
  new MutationObserver(() => {
    if (scheduled) {
      return
    }
    scheduled = true
    requestAnimationFrame(() => {
      scheduled = false
      report()
      hideDesktopOnlyParts()
    })
  }).observe(document.documentElement, { childList: true, subtree: true })

  const link = window.FraiTubeNative.takeLink()
  if (link) {
    openLink(link)
  }
}
