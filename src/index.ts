import { join } from 'path'
import { decode } from 'bencode'
import { readFileSync } from 'fs'

import { DecodedMetaInfo } from './types'
import { getPeers } from './helpers/tracker'
import { logger, logMetaInfo } from './helpers/logging'
import { parseMetaInfoToReadable } from './helpers/meta-info'

const FILE_NAME = 'puppy.torrent'

function parseMetaInfoFromFile(): DecodedMetaInfo {
  const filePath = join(process.cwd(), FILE_NAME)
  const decodedMetaInfo = decode(readFileSync(filePath))

  const readableMetaInfo = parseMetaInfoToReadable(decodedMetaInfo)
  logMetaInfo(readableMetaInfo)

  return decodedMetaInfo
}

const metaInfo = parseMetaInfoFromFile()
getPeers(metaInfo, 20000)
  .then((peers) => {
    logger.info(peers)
  })
  .catch((error) => {
    logger.error(error?.message)
  })
