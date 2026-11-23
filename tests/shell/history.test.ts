import { describe, expect, it } from 'vitest'
import {
  continueWatching,
  entryWithPosition,
  formatClock,
  historySettings,
  timeLeftText,
  videoThumbnail,
  HistorySettingKey,
  isHistoryEntry,
  isHistoryVideo,
  isPlayed,
  isWatched,
  positionToSave,
  resumeSeconds,
  watchedAction,
  watchedPercent,
  watchProgress
} from '../../packages/shell/src/shared/history'

const video = {
  videoId: 'l8qxFcaLSM4',
  title: 'HW News',
  channelId: 'UChIs72whgZI9w6d6FhwGGHA',
  channelName: 'Gamers Nexus',
  durationSeconds: 2205
}

describe('entryWithPosition', () => {
  const entry = { ...video, watchedAt: 1000, positionSeconds: 30, channelAvatar: '' }

  it('moves a card\'s progress to the position just saved', () => {
    const moved = entryWithPosition(entry, 1200)
    expect(moved).toEqual({ ...entry, positionSeconds: 1200 })
    expect(watchProgress(moved ?? entry)?.label).toBe('20:00 / 36:45')
  })

  it('changes nothing for an unknown video or the same position', () => {
    expect(entryWithPosition(undefined, 1200)).toBeUndefined()
    expect(entryWithPosition(entry, 30)).toBeUndefined()
  })

  it('marks a video as watched once its position reaches the end, also after it was marked unwatched', () => {
    expect(entryWithPosition(entry, 2205)?.watched).toBe(true)
    expect(entryWithPosition({ ...entry, watched: false }, 2205)?.watched).toBe(true)
  })

  it('keeps a watched video watched when it starts over', () => {
    expect(entryWithPosition({ ...entry, positionSeconds: 2205, watched: true }, 0)).toEqual({ ...entry, positionSeconds: 0, watched: true })
  })
})

describe('continue watching', () => {
  const entry = (videoId: string, watchedAt: number, positionSeconds: number) => ({
    ...video, videoId, watchedAt, positionSeconds, channelAvatar: ''
  })

  it('lists the videos last stopped partway, last watched first', () => {
    const entries = [
      entry('aaaaaaaaaaa', 1, 600),
      entry('bbbbbbbbbbb', 3, 1200),
      entry('ccccccccccc', 2, 10),
      entry('ddddddddddd', 4, 2205),
      entry('eeeeeeeeeee', 5, 0)
    ]
    // c is under 1%, d was watched to its end, e was never played.
    expect(continueWatching(entries).map((item) => item.videoId)).toEqual(['bbbbbbbbbbb', 'aaaaaaaaaaa'])
  })

  it('lists a video saved as removed from Continue watching while it is in progress', () => {
    const saved = { ...entry('aaaaaaaaaaa', 1, 600), hiddenFromContinueWatching: true }
    expect(continueWatching([saved])).toHaveLength(1)
  })

  it('leaves out watched videos stopped partway, and lists them again once marked unwatched', () => {
    const entries = [
      entry('aaaaaaaaaaa', 1, 600),
      { ...entry('bbbbbbbbbbb', 2, 600), watched: true },
      { ...entry('ccccccccccc', 3, 600), watched: false }
    ]
    expect(continueWatching(entries).map((item) => item.videoId)).toEqual(['ccccccccccc', 'aaaaaaaaaaa'])
  })

  it('accepts entries marked as watched, and refuses a bad mark', () => {
    expect(isHistoryEntry({ ...entry('aaaaaaaaaaa', 1, 600), watched: true })).toBe(true)
    expect(isHistoryEntry({ ...entry('aaaaaaaaaaa', 1, 600), watched: 'yes' })).toBe(false)
  })

  it('shows at most 10 videos', () => {
    const many = Array.from({ length: 12 }, (_, index) => entry(`video${String(index).padStart(6, '0')}`, index, 600))
    expect(continueWatching(many)).toHaveLength(10)
  })

  it('says how much time is left', () => {
    expect(timeLeftText({ positionSeconds: 600, durationSeconds: 3000 })).toBe('40 min left')
    expect(timeLeftText({ positionSeconds: 2200, durationSeconds: 2205 })).toBe('1 min left')
    expect(timeLeftText({ positionSeconds: 0, durationSeconds: 3900 })).toBe('1 h 5 min left')
    expect(timeLeftText({ positionSeconds: 0, durationSeconds: 7200 })).toBe('2 h left')
  })

  it('uses YouTube\'s list picture', () => {
    expect(videoThumbnail('l8qxFcaLSM4')).toBe('https://i.ytimg.com/vi/l8qxFcaLSM4/mqdefault.jpg')
  })
})

describe('resume setting', () => {
  it('is on by default, in its own History section', () => {
    expect(historySettings.title).toBe('History')
    expect(historySettings.settings).toEqual([
      expect.objectContaining({ key: HistorySettingKey.resume, type: 'boolean', default: true })
    ])
  })
})

describe('resumeSeconds', () => {
  it('starts at the exact saved position', () => {
    expect(resumeSeconds(347.141, 2205)).toBe(347.141)
  })

  it('starts from the beginning when nothing is saved or the position is past the end', () => {
    expect(resumeSeconds(0, 2205)).toBe(0)
    expect(resumeSeconds(2205, 2205)).toBe(0)
    expect(resumeSeconds(3000, 2205)).toBe(0)
  })
})

