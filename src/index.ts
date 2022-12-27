import { join } from 'path'
import { decode } from 'bencode'
import { readFileSync } from 'fs'

import { DecodedMetaInfo } from './types'
import { logger, logMetaInfo } from './logging'
import { UDPTrackerClient } from './tracker-client'
import { parseMetaInfoToReadable } from './meta-info'

const FILE_NAME = 'noragami.torrent'

function parseMetaInfoFromFile(): DecodedMetaInfo {
  const filePath = join(process.cwd(), FILE_NAME)
  const decodedMetaInfo = decode(readFileSync(filePath))

  const readableMetaInfo = parseMetaInfoToReadable(decodedMetaInfo)
  logMetaInfo(readableMetaInfo)

  return decodedMetaInfo
}

const metaInfo = parseMetaInfoFromFile()
const trackerClient = new UDPTrackerClient(metaInfo)
trackerClient.getConnectionID().catch((error) => {
  logger.error(error.message)
})
