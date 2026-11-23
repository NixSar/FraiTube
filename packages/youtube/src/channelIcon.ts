import { array, dig } from './json'

/** Icons this wide or wider are sharp at every size the app shows. */
const MIN_ICON_WIDTH = 88
/** The size asked for when only the large picture is given. */
const ICON_SIZE = 176

interface Picture {
  url: string
  width: number
}

function pictures(value: unknown): Picture[] {
  return array(value)
    .map((item) => ({ url: dig(item, 'url'), width: Number(dig(item, 'width') ?? 0) }))
    .filter((item): item is Picture => typeof item.url === 'string' && item.url.startsWith('https://'))
    .sort((a, b) => a.width - b.width)
}

/** The channel's icon from its /browse response, or an empty string. */
export function readChannelIcon(data: unknown): string {
  const header = pictures(dig(
    data,
    'header', 'pageHeaderRenderer', 'content', 'pageHeaderViewModel', 'image',
    'decoratedAvatarViewModel', 'avatar', 'avatarViewModel', 'image', 'sources'
  ))
  const fromHeader = header.find((picture) => picture.width >= MIN_ICON_WIDTH) ?? header.at(-1)
  if (fromHeader) {
    return fromHeader.url
  }
  const large = pictures(dig(data, 'metadata', 'channelMetadataRenderer', 'avatar', 'thumbnails')).at(-1)
  return large ? large.url.replace(/=s\d+-/, `=s${ICON_SIZE}-`) : ''
}
