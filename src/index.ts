import { join } from 'path'
import { decode } from 'bencode'
import { readFileSync } from 'fs'

import { MetaInfo } from './types'
import { parseMetaInfo } from './helpers/parse'
import { logMetaInfo } from './helpers/logging'

const FILE_NAME = 'puppy.torrent'

function parseMetaInfoFromFile(): MetaInfo {
  const filePath = join(process.cwd(), FILE_NAME)
  const rawMetaInfo = decode(readFileSync(filePath))
  const metaInfo = parseMetaInfo(rawMetaInfo)
  logMetaInfo(metaInfo)

  return metaInfo
}

const metaInfo = parseMetaInfoFromFile()
