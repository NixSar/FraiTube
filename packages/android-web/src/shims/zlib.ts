import { gunzipSync as unpack, gzipSync as pack } from 'fflate'

/** Unpacked bytes that read as text, as Node's buffers do. */
class Bytes extends Uint8Array {
  override toString(): string {
    return new TextDecoder().decode(this)
  }
}

/** Stand-in for Node's gzipSync: packs a text or bytes. */
export function gzipSync(data: string | Uint8Array): Uint8Array {
  return pack(typeof data === 'string' ? new TextEncoder().encode(data) : data)
}

/**
 * Stand-in for Node's gunzipSync. The size a gzip file states for its contents is checked against the
 * limit before anything is unpacked, and the unpacked size after.
 */
export function gunzipSync(data: Uint8Array, options: { maxOutputLength?: number } = {}): Bytes {
  const limit = options.maxOutputLength ?? Infinity
  if (data.length < 18) {
    throw new Error('Not a gzip file')
  }
  const end = data.length
  const stated = ((data[end - 4] ?? 0) | ((data[end - 3] ?? 0) << 8) | ((data[end - 2] ?? 0) << 16) | ((data[end - 1] ?? 0) << 24)) >>> 0
  if (stated > limit) {
    throw new RangeError('The unpacked data is larger than allowed')
  }
  const unpacked = unpack(data)
  if (unpacked.length > limit) {
    throw new RangeError('The unpacked data is larger than allowed')
  }
  return new Bytes(unpacked)
}
