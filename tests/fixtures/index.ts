import { randomBytes } from 'crypto'

import {
  DecodedMetaInfo,
  UDPAnnounceResponse,
  HTTPAnnounceResponse,
  UDPConnectionResponse
} from '../../src/types'

import {
  PROTOCOL,
  RESPONSE_STATUS,
  CONN_RESP_MIN_LENGTH
} from '../../src/constants/protocol'

export function getUDPRequestTimeoutMsMock(requestIdx: number): number {
  return 9 * 2 ** requestIdx
}

export const connectionReceiptTimeFixture = Date.now()
export const connectionIDFixture = randomBytes(CONN_RESP_MIN_LENGTH)

export const connectionResponseFixture: UDPConnectionResponse = {
  receiptTime: connectionReceiptTimeFixture,
  connectionID: connectionIDFixture
}

export const peersFixture = [{ ip: randomBytes(4).join('.'), port: 0 }]
export const numSeedersFixture = Math.random()
export const numLeechersFixture = Math.random()

export const udpAnnounceResponseFixture: UDPAnnounceResponse = {
  type: PROTOCOL.UDP,
  status: RESPONSE_STATUS.SUCCESS,
  peers: peersFixture,
  seeders: numSeedersFixture,
  leechers: numLeechersFixture
}

export const numCompleteFixture = Math.ceil(Math.random() * 9 + 1)
export const numIncompleteFixture = Math.ceil(Math.random() * 9 + 1)
export const intervalFixture = Math.ceil(Math.random() * 9 + 1)
export const minIntervalFixture = Math.ceil(Math.random() * 9 + 1)

export const httpAnnounceResponseFixture: HTTPAnnounceResponse = {
  type: PROTOCOL.HTTP,
  status: RESPONSE_STATUS.SUCCESS,
  peers: peersFixture,
  complete: numCompleteFixture,
  incomplete: numIncompleteFixture,
  interval: intervalFixture,
  'min interval': minIntervalFixture
}

export const requestTimeoutMsFixture = 1000
export const connectionIDValidityMsFixture = 30

export const metaInfoNameFixture = 'some-random-name'

export const udpAnnouceUrlFixture = new URL('udp://randomHost:1234')
export const udpMetaInfoFixture: DecodedMetaInfo = {
  announce: udpAnnouceUrlFixture.toString(),
  info: {
    name: metaInfoNameFixture,
    pieces: Buffer.allocUnsafe(0),
    'piece length': 1
  }
}

export const httpAnnounceUrlFixture = new URL('http://randomHost:1234')
export const httpMetaInfoFixture: DecodedMetaInfo = {
  ...udpMetaInfoFixture,
  announce: httpAnnounceUrlFixture.toString()
}

/*
hexString and expected url-safe encoding string fixtures as per
https://wiki.theory.org/BitTorrentSpecification#Tracker_HTTP.2FHTTPS_Protocol
*/
export const bufferHexStringFixture = '123456789abcdef123456789abcdef123456789a'
export const urlSafeEncodingFixture =
  '%124Vx%9A%BC%DE%F1%23Eg%89%AB%CD%EF%124Vx%9A'
