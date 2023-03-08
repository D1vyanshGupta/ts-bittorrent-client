import { createHash } from 'crypto'
import { encode } from 'bencode'

import { isObject, decodeBencodedData } from '../helpers'
import { DecodedMetaInfo } from '../types'
import { getUnableDecodeTorrentFileErrorMsg } from '../constants/error-message'

function parseDecodedMetaInfo(input: object): DecodedMetaInfo {
  const metaInfo = {}

  //eslint-disable-next-line no-loops/no-loops
  for (const [key, value] of Object.entries(input)) {
    if (key === 'pieces') {
      metaInfo[key] = value
      continue
    }

    if (Buffer.isBuffer(value)) {
      metaInfo[key] = value.toString('utf8')
      continue
    }

    if (isObject(value)) {
      metaInfo[key] = parseDecodedMetaInfo(value)
      continue
    }

    metaInfo[key] = value
  }

  return metaInfo as DecodedMetaInfo
}

export function decodeMetaInfo(dataBuffer: Buffer): DecodedMetaInfo {
  try {
    const decodedData = decodeBencodedData(dataBuffer)
    const decodedMetaInfo = parseDecodedMetaInfo(decodedData)

    return decodedMetaInfo
  } catch (error) {
    throw Error(getUnableDecodeTorrentFileErrorMsg(error.message))
  }
}

export function getInfoHash(metaInfo: DecodedMetaInfo): Buffer {
  const bencodedInfo = encode(metaInfo.info)
  const infoHash = createHash('sha1').update(bencodedInfo).digest()
  return infoHash
}

export function getTorrentSize(metaInfo: DecodedMetaInfo): bigint {
  let size: bigint

  const { info } = metaInfo
  if (info.files) {
    const lengthArray = info.files.map((file) => BigInt(file.length))
    size = lengthArray.reduce((prev, cur) => prev + cur, BigInt(0))
  } else size = BigInt(info.length || 0)

  return size
}
