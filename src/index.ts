import { join } from 'path'
import { readFileSync } from 'fs'

import { decode } from 'bencode'

import { DecodedMetaInfo } from './types'
import { logger, logMetaInfo } from './logging'
import { TrackerClient } from './tracker-client'
import { parseMetaInfoToReadable } from './meta-info'

function parseMetaInfoFromFile(fileName: string): DecodedMetaInfo {
  const filePath = join(process.cwd(), fileName)
  const decodedMetaInfo = decode(readFileSync(filePath))

  const readableMetaInfo = parseMetaInfoToReadable(decodedMetaInfo)
  logMetaInfo(readableMetaInfo)

  return decodedMetaInfo
}

function main(): void {
  const trackerClient = new TrackerClient()
  const metaInfo = parseMetaInfoFromFile(process.argv[2])

  trackerClient
    .getPeersForTorrent(metaInfo)
    .then((response) => {
      response.peers.forEach((peer, idx) => {
        logger.info(
          `Peer ${idx + 1} => ip: ${peer.ip.toString('hex')}, port: ${
            peer.port
          }`
        )

        logger.info(`#seeders: ${response.seeders}`)
        logger.info(`#leechers: ${response.leechers}`)
      })
    })
    .catch((error) => {
      logger.error(error.message)
    })
}

main()
