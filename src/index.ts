import { join } from 'path'
import { decode } from 'bencode'
import { readFileSync } from 'fs'

import { DecodedMetaInfo } from './types'
import { logger, logMetaInfo } from './helpers/logging'
import { UDPTrackerClient } from './helpers/tracker-client'
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
const trackerClient = new UDPTrackerClient(metaInfo)
trackerClient.getConnIDFromTracker().catch((error) => {
  logger.error(error.message)
})
