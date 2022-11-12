import { join } from 'path'
import { decode } from 'bencode'
import { readFileSync } from 'fs'

import { MetaInfo } from './types'
import { logMetaInfo } from './helpers/logging'
import { parseMetaInfo } from './helpers/parse'

const FILE_NAME = 'puppy.torrent'

function parseMetaInfoFromFile(): MetaInfo {
  const filePath = join(process.cwd(), FILE_NAME)
  const rawMetaInfo = decode(readFileSync(filePath))
  const metaInfo = parseMetaInfo(rawMetaInfo)
  logMetaInfo(metaInfo)

  return metaInfo
}

const metaInfo = parseMetaInfoFromFile()
