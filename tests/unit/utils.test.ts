import path from 'path'
import { randomBytes } from 'crypto'
import { readFileSync, readdirSync } from 'fs'

import { decode } from 'bencode'

import {
  buildAnnounceRequest,
  parseAnnounceResponse,
  buildConnectionRequest,
  parseConnectionResponse
} from '../../src/tracker-client/utils'

import {
  PEER_LENGTH,
  CONNECT_EVENT,
  ANNOUNCE_EVENT,
  CONN_ID_LENGTH,
  CONN_REQ_MIN_LENGTH,
  CONN_RESP_MIN_LENGTH,
  TRANSACTION_ID_LENGTH,
  ANNOUNCE_REQ_MIN_LENGTH,
  BUILD_CONN_REQ_PROTOCOL_ID,
  ANNOUNCE_RESP_MIN_LENGTH
} from '../../src/constants'

import { DecodedMetaInfo } from '../../src/types'
import getPeerId from '../../src/tracker-client/peer-id'
import { getInfoHash, getTorrentSize } from '../../src/meta-info'

describe('utils', () => {
  describe('buildConnectionRequest: builds connection request as per BEP: 15', () => {
    let transactionID: Buffer
    let connectionRequest: Buffer

    beforeAll(() => {
      transactionID = randomBytes(TRANSACTION_ID_LENGTH)
      connectionRequest = buildConnectionRequest(transactionID)
    })

    test(`connection request is at least ${CONN_REQ_MIN_LENGTH} bytes long`, () => {
      expect(connectionRequest.length >= CONN_REQ_MIN_LENGTH).toBeTruthy()
    })

    test('bytes 0-7 span protocol defined special constant', () => {
      const requestID = connectionRequest.subarray(0, 8).readBigInt64BE()

      const isSame = requestID === BUILD_CONN_REQ_PROTOCOL_ID
      expect(isSame).toBeTruthy()
    })

    test('bytes 8-11 span connect event code i.e. 0', () => {
      const eventID = connectionRequest.subarray(8, 12).readInt32BE()

      const isSame = eventID === 0
      expect(isSame).toBeTruthy()
    })

    test('bytes 12-15 span transactionID', () => {
      const givenTransactionID = connectionRequest.subarray(13)

      const isSame = Buffer.compare(givenTransactionID, transactionID)
      expect(isSame).toBeTruthy()
    })
  })

  describe('parseConnectionResponse: parses connection response as per BEP 15', () => {
    let transactionID: Buffer
    let response: Buffer

    beforeAll(() => {
      transactionID = randomBytes(TRANSACTION_ID_LENGTH)
    })

    test(`throws error if response is shorter than ${CONN_RESP_MIN_LENGTH} bytes`, () => {
      response = Buffer.allocUnsafe(CONN_RESP_MIN_LENGTH - 1)

      expect(() =>
        parseConnectionResponse(transactionID, response)
      ).toThrowError(
        `response has size less than ${CONN_RESP_MIN_LENGTH} bytes`
      )
    })

    test(`throws error if response type is not of type ${CONNECT_EVENT}`, () => {
      response = Buffer.allocUnsafe(CONN_RESP_MIN_LENGTH)

      response.writeUInt32BE(1, 0)

      expect(() =>
        parseConnectionResponse(transactionID, response)
      ).toThrowError('response does not correspond to a connection request')
    })

    test(`throws error if response does not correspond to given transactionID`, () => {
      response = Buffer.allocUnsafe(CONN_RESP_MIN_LENGTH)

      response.writeUInt32BE(0, 0)
      randomBytes(TRANSACTION_ID_LENGTH).copy(response, 4)

      expect(() =>
        parseConnectionResponse(transactionID, response)
      ).toThrowError('response does not correspond to given transactionID')
    })

    test('parses valid response', () => {
      response = Buffer.allocUnsafe(CONN_RESP_MIN_LENGTH)

      response.writeUInt32BE(0, 0)
      transactionID.copy(response, 4)

      const connectionID = randomBytes(CONN_ID_LENGTH)
      connectionID.copy(response, 8)

      const { receiptTime, connectionID: parsedConnectionID } =
        parseConnectionResponse(transactionID, response)

      const isSame = Buffer.compare(connectionID, parsedConnectionID) === 0

      expect(receiptTime > 0).toBeTruthy()
      expect(isSame).toBeTruthy()
    })
  })

  describe('buildAnnounceRequest: builds announce request as per BEP: 15', () => {
    let socketPort: number
    let connectionID: Buffer
    let transactionID: Buffer
    let announceRequest: Buffer
    let metaInfo: DecodedMetaInfo

    beforeAll(() => {
      socketPort = Math.floor(Math.random() * 10)
      connectionID = randomBytes(CONN_ID_LENGTH)
      transactionID = randomBytes(TRANSACTION_ID_LENGTH)

      const fixturesDir = path.join(__dirname, 'fixtures')
      const filePath = path.join(fixturesDir, readdirSync(fixturesDir)[0])
      metaInfo = decode(readFileSync(filePath))

      announceRequest = buildAnnounceRequest(
        socketPort,
        metaInfo,
        connectionID,
        transactionID
      )
    })

    test(`announce request is at least ${ANNOUNCE_REQ_MIN_LENGTH} bytes long`, () => {
      expect(announceRequest.length >= ANNOUNCE_REQ_MIN_LENGTH).toBeTruthy()
    })

    test('bytes 0-7 span connectionID', () => {
      const reqConnectionID = announceRequest.subarray(0, 8)

      const isSame = Buffer.compare(connectionID, reqConnectionID) === 0
      expect(isSame).toBeTruthy()
    })

    test('bytes 8-11 span announce event code i.e. 1', () => {
      const eventID = announceRequest.readUInt32BE(8)

      const isSame = eventID === 1
      expect(isSame).toBeTruthy()
    })

    test('bytes 12-15 span transactionID', () => {
      const reqTransactionID = announceRequest.subarray(12, 16)

      const isSame = Buffer.compare(transactionID, reqTransactionID) === 0
      expect(isSame).toBeTruthy()
    })

    test('bytes 16-35 span infoHash', () => {
      const reqInfoHash = announceRequest.subarray(16, 36)
      const expectedInfoHash = getInfoHash(metaInfo)

      const isSame = Buffer.compare(expectedInfoHash, reqInfoHash) === 0
      expect(isSame).toBeTruthy()
    })

    test('bytes 36-55 span peerId', () => {
      const reqPeerId = announceRequest.subarray(36, 56)

      const isSame = Buffer.compare(getPeerId(), reqPeerId) === 0
      expect(isSame).toBeTruthy()
    })

    test('bytes 56-63 span number of bytes downloaded i.e. 0', () => {
      const downloaded = announceRequest.readBigUInt64BE(56)

      const isSame = downloaded === BigInt(0)
      expect(isSame).toBeTruthy()
    })

    test('bytes 64-71 span torrent size', () => {
      const torrentSize = getTorrentSize(metaInfo)
      const reqSize = announceRequest.readBigUInt64BE(64)

      const isSame = torrentSize === reqSize
      expect(isSame).toBeTruthy()
    })

    test('bytes 72-79 span number of bytes uploaded i.e. 0', () => {
      const uploaded = announceRequest.readBigUInt64BE(72)

      const isSame = uploaded === BigInt(0)
      expect(isSame).toBeTruthy()
    })

    test('bytes 80-83 span default event i.e. 0', () => {
      const event = announceRequest.readUInt32BE(80)

      const isSame = event === 0
      expect(isSame).toBeTruthy()
    })

    test('bytes 84-87 span ip default address i.e. 0', () => {
      const ip = announceRequest.readUInt32BE(84)

      const isSame = ip === 0
      expect(isSame).toBeTruthy()
    })

    test('bytes 92-95 span num_want i.e. -1', () => {
      const numWant = announceRequest.readInt32BE(92)

      const isSame = numWant === -1
      expect(isSame).toBeTruthy()
    })

    test('bytes 96-97 span socketPort', () => {
      const reqSocketPort = announceRequest.readUInt16BE(96)

      const isSame = socketPort === reqSocketPort
      expect(isSame).toBeTruthy()
    })
  })

  describe('parseAnnounceResponse: parses announce response as per BEP: 15', () => {
    let response: Buffer
    let transactionID: Buffer

    beforeAll(() => {
      transactionID = randomBytes(TRANSACTION_ID_LENGTH)
    })

    test(`throws error if response is shorter than ${ANNOUNCE_RESP_MIN_LENGTH} bytes`, () => {
      response = Buffer.allocUnsafe(ANNOUNCE_RESP_MIN_LENGTH - 1)

      expect(() => parseAnnounceResponse(transactionID, response)).toThrowError(
        `response has size less than ${ANNOUNCE_RESP_MIN_LENGTH} bytes`
      )
    })

    test(`throws error if response type is not of type ${ANNOUNCE_EVENT}`, () => {
      response = Buffer.allocUnsafe(ANNOUNCE_RESP_MIN_LENGTH)

      response.writeUInt32BE(0, 0)

      expect(() => parseAnnounceResponse(transactionID, response)).toThrowError(
        'response does not correspond to a announce request'
      )
    })

    test(`throws error if response does not correspond to given transactionID`, () => {
      response = Buffer.allocUnsafe(ANNOUNCE_RESP_MIN_LENGTH)

      response.writeUInt32BE(1, 0)
      randomBytes(TRANSACTION_ID_LENGTH).copy(response, 4)

      expect(() => parseAnnounceResponse(transactionID, response)).toThrowError(
        'response does not correspond to given transactionID'
      )
    })

    test.each([0, 1, '>1'])(
      'parses valid response having %s peer(s)',
      (numPeers) => {
        if (typeof numPeers === 'string')
          numPeers = Math.ceil((Math.random() + 1) * 2)

        response = Buffer.allocUnsafe(
          ANNOUNCE_RESP_MIN_LENGTH + numPeers * PEER_LENGTH
        )

        response.writeUInt32BE(1, 0)
        transactionID.copy(response, 4)

        const leechers = Math.floor(Math.random() * 10)
        response.writeUInt32BE(leechers, 12)

        const seeders = Math.floor(Math.random() * 10)
        response.writeUInt32BE(seeders, 16)

        const peerBuffer = randomBytes(PEER_LENGTH * numPeers)
        peerBuffer.copy(response, 20)

        const {
          leechers: parsedLeechers,
          seeders: parsedSeeders,
          peers
        } = parseAnnounceResponse(transactionID, response)

        expect(parsedLeechers).toBe(leechers)
        expect(parsedSeeders).toBe(seeders)

        expect(peers.length).toBe(numPeers)

        const parsedPeerBuffer = Buffer.allocUnsafe(numPeers * PEER_LENGTH)
        peers.forEach((peer, idx) => {
          const { ip, port } = peer

          ip.copy(parsedPeerBuffer, idx * PEER_LENGTH)
          parsedPeerBuffer.writeInt16BE(port, idx * PEER_LENGTH + 4)
        })

        const isSame = Buffer.compare(parsedPeerBuffer, peerBuffer) === 0
        expect(isSame).toBeTruthy()
      }
    )
  })
})
