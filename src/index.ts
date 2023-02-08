import { join } from 'path'
import { readFileSync } from 'fs'
import { createSocket } from 'dgram'

import { decode } from 'bencode'

import { DecodedMetaInfo } from './types'
import { logger, logMetaInfo } from './logging'
import { UDPTrackerClient } from './tracker-client'
import { parseMetaInfoToReadable } from './meta-info'

const FILE_NAME = 'phonnyo.torrent'

function parseMetaInfoFromFile(): DecodedMetaInfo {
  const filePath = join(process.cwd(), FILE_NAME)
  const decodedMetaInfo = decode(readFileSync(filePath))

  const readableMetaInfo = parseMetaInfoToReadable(decodedMetaInfo)
  logMetaInfo(readableMetaInfo)

  return decodedMetaInfo
}

const trackerClient = new UDPTrackerClient(createSocket('udp4'))
const metaInfo = parseMetaInfoFromFile()
trackerClient
  .getPeersForTorrent(metaInfo)
  .then((response) => {
    response.peers.forEach((peer, idx) => {
      logger.info(
        `Peer ${idx + 1} => ip: ${peer.ip.toString('hex')}, port: ${peer.port}`
      )

      logger.info(`#seeders: ${response.seeders}`)
      logger.info(`#leechers: ${response.leechers}`)
    })
  })
  .catch((error) => {
    logger.error(error.message)
  })
