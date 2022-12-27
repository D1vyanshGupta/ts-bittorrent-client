import { encode } from 'bencode'
import { createHash } from 'crypto'
import { toBufferBE } from 'bigint-buffer'

import { isObject } from '../helpers'
import { DecodedMetaInfo, ReadableMetaInfo } from '../types'

function getHashListFromBuffer(buffer: Buffer): string[] {
  const hashString = buffer.toString('hex')

  // SHA1 hash is 160 bits long == 40 hex chars
  const hashList: string[] = []

  let startIndex = 0
  const hashLength = hashString.length

  //eslint-disable-next-line no-loops/no-loops
  while (startIndex < hashLength) {
    const pieceHash = hashString.slice(startIndex, startIndex + 40)
    hashList.push(pieceHash)

    startIndex += 40
  }

  return hashList
}

export function parseMetaInfoToReadable(input: object): ReadableMetaInfo {
  const metaInfo = {}

  //eslint-disable-next-line no-loops/no-loops
  for (const [key, value] of Object.entries(input)) {
    if (Buffer.isBuffer(value)) {
      if (key !== 'pieces') metaInfo[key] = value.toString('utf8')
      else metaInfo[key] = getHashListFromBuffer(value)
      continue
    }

    if (isObject(value)) {
      metaInfo[key] = parseMetaInfoToReadable(value)
      continue
    }

    if (key === 'creation date') metaInfo[key] = new Date(value).toISOString()
    else metaInfo[key] = value
  }

  return metaInfo as ReadableMetaInfo
}

export function getInfoHash(metaInfo: DecodedMetaInfo): Buffer {
  const bencodedInfo = encode(metaInfo.info)
  const infoHash = createHash('sha1').update(bencodedInfo).digest()

  return infoHash
}

export function getTorrentSize(metaInfo: DecodedMetaInfo): Buffer {
  let size: bigint

  const { info } = metaInfo
  if (info.files) {
    const lengthArray = info.files.map((file) => BigInt(file.length))
    size = lengthArray.reduce((prev, cur) => prev + cur, BigInt(0))
  } else size = BigInt(info.length || 0)

  const sizeBuffer = toBufferBE(size, 1)
  return sizeBuffer
}
