/** What the Android side offers a page for making network requests. */
export interface NativeRequests {
  /** Registers a request and returns the ID under which the page then fetches its answer. */
  request(details: string, bodyBase64: string): string
}

/** What the Android side offers the app page. */
export interface AppNative extends NativeRequests {
  /** Runs one database statement with its values as a JSON list; answers with JSON holding the rows or the error. */
  db(sql: string, params: string, wantRows: boolean): string
  /** Registers a request to a SponsorBlock server's segments address; its answer is fetched like any other. */
  sponsorRequest(details: string, bodyBase64: string): string
  /** The fetched feed as saved last, or an empty text when none is saved. */
  readFeed(): string
  /** Saves the fetched feed, replacing the one saved before. */
  writeFeed(text: string): void
  /** Reports the page's video: whether there is one, whether it plays, its picture's width and height, and its title. */
  playerState(hasVideo: boolean, playing: boolean, width: number, height: number, title: string): void
  /** Shrinks the app into a small floating video. */
  enterPictureInPicture(): void
  /** The YouTube link the app was opened with, handed out once, or an empty text. */
  takeLink(): string
  /** The browser name every YouTube request carries. */
  userAgent(): string
  /** The app's version. */
  version(): string
  /**
   * Opens Android's file picker for an import of the given kind, "subscriptions" or "history". The answer
   * arrives through `fraitubeNativeResult`: the file's name and the ID its contents are fetched with, as
   * JSON, or an empty text when no file was chosen. A NewPipe history backup is read with the given
   * statement and its values as a JSON list, and its contents are the rows found.
   */
  chooseFile(callId: string, kind: string, sql: string, params: string): void
  /**
   * Asks with Android's save picker where to save a file sent with uploadStart and uploadChunk, under a
   * suggested name. The answer arrives through `fraitubeNativeResult`: the saved file's name, or an
   * empty text when no place was chosen.
   */
  saveFile(callId: string, uploadId: string, name: string, mimeType: string): void
  /** Starts a file the page sends to the Android side in pieces, and returns its ID. */
  uploadStart(): string
  /** Adds one piece, as base64, to a file started with uploadStart. */
  uploadChunk(uploadId: string, base64: string): void
  /** A consistent copy of the database: JSON with the ID its contents are fetched with, or the error. */
  backupCopy(): string
  /**
   * Puts the database sent with uploadStart and uploadChunk in the place of this phone's, keeping this
   * phone's ID and the tables named in the first JSON list, and emptying the tables named in the
   * second. Answers with an empty text, or the error.
   */
  restoreDatabase(uploadId: string, keepTables: string, clearTables: string): string
  /**
   * One file call of the sync engine on the app's private sync folder: "mkdir", "readdir", "readFile",
   * "writeFile" (the contents as base64), "rename" (the new path), "rm", or "clear", which empties
   * the whole folder. Answers with JSON holding the value, or the error.
   */
  syncFile(op: string, path: string, arg: string): string
  /**
   * Opens Android's folder picker for the sync folder and keeps the access to it. The answer arrives
   * through `fraitubeNativeResult`: the folder's name, or an empty text when none was chosen.
   */
  chooseSyncFolder(callId: string): void
  /**
   * Saves the WebDAV password for an address; an empty password removes it. The Android side keeps the
   * password with its address and sends it only there. Answers with an empty text, or the error.
   */
  setSyncPassword(address: string, password: string): string
  /** Whether a password is saved for this very address. */
  hasSyncPassword(address: string): boolean
  /**
   * Copies sync files between the private sync folder and the place the phone syncs through: "pull"
   * brings the other computers' files in, "push" sends this phone's out. The details are JSON with the
   * mode ("folder" or "webdav"), the computer ID and, for WebDAV, the address and user name. The
   * answer arrives through `fraitubeNativeResult`: an empty text, or the error.
   */
  syncTransfer(callId: string, direction: string, details: string): void
  /** Asks a yes or no question in a dialog. The answer arrives through `fraitubeNativeResult`: "yes", or an empty text. */
  confirm(callId: string, title: string, message: string, yesLabel: string): void
  /** Loads the app's page anew. */
  reload(): void
  /** Runs a task in the hidden page; the answer arrives through `fraitubeNativeResult`. */
  run(callId: string, kind: string, payload: string): void
}

/** A task the hidden page runs: minting a playback token, or running YouTube's player script. */
export interface HiddenTask {
  /** Given by the Android side and handed back with the answer. */
  id: string
  kind: 'token' | 'eval'
  payload: string
}

/** What the Android side offers the hidden page. */
export interface HiddenNative extends NativeRequests {
  /** The task this page was loaded for, as JSON, or an empty string when there is none. */
  takeTask(): string
  /** Hands back the result of the task with this ID, or why it failed. */
  done(id: string, ok: boolean, value: string): void
}

declare global {
  interface Window {
    FraiTubeNative: AppNative
    FraiTubeHidden: HiddenNative
    fraitubeNativeResult: (callId: string, ok: boolean, value: string) => void
  }
}

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return btoa(binary)
}

/** Changes a request's headers before it leaves, for example to match what a browser sends for that address. */
export type PrepareHeaders = (url: string, headers: Record<string, string>) => Record<string, string>

/**
 * A fetch function that sends requests through the Android side, which allows only the hosts it knows.
 * The request is registered with its body, then its answer is fetched from the page's own address under `answerPath`.
 */
export function createNativeFetch(native: NativeRequests, answerPath: string, prepare: PrepareHeaders = (_url, headers) => headers): typeof fetch {
  const pageFetch = window.fetch.bind(window)
  return async (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    const signal = init?.signal ?? undefined
    signal?.throwIfAborted()

    const given: Record<string, string> = {}
    new Headers(input instanceof Request ? input.headers : undefined).forEach((value, name) => {
      given[name] = value
    })
    new Headers(init?.headers).forEach((value, name) => {
      given[name] = value
    })

    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    if (method !== 'GET' && method !== 'POST') {
      throw new TypeError(`Unsupported method ${method}`)
    }

    const source = init?.body ?? (input instanceof Request ? await input.arrayBuffer() : undefined)
    const body = source == null ? '' : toBase64(new Uint8Array(await new Response(source).arrayBuffer()))

    const id = native.request(JSON.stringify({ url, method, headers: prepare(url, given) }), body)
    const answer = await pageFetch(`${answerPath}${id}`, { signal })
    const status = Number(answer.headers.get('x-fraitube-status'))
    if (!Number.isInteger(status) || status < 200) {
      throw new TypeError(decodeURIComponent(answer.headers.get('x-fraitube-error') ?? '') || 'The request failed')
    }

    const headers = JSON.parse(decodeURIComponent(answer.headers.get('x-fraitube-headers') ?? '%5B%5D')) as [string, string][]
    const noBody = status === 204 || status === 304
    return new Response(noBody ? null : answer.body, {
      status,
      statusText: decodeURIComponent(answer.headers.get('x-fraitube-status-text') ?? ''),
      headers
    })
  }
}
