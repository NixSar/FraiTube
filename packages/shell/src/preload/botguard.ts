import { mintPoToken } from '@fraitube/youtube/botguard'

// Preload for the offscreen BotGuard page. That page runs without context isolation,
// so this function lands on the page's own window, where the main process calls it.
Object.assign(window, { fraitubeMintPoToken: mintPoToken })
