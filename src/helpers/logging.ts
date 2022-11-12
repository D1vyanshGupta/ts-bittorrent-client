import pino from 'pino'
import pretty from 'pino-pretty'

const logger = pino(pretty())

import { isObject, parseSHA1HashList } from './misc'

function logPieceHashList(hashList: string[], indent: string): void {
  hashList.forEach((pieceHash: string): void => {
    logger.info(`${indent}${pieceHash}`)
  })
}

export function logMetaInfo(object: object, indent = ''): void {
  //eslint-disable-next-line no-loops/no-loops
  for (const [key, value] of Object.entries(object)) {
    const printKey = indent + key

    if (Buffer.isBuffer(value)) {
      if (key === 'pieces') {
        logger.info(`${printKey} => `)
        const hashList = parseSHA1HashList(value)
        logPieceHashList(hashList, indent + '\t')
      } else logger.info(`${printKey} => ${value.toString('utf8')}`)
    } else if (isObject(value)) {
      logger.info(`${printKey} =>`)
      logMetaInfo(value, indent + '\t')
    } else logger.info(`${printKey} => ${value}`)
  }
}
