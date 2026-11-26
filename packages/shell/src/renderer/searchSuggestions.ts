/** How long the search box waits after the last key before asking YouTube for suggestions, in milliseconds. */
export const SUGGEST_DELAY_MS = 150

/** How many typed texts keep their suggestions for the session. */
export const KEPT_SUGGESTIONS = 200

export interface Suggester {
  /**
   * Asks for the suggestions for the typed text once no other text follows for the delay, and shows them.
   * Suggestions already kept for the text show at once, and empty text shows none.
   */
  type(text: string): void
  /** Stops the ask that is waiting, and drops the answers still on their way. */
  stop(): void
}

/**
 * Asks for search suggestions while typing. Only the answer for the last typed text is shown, and each
 * answer is kept for the session, so the same text is asked only once.
 */
export function createSuggester(
  ask: (text: string) => Promise<string[]>,
  show: (text: string, suggestions: string[]) => void,
  delay = SUGGEST_DELAY_MS,
  limit = KEPT_SUGGESTIONS
): Suggester {
  const kept = new Map<string, string[]>()
  /** The texts whose answers are on their way. */
  const asking = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let wanted = ''

  function keep(text: string, suggestions: string[]): void {
    kept.delete(text)
    kept.set(text, suggestions)
    if (kept.size > limit) {
      const oldest = kept.keys().next().value
      if (oldest !== undefined) {
        kept.delete(oldest)
      }
    }
  }

  function cancel(): void {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
  }

  return {
    type(text) {
      cancel()
      const typed = text.trim()
      wanted = typed
      if (!typed) {
        show('', [])
        return
      }
      const known = kept.get(typed)
      if (known) {
        show(typed, known)
        return
      }
      // A text whose answer is on its way shows when the answer arrives.
      if (asking.has(typed)) {
        return
      }
      timer = setTimeout(() => {
        timer = undefined
        asking.add(typed)
        ask(typed).then(
          (suggestions) => {
            asking.delete(typed)
            keep(typed, suggestions)
            if (wanted === typed) {
              show(typed, suggestions)
            }
          },
          // A failed ask shows no suggestions for its text and is asked again the next time the text is typed.
          () => {
            asking.delete(typed)
            if (wanted === typed) {
              show(typed, [])
            }
          }
        )
      }, delay)
    },
    stop() {
      cancel()
      wanted = ''
    }
  }
}
