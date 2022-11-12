import { join } from 'path'
import { decode } from 'bencode'
import { readFileSync } from 'fs'

import { MetaInfo } from './types'
import { logMetaInfo } from './helpers/logging'

const FILE_NAME = 'puppy.torrent'

function parseMetaInfoFile(): MetaInfo {
  const filePath = join(process.cwd(), FILE_NAME)
  const metaInfo = decode(readFileSync(filePath)) as MetaInfo
  logMetaInfo(metaInfo)

  return metaInfo
}

const metaInfo = parseMetaInfoFile()
