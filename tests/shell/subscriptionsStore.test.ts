import { mkdirSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createSubscriptionsStore, subscriptionsSchema } from '../../packages/shell/src/main/subscriptionsStore'
import { openStorage, type Storage } from '../../packages/storage/src/index'
import { TEST_DATA_DIR } from '../paths'
import { GAMERS_NEXUS, HARDWARE_UNBOXED, LEVEL1_TECHS } from '../subscriptions/fixtures'

const dir = join(TEST_DATA_DIR, 'subscriptions')
const opened: Storage[] = []
const files: string[] = []

function open(): Storage {
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${randomUUID()}.db`)
  files.push(file)
  const storage = openStorage(file, [subscriptionsSchema])
  opened.push(storage)
  return storage
}

afterEach(() => {
  for (const storage of opened.splice(0)) {
    storage.close()
  }
  for (const file of files.splice(0)) {
    for (const suffix of ['', '-wal', '-shm']) {
      rmSync(file + suffix, { force: true })
    }
  }
})

const gamersNexus = { id: GAMERS_NEXUS, name: 'Gamers Nexus', avatar: 'https://yt3.ggpht.com/gn' }
const hardwareUnboxed = { id: HARDWARE_UNBOXED, name: 'hardware Unboxed', avatar: '' }
const level1 = { id: LEVEL1_TECHS, name: 'Level1Techs', avatar: '' }

describe('createSubscriptionsStore', () => {
  it('subscribes and lists by name, ignoring case', () => {
    let time = 100
    const store = createSubscriptionsStore(open(), () => time++)
    store.subscribe(level1)
    store.subscribe(gamersNexus)
    store.subscribe(hardwareUnboxed)
    expect(store.list().map((subscription) => subscription.name)).toEqual(['Gamers Nexus', 'hardware Unboxed', 'Level1Techs'])
    expect(store.list()[0]).toEqual({ ...gamersNexus, subscribedAt: 101 })
  })

  it('keeps the first subscribe time and a known picture when subscribed again', () => {
    let time = 100
    const store = createSubscriptionsStore(open(), () => time++)
    store.subscribe(gamersNexus)
    store.subscribe({ ...gamersNexus, name: 'GamersNexus', avatar: '' })
    expect(store.list()).toEqual([{ id: GAMERS_NEXUS, name: 'GamersNexus', avatar: gamersNexus.avatar, subscribedAt: 100 }])
  })

  it('leaves a removal marker when unsubscribing', () => {
    const storage = open()
    const store = createSubscriptionsStore(storage)
    store.subscribe(gamersNexus)
    store.unsubscribe(GAMERS_NEXUS)
    expect(store.list()).toEqual([])
    const changes = storage.records('subscriptions').changesSince(0)
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ key: GAMERS_NEXUS, removed: true })
  })

  it('unsubscribes from every channel when cleared, leaving a removal marker for each', () => {
    const storage = open()
    const store = createSubscriptionsStore(storage)
    store.subscribe(gamersNexus)
    store.subscribe(hardwareUnboxed)
    store.subscribe(level1)
    store.clear()
    expect(store.list()).toEqual([])
    const changes = storage.records('subscriptions').changesSince(0)
    expect(changes).toHaveLength(3)
    expect(changes.every((change) => change.removed)).toBe(true)
  })

  it('imports only channels not subscribed yet', () => {
    const store = createSubscriptionsStore(open())
    store.subscribe(gamersNexus)
    expect(store.import([gamersNexus, hardwareUnboxed, level1], 'freetube')).toEqual({
      format: 'freetube',
      total: 3,
      added: 2,
      alreadySubscribed: 1
    })
    expect(store.list()).toHaveLength(3)
  })

  it('lists channels without an icon and saves icons only for subscribed channels', () => {
    let time = 100
    const store = createSubscriptionsStore(open(), () => time++)
    store.subscribe(gamersNexus)
    store.subscribe(level1)
    expect(store.missingAvatars().map((subscription) => subscription.id)).toEqual([LEVEL1_TECHS])
    store.setAvatar(LEVEL1_TECHS, 'https://yt3.ggpht.com/l1')
    store.setAvatar(HARDWARE_UNBOXED, 'https://yt3.ggpht.com/hu')
    expect(store.missingAvatars()).toEqual([])
    expect(store.list()).toEqual([
      { ...gamersNexus, subscribedAt: 100 },
      { ...level1, avatar: 'https://yt3.ggpht.com/l1', subscribedAt: 101 }
    ])
  })
})
