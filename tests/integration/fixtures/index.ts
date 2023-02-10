import { randomBytes } from 'crypto'

import {
  DecodedMetaInfo,
  AnnounceResponse,
  ConnectionResponse
} from '../../../src/types/index'
import { CONN_RESP_MIN_LENGTH } from '../../../src/constants/protocol'

export function getRequestTimeoutMsMock(requestIdx: number): number {
  return 9 * 2 ** requestIdx
}

export const connectionReceiptTimeFixture = Date.now()
export const connectionIDFixture = randomBytes(CONN_RESP_MIN_LENGTH)

export const connectionResponseFixture: ConnectionResponse = {
  receiptTime: connectionReceiptTimeFixture,
  connectionID: connectionIDFixture
}

export const peersFixture = [{ ip: Buffer.allocUnsafe(0), port: 0 }]
export const numSeedersFixture = Math.random()
export const numLeechersFixture = Math.random()

export const announceResponseFixture: AnnounceResponse = {
  peers: peersFixture,
  seeders: numSeedersFixture,
  leechers: numLeechersFixture
}

export const requestTimeoutMsFixture = 1000
export const connectionIDValidityMsFixture = 30

export const annouceUrlFixture = new URL('udp://randomHost:1234')
export const metaInfoFixture: DecodedMetaInfo = {
  announce: Buffer.from(annouceUrlFixture.toString(), 'utf-8'),
  info: {
    name: Buffer.allocUnsafe(0),
    pieces: Buffer.allocUnsafe(0),
    'piece length': 1
  }
}
