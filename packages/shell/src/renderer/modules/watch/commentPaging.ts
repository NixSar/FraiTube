export interface CommentPagingState {
  /** The ID of the next page, when there is one. */
  continuation: string | undefined
  /** True while a page is being fetched. */
  loading: boolean
  /** True after a page failed. */
  failed: boolean
}

/** Whether the next page of comments may be fetched: after a failed page, only by pressing Try again. */
export function canFetchMore(state: CommentPagingState, retry: boolean): boolean {
  return state.continuation !== undefined && !state.loading && (!state.failed || retry)
}
