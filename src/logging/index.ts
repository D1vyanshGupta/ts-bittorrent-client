import pino from 'pino'
import pretty from 'pino-pretty'

import { isObject } from '../helpers'
import { ReadableMetaInfo } from '../types'

export const logger = pino(pretty())

function logArrayItems(array: string[], indent: string): void {
  array.forEach((item: string): void => {
    logger.info(`${indent}${item}`)
  })
}

export function logMetaInfo(
  metaInfo: ReadableMetaInfo | object,
  indent = ''
): void {
  //eslint-disable-next-line no-loops/no-loops
  for (const [key, value] of Object.entries(metaInfo)) {
    const indentedKey = indent + key

    if (isObject(value)) {
      logger.info(`${indentedKey} =>`)
      logMetaInfo(value, indent + '\t')
      continue
    }

    if (Array.isArray(value)) {
      // logger.info(`${indentedKey} =>`)
      // logArrayItems(value, indent + '\t')
      continue
    }

    logger.info(`${indentedKey} => ${value}`)
  }
}
