import { join } from 'path'
import { decode } from 'bencode'
import { readFileSync } from 'fs'

import { ReadableMetaInfo } from './types'
import { logMetaInfo } from './helpers/logging'
import { parseMetaInfoToReadable } from './helpers/metaInfo'

const FILE_NAME = 'puppy.torrent'

function parseMetaInfoFromFile(): ReadableMetaInfo {
  const filePath = join(process.cwd(), FILE_NAME)
  const rawMetaInfo = decode(readFileSync(filePath))
  const readableMetaInfo = parseMetaInfoToReadable(rawMetaInfo)
  logMetaInfo(readableMetaInfo)

  return readableMetaInfo
}

const metaInfo = parseMetaInfoFromFile()
