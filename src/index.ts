import { join } from 'path'
import { decode } from 'bencode'
import { readFileSync } from 'fs'

import { DecodedMetaInfo } from './types'
import { logMetaInfo } from './helpers/logging'
import { parseMetaInfoToReadable } from './helpers/metaInfo'

const FILE_NAME = 'puppy.torrent'

function parseMetaInfoFromFile(): DecodedMetaInfo {
  const filePath = join(process.cwd(), FILE_NAME)
  const rawMetaInfo = decode(readFileSync(filePath))

  const readableMetaInfo = parseMetaInfoToReadable(rawMetaInfo)
  logMetaInfo(readableMetaInfo)

  return rawMetaInfo
}

const metaInfo = parseMetaInfoFromFile()