describe('positionToSave', () => {
  it('saves the exact position, and the full length for a video that played to its end', () => {
    expect(positionToSave(380.701, false, 2205)).toBe(380.701)
    expect(positionToSave(2204.9, true, 2205)).toBe(2205)
    expect(positionToSave(2204.9, true, Number.NaN)).toBe(2204.9)
  })

  it('saves a position that starts the video from the beginning next time', () => {
    expect(resumeSeconds(positionToSave(2204.9, true, 2205), 2205)).toBe(0)
  })
})

describe('isPlayed', () => {
  it('counts a video as played past 1% of its length', () => {
    expect(isPlayed({ positionSeconds: 22, durationSeconds: 2200 })).toBe(false)
    expect(isPlayed({ positionSeconds: 23, durationSeconds: 2200 })).toBe(true)
    expect(isPlayed({ positionSeconds: 10, durationSeconds: 0 })).toBe(false)
  })
})

describe('isWatched', () => {
  it('follows the mark, whatever the position', () => {
    expect(isWatched({ positionSeconds: 0, durationSeconds: 0, watched: true })).toBe(true)
    expect(isWatched({ positionSeconds: 10, durationSeconds: 2205, watched: true })).toBe(true)
    expect(isWatched({ positionSeconds: 2205, durationSeconds: 2205, watched: false })).toBe(false)
  })

  it('counts an entry without a mark as watched when it played to its end', () => {
    expect(isWatched({ positionSeconds: 2205, durationSeconds: 2205 })).toBe(true)
    expect(isWatched({ positionSeconds: 2000, durationSeconds: 2205 })).toBe(false)
    expect(isWatched({ positionSeconds: 0, durationSeconds: 0 })).toBe(false)
  })
})

describe('watchedAction', () => {
  const entry = { ...video, watchedAt: 1, channelAvatar: '' }

  it('offers marking as watched for a video not in the history or partly watched', () => {
    expect(watchedAction(undefined)).toBe('markWatched')
    expect(watchedAction({ ...entry, positionSeconds: 600 })).toBe('markWatched')
  })

  it('offers marking as unwatched once a video is watched', () => {
    expect(watchedAction({ ...entry, positionSeconds: 2205 })).toBe('markUnwatched')
    expect(watchedAction({ ...entry, positionSeconds: 0, watched: true })).toBe('markUnwatched')
  })

  it('offers marking as watched again once a video was marked unwatched', () => {
    expect(watchedAction({ ...entry, positionSeconds: 2205, watched: false })).toBe('markWatched')
  })
})

describe('watchProgress', () => {
  it('gives the bar width and a position and length label for a played video', () => {
    expect(watchProgress({ positionSeconds: 754, durationSeconds: 2700 })).toEqual({ percent: (754 / 2700) * 100, label: '12:34 / 45:00' })
    expect(watchProgress({ positionSeconds: 3723, durationSeconds: 3723, watched: false })).toEqual({ percent: 100, label: '1:02:03 / 1:02:03' })
  })

  it('gives nothing for a video not played past 1%, unless asked for every saved position', () => {
    expect(watchProgress({ positionSeconds: 10, durationSeconds: 2700 })).toBeUndefined()
    expect(watchProgress({ positionSeconds: 10, durationSeconds: 2700 }, 0)?.label).toBe('0:10 / 45:00')
    expect(watchProgress({ positionSeconds: 0, durationSeconds: 2700 }, 0)).toBeUndefined()
  })

  it('labels a watched video Watched, with the bar at its saved position', () => {
    expect(watchProgress({ positionSeconds: 0, durationSeconds: 0, watched: true })).toEqual({ percent: 0, label: 'Watched' })
    expect(watchProgress({ positionSeconds: 441, durationSeconds: 2205, watched: true })).toEqual({ percent: 20, label: 'Watched' })
    expect(watchProgress({ positionSeconds: 2205, durationSeconds: 2205 })).toEqual({ percent: 100, label: 'Watched' })
  })
})

describe('formatClock', () => {
  it('shows minutes and seconds, with hours when needed', () => {
    expect(formatClock(65)).toBe('1:05')
    expect(formatClock(3723.9)).toBe('1:02:03')
    expect(formatClock(-3)).toBe('0:00')
  })
})

describe('watchedPercent', () => {
  it('stays between 0 and 100', () => {
    expect(watchedPercent({ positionSeconds: 441, durationSeconds: 2205 })).toBe(20)
    expect(watchedPercent({ positionSeconds: 10, durationSeconds: 0 })).toBe(0)
    expect(watchedPercent({ positionSeconds: 3000, durationSeconds: 2205 })).toBe(100)
  })
})

describe('isHistoryVideo', () => {
  it('accepts a video with or without a channel', () => {
    expect(isHistoryVideo(video)).toBe(true)
    expect(isHistoryVideo({ ...video, channelId: '' })).toBe(true)
  })

  it('refuses bad IDs, overlong text and bad lengths', () => {
    expect(isHistoryVideo({ ...video, videoId: 'bad' })).toBe(false)
    expect(isHistoryVideo({ ...video, channelId: 'bad' })).toBe(false)
    expect(isHistoryVideo({ ...video, title: 'x'.repeat(501) })).toBe(false)
    expect(isHistoryVideo({ ...video, durationSeconds: -1 })).toBe(false)
    expect(isHistoryVideo({ ...video, durationSeconds: Number.NaN })).toBe(false)
    expect(isHistoryVideo(null)).toBe(false)
  })

  it('accepts a channel icon from the icon host, an empty one or none, and refuses others', () => {
    expect(isHistoryVideo({ ...video, channelAvatar: 'https://yt3.ggpht.com/icon=s88' })).toBe(true)
    expect(isHistoryVideo({ ...video, channelAvatar: '' })).toBe(true)
    expect(isHistoryVideo({ ...video, channelAvatar: 'https://example.com/icon.jpg' })).toBe(false)
  })
})
