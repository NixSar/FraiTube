import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  parseFreeTubeSubscriptions,
  parseNewPipeSubscriptions,
  parseSubscriptionsFile
} from '../../packages/subscriptions/src/importers'
import { TEST_DATA_DIR } from '../paths'
import { freeTubeFile, GAMERS_NEXUS, HARDWARE_UNBOXED, LEVEL1_TECHS, LINUS_TECH_TIPS, newPipeFile, oldFreeTubeFile } from './fixtures'

describe('parseFreeTubeSubscriptions', () => {
  it('merges the channels of every profile, once each, dropping bad IDs and foreign pictures', () => {
    expect(parseFreeTubeSubscriptions(freeTubeFile)).toEqual([
      { id: GAMERS_NEXUS, name: 'Gamers Nexus', avatar: 'https://yt3.ggpht.com/gn=s88' },
      { id: HARDWARE_UNBOXED, name: 'Hardware Unboxed', avatar: 'https://yt3.ggpht.com/hu=s88' },
      { id: LEVEL1_TECHS, name: 'Level1Techs', avatar: '' }
    ])
  })

  it('reads the old one-channel-per-line format', () => {
    expect(parseFreeTubeSubscriptions(oldFreeTubeFile)).toEqual([
      { id: LINUS_TECH_TIPS, name: 'Linus Tech Tips', avatar: 'https://yt3.ggpht.com/ltt=s88' },
      { id: GAMERS_NEXUS, name: 'Gamers Nexus', avatar: '' }
    ])
  })

  it('names the line that is not valid', () => {
    expect(() => parseFreeTubeSubscriptions(`${freeTubeFile}{broken\n`)).toThrow('Line 3')
  })
})

describe('parseNewPipeSubscriptions', () => {
  it('keeps YouTube channel links only', () => {
    expect(parseNewPipeSubscriptions(newPipeFile)).toEqual([
      { id: GAMERS_NEXUS, name: 'Gamers Nexus', avatar: '' },
      { id: LINUS_TECH_TIPS, name: 'Linus Tech Tips', avatar: '' }
    ])
  })

  it('refuses files that are not NewPipe subscriptions', () => {
    expect(() => parseNewPipeSubscriptions('not json')).toThrow('not valid JSON')
    expect(() => parseNewPipeSubscriptions('{"history": []}')).toThrow('no subscriptions')
  })
})

describe('parseSubscriptionsFile', () => {
  it('picks the format by file kind', () => {
    expect(parseSubscriptionsFile('freetube-subscriptions.DB', freeTubeFile).format).toBe('freetube')
    expect(parseSubscriptionsFile('newpipe_subscriptions.json', newPipeFile).format).toBe('newpipe')
    expect(() => parseSubscriptionsFile('subscriptions.csv', '')).toThrow('FreeTube .db file or a NewPipe .json file')
  })

  it('reads files written to disk, which the app check imports', () => {
    const dir = join(TEST_DATA_DIR, 'subscriptions')
    mkdirSync(dir, { recursive: true })
    const freeTubePath = join(dir, 'freetube-subscriptions.db')
    const newPipePath = join(dir, 'newpipe-subscriptions.json')
    writeFileSync(freeTubePath, freeTubeFile)
    writeFileSync(newPipePath, newPipeFile)
    expect(parseSubscriptionsFile(freeTubePath, readFileSync(freeTubePath, 'utf8')).channels).toHaveLength(3)
    expect(parseSubscriptionsFile(newPipePath, readFileSync(newPipePath, 'utf8')).channels).toHaveLength(2)
  })
})
