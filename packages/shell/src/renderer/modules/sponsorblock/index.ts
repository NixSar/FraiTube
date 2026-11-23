import { defineModule } from '@fraitube/app-api'
import { sponsorBlockSettings } from '../../../shared/sponsorBlockSettings'

/** SponsorBlock owns only its settings; the player shows, skips and mutes the segments. */
export const sponsorBlockModule = defineModule({
  id: 'sponsorblock',
  settings: sponsorBlockSettings
})
