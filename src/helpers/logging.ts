import pino from 'pino'
import pretty from 'pino-pretty'

const logger = pino(pretty())

function isObject(value: unknown): boolean {
  return typeof value === 'object' && !Array.isArray(value) && value !== null
}

export function logTorrent(object: object, parentKey = ''): void {
  //eslint-disable-next-line no-loops/no-loops
  for (const [key, value] of Object.entries(object)) {
    const printKey = parentKey + key

    if (Buffer.isBuffer(value)) {
      const encoding = key === 'pieces' ? 'hex' : 'utf8'
      logger.info(`${printKey} => ${value.toString(encoding)}`)
    } else if (isObject(value)) {
      logger.info(`${printKey}`)
      logTorrent(value, parentKey + '\t')
    } else logger.info(`${printKey} => ${value}`)
  }
}
