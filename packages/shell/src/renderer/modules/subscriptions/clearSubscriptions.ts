import { clearWarning } from '../../components/confirmClear'

/** What clearing the subscriptions does, for the given number of subscribed channels. */
export function subscriptionsClearWarning(count: number): string {
  return clearWarning(count === 1 ? 'The 1 channel is unsubscribed' : `All ${count} channels are unsubscribed`)
}
