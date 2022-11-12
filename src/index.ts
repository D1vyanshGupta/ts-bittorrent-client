import { join } from 'path'
import { decode } from 'bencode'
import { readFileSync } from 'fs'
import { createSocket } from 'dgram'

import { MetaInfo } from './types'
import { parseMetaInfo } from './helpers/parse'
import { logger, logMetaInfo } from './helpers/logging'

const FILE_NAME = 'puppy.torrent'

function parseMetaInfoFromFile(): MetaInfo {
  const filePath = join(process.cwd(), FILE_NAME)
  const rawMetaInfo = decode(readFileSync(filePath))
  const metaInfo = parseMetaInfo(rawMetaInfo)
  logMetaInfo(metaInfo)

  return metaInfo
}

function registerEventListener(announce: string): void {
  const socket = createSocket('udp4')

  const url = new URL(announce)
  const sendMsg = Buffer.from('ping', 'utf8')

  socket.send(
    sendMsg,
    0,
    sendMsg.length,
    +url.port,
    url.hostname,
    (error: Error | null, bytes: number) => {
      if (error) logger.error(`unable to send message ${error.message}`)
      else logger.info(`${bytes} byte(s) message sent`)
    }
  )

  socket.on('message', (rcvdMsg: Buffer) => {
    logger.info(`received: ${rcvdMsg.toString('utf8')}`)
  })
}

const metaInfo = parseMetaInfoFromFile()
registerEventListener(metaInfo.announce)
