import { DecodedMetaInfo } from '../../../src/types/index'

export const timeoutMsFixture = 1000
export const connectionIDValidityMsFixture = 1300
export const connectionIDMaxNumRequestsFixture = 4

export const annouceUrlFixture = new URL('udp://randomHost:1234')
export const metaInfoFixture: DecodedMetaInfo = {
  announce: Buffer.from(annouceUrlFixture.toString(), 'utf-8'),
  info: {
    name: Buffer.allocUnsafe(0),
    pieces: Buffer.allocUnsafe(0),
    'piece length': 1
  }
}
