import { join } from 'path'
import { readFileSync } from 'fs'

import { DecodedMetaInfo } from './types'
import { decodeMetaInfo } from './meta-info'
import { logger, logMetaInfo } from './logging'
import { TrackerClient } from './tracker-client'
import { getURLForAnnounceRequest } from './tracker-client/utils'
import { PROTOCOL, RESPONSE_STATUS } from './constants/protocol'

function parseMetaInfoFromFile(fileName: string): DecodedMetaInfo {
  const filePath = join(process.cwd(), fileName)
  const decodedMetaInfo = decodeMetaInfo(readFileSync(filePath))

  logMetaInfo(decodedMetaInfo)

  return decodedMetaInfo
}

function main(): void {
  const trackerClient = new TrackerClient()
  const metaInfo = parseMetaInfoFromFile(process.argv[2])

  // metaInfo['announce'] = 'udp://tracker.opentrackr.org:1337/announce'

  const url = getURLForAnnounceRequest(metaInfo)
  logger.info(`url: ${url}`)

  trackerClient
    .getPeersForTorrent(metaInfo)
    .then((response) => {
      const { type, status } = response

      if (
        type === PROTOCOL.UDP ||
        (type === PROTOCOL.HTTP && status === RESPONSE_STATUS.SUCCESS)
      ) {
        const { peers, ...info } = response
        peers.forEach((peer, idx) => {
          const { ip, port } = peer
          logger.info(`${idx + 1}| ip: ${ip}, port: ${port}`)
        })

        logger.info(JSON.stringify(info, null, 2))
      } else logger.info(JSON.stringify(response, null, 2))
    })
    .catch((error) => {
      logger.error(error.message)
    })
}

main()
