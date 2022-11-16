import { isObject } from './misc'
import { MetaInfo } from '../types'

function getHashListFromBuffer(buffer: Buffer): string[] {
  const hashString = buffer.toString('hex')

  // SHA1 hash is 160 bits long == 40 hex chars
  const hashList: string[] = []

  let startIdx = 0
  const hashLength = hashString.length

  //eslint-disable-next-line no-loops/no-loops
  while (startIdx < hashLength) {
    const pieceHash = hashString.slice(startIdx, startIdx + 40)
    hashList.push(pieceHash)

    startIdx += 40
  }

  return hashList
}

export function parseMetaInfo(input: object): MetaInfo {
  const metaInfo = {}

  //eslint-disable-next-line no-loops/no-loops
  for (const [key, value] of Object.entries(input)) {
    if (Buffer.isBuffer(value)) {
      if (key !== 'pieces') metaInfo[key] = value.toString('utf8')
      else metaInfo[key] = getHashListFromBuffer(value)
      continue
    }

    if (isObject(value)) {
      metaInfo[key] = parseMetaInfo(value)
      continue
    }

    if (key === 'creation date') metaInfo[key] = new Date(value).toISOString()
    else metaInfo[key] = value
  }

  return metaInfo as MetaInfo
}
