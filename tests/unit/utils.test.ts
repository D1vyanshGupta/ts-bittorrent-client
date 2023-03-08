import { encode } from 'bencode'
import { randomBytes } from 'crypto'

import {
  httpMetaInfoFixture,
  metaInfoNameFixture,
  udpAnnouceUrlFixture,
  bufferHexStringFixture,
  httpAnnounceUrlFixture,
  urlSafeEncodingFixture
} from '../fixtures'

import {
  getUDPAnnounceRequest,
  getUDPConnectionRequest,
  parseUDPAnnounceResponse,
  parseHTTPAnnounceResponse,
  parseUDPConnectionResponse
} from '../../src/tracker-client/utils'

import {
  getInvalidBufferLengthErrorMsg,
  getAnnounceResponseParseErrorMsg,
  getUnableToParsePeerInfoErrorMsg,
  emptyAnnounceResponseErrorMessage,
  getResponseLengthLessThanErrorMsg,
  getUnableDecodeBencodedDataErrorMsg,
  getResponseNotCorrespondEventErrorMsg,
  responseNotCorrespondTransactionErrorMsg
} from '../../src/constants/error-message'

import {
  LEFT_KEY,
  PORT_KEY,
  PROTOCOL,
  COMPACT_KEY,
  PEER_ID_KEY,
  PEER_LENGTH,
  NUM_WANT_KEY,
  UPLOADED_KEY,
  CONNECT_EVENT,
  INFO_HASH_KEY,
  ANNOUNCE_EVENT,
  CONN_ID_LENGTH,
  DOWNLOADED_KEY,
  RESPONSE_STATUS,
  CONN_REQ_MIN_LENGTH,
  DEFAULT_CLIENT_PORT,
  CONN_RESP_MIN_LENGTH,
  TRANSACTION_ID_LENGTH,
  ANNOUNCE_REQ_MIN_LENGTH,
  ANNOUNCE_RESP_MIN_LENGTH,
  BUILD_CONN_REQ_PROTOCOL_ID
} from '../../src/constants/protocol'

import {
  urlEncodeBuffer,
  getURLForAnnounceRequest
} from '../../src/tracker-client/utils'

import { DecodedMetaInfo } from '../../src/types'
import getPeerId from '../../src/tracker-client/peer-id'
import { getInfoHash, getTorrentSize } from '../../src/meta-info'

describe('utils', () => {
  describe('urlEncodeBuffer', () => {
    test('correctly encodes Buffer to protocol-specified url-safe string', () => {
      const buffer = Buffer.from(bufferHexStringFixture, 'hex')
      const escapedString = urlEncodeBuffer(buffer)
      expect(escapedString).toBe(urlSafeEncodingFixture)
    })
  })

  describe('getURLForAnnounceRequest', () => {
    let announceUrl: URL
    const searchParams: { [key: string]: string } = {}

    beforeAll(() => {
      announceUrl = getURLForAnnounceRequest(httpMetaInfoFixture)
      announceUrl.search
        .slice(1)
        .split('&')
        .forEach((searchParam: string): void => {
          const [key, value] = searchParam.split('=')
          searchParams[key] = value
        })
    })

    test('announce url has correct origin', () => {
      expect(announceUrl.origin).toBe(httpAnnounceUrlFixture.origin)
    })

    test('search params have correct info-hash', () => {
      const urlInfoHashHexString = searchParams[INFO_HASH_KEY]
      const expectedInfoHashHexString = urlEncodeBuffer(
        getInfoHash(httpMetaInfoFixture)
      )
      expect(urlInfoHashHexString).toBe(expectedInfoHashHexString)
    })

    test('search params have correct peer-id', () => {
      const urlPeerIdHexString = searchParams[PEER_ID_KEY]
      const expectedPeerIdHexString = urlEncodeBuffer(getPeerId())
      expect(urlPeerIdHexString).toBe(expectedPeerIdHexString)
    })

    test.each([
      [PORT_KEY, DEFAULT_CLIENT_PORT],
      [UPLOADED_KEY, 0],
      [DOWNLOADED_KEY, 0],
      [LEFT_KEY, 0],
      [COMPACT_KEY, 1],
      [NUM_WANT_KEY, -1]
    ])(
      'search params have %p value equal to %p',
      (key: string, value: number) => {
        expect(parseInt(searchParams[key])).toBe(value)
      }
    )
  })

  describe('getUDPConnectionRequest: builds connection request as per BEP: 15', () => {
    let transactionID: Buffer
    let connectionRequest: Buffer

    beforeAll(() => {
      transactionID = randomBytes(TRANSACTION_ID_LENGTH)
      connectionRequest = getUDPConnectionRequest(transactionID)
    })

    test(`connection request is at least ${CONN_REQ_MIN_LENGTH} bytes long`, () => {
      expect(connectionRequest.length >= CONN_REQ_MIN_LENGTH).toBe(true)
    })

    test('bytes 0-7 span protocol defined special constant', () => {
      const requestID = connectionRequest.subarray(0, 8).readBigInt64BE()

      const isSame = requestID === BUILD_CONN_REQ_PROTOCOL_ID
      expect(isSame).toBe(true)
    })

    test('bytes 8-11 span connect event code i.e. 0', () => {
      const eventID = connectionRequest.subarray(8, 12).readInt32BE()

      const isSame = eventID === 0
      expect(isSame).toBe(true)
    })

    test('bytes 12-15 span transactionID', () => {
      const givenTransactionID = connectionRequest.subarray(12)

      const isSame = Buffer.compare(givenTransactionID, transactionID) === 0
      expect(isSame).toBe(true)
    })
  })

  describe('parseUDPConnectionResponse: parses connection response as per BEP 15', () => {
    let transactionID: Buffer
    let response: Buffer

    beforeAll(() => {
      transactionID = randomBytes(TRANSACTION_ID_LENGTH)
    })

    test(`throws error if response is shorter than ${CONN_RESP_MIN_LENGTH} bytes`, () => {
      response = randomBytes(CONN_RESP_MIN_LENGTH - 1)

      expect(() =>
        parseUDPConnectionResponse(transactionID, response)
      ).toThrowError(getResponseLengthLessThanErrorMsg(CONN_RESP_MIN_LENGTH))
    })

    test(`throws error if response type is not of type ${CONNECT_EVENT}`, () => {
      response = randomBytes(CONN_RESP_MIN_LENGTH)

      response.writeUInt32BE(1, 0)

      expect(() =>
        parseUDPConnectionResponse(transactionID, response)
      ).toThrowError(getResponseNotCorrespondEventErrorMsg(CONNECT_EVENT))
    })

    test(`throws error if response does not correspond to given transactionID`, () => {
      response = randomBytes(CONN_RESP_MIN_LENGTH)

      response.writeUInt32BE(0, 0)
      randomBytes(TRANSACTION_ID_LENGTH).copy(response, 4)

      expect(() =>
        parseUDPConnectionResponse(transactionID, response)
      ).toThrowError(responseNotCorrespondTransactionErrorMsg)
    })

    test('parses valid response', () => {
      response = randomBytes(CONN_RESP_MIN_LENGTH)

      response.writeUInt32BE(0, 0)
      transactionID.copy(response, 4)

      const connectionID = randomBytes(CONN_ID_LENGTH)
      connectionID.copy(response, 8)

      const { receiptTime, connectionID: parsedConnectionID } =
        parseUDPConnectionResponse(transactionID, response)

      const isSame = Buffer.compare(connectionID, parsedConnectionID) === 0

      expect(receiptTime > 0).toBe(true)
      expect(isSame).toBe(true)
    })
  })

  describe('getUDPAnnounceRequest: builds announce request as per BEP: 15', () => {
    let socketPort: number
    let connectionID: Buffer
    let transactionID: Buffer
    let announceRequest: Buffer
    let metaInfo: DecodedMetaInfo

    beforeAll(() => {
      socketPort = Math.floor(Math.random() * 10)
      connectionID = randomBytes(CONN_ID_LENGTH)
      transactionID = randomBytes(TRANSACTION_ID_LENGTH)

      const numPieces = Math.ceil((Math.random() + 0.1) * 10)
      const pieceLength = Math.ceil((Math.random() + 1) * 10)
      const pieces = randomBytes(numPieces * pieceLength)

      metaInfo = {
        announce: udpAnnouceUrlFixture.toString(),
        info: {
          name: metaInfoNameFixture,
          pieces,
          'piece length': pieceLength,
          length: pieces.length
        }
      }

      announceRequest = getUDPAnnounceRequest(
        socketPort,
        metaInfo,
        connectionID,
        transactionID
      )
    })

    test(`announce request is at least ${ANNOUNCE_REQ_MIN_LENGTH} bytes long`, () => {
      expect(announceRequest.length >= ANNOUNCE_REQ_MIN_LENGTH).toBe(true)
    })

    test('bytes 0-7 span connectionID', () => {
      const reqConnectionID = announceRequest.subarray(0, 8)

      const isSame = Buffer.compare(connectionID, reqConnectionID) === 0
      expect(isSame).toBe(true)
    })

    test('bytes 8-11 span announce event code i.e. 1', () => {
      const eventID = announceRequest.readUInt32BE(8)

      const isSame = eventID === 1
      expect(isSame).toBe(true)
    })

    test('bytes 12-15 span transactionID', () => {
      const reqTransactionID = announceRequest.subarray(12, 16)

      const isSame = Buffer.compare(transactionID, reqTransactionID) === 0
      expect(isSame).toBe(true)
    })

    test('bytes 16-35 span infoHash', () => {
      const reqInfoHash = announceRequest.subarray(16, 36)
      const expectedInfoHash = getInfoHash(metaInfo)

      const isSame = Buffer.compare(expectedInfoHash, reqInfoHash) === 0
      expect(isSame).toBe(true)
    })

    test('bytes 36-55 span peerId', () => {
      const reqPeerId = announceRequest.subarray(36, 56)

      const isSame = Buffer.compare(getPeerId(), reqPeerId) === 0
      expect(isSame).toBe(true)
    })

    test('bytes 56-63 span number of bytes downloaded i.e. 0', () => {
      const downloaded = announceRequest.readBigUInt64BE(56)

      const isSame = downloaded === BigInt(0)
      expect(isSame).toBe(true)
    })

    test('bytes 64-71 span torrent size', () => {
      const torrentSize = getTorrentSize(metaInfo)
      const reqSize = announceRequest.readBigUInt64BE(64)

      const isSame = torrentSize === reqSize
      expect(isSame).toBe(true)
    })

    test('bytes 72-79 span number of bytes uploaded i.e. 0', () => {
      const uploaded = announceRequest.readBigUInt64BE(72)

      const isSame = uploaded === BigInt(0)
      expect(isSame).toBe(true)
    })

    test('bytes 80-83 span default event i.e. 0', () => {
      const event = announceRequest.readUInt32BE(80)

      const isSame = event === 0
      expect(isSame).toBe(true)
    })

    test('bytes 84-87 span ip default address i.e. 0', () => {
      const ip = announceRequest.readUInt32BE(84)

      const isSame = ip === 0
      expect(isSame).toBe(true)
    })

    test('bytes 92-95 span num_want i.e. -1', () => {
      const numWant = announceRequest.readInt32BE(92)

      const isSame = numWant === -1
      expect(isSame).toBe(true)
    })

    test('bytes 96-97 span socketPort', () => {
      const reqSocketPort = announceRequest.readUInt16BE(96)

      const isSame = socketPort === reqSocketPort
      expect(isSame).toBe(true)
    })
  })

  describe('parseUDPAnnounceResponse: parses announce response as per BEP: 15', () => {
    let response: Buffer
    let transactionID: Buffer

    beforeAll(() => {
      transactionID = randomBytes(TRANSACTION_ID_LENGTH)
    })

    test(`throws error if response is shorter than ${ANNOUNCE_RESP_MIN_LENGTH} bytes`, () => {
      response = randomBytes(ANNOUNCE_RESP_MIN_LENGTH - 1)

      expect(() =>
        parseUDPAnnounceResponse(transactionID, response)
      ).toThrowError(
        getResponseLengthLessThanErrorMsg(ANNOUNCE_RESP_MIN_LENGTH)
      )
    })

    test(`throws error if response type is not of type ${ANNOUNCE_EVENT}`, () => {
      response = randomBytes(ANNOUNCE_RESP_MIN_LENGTH)

      response.writeUInt32BE(0, 0)

      expect(() =>
        parseUDPAnnounceResponse(transactionID, response)
      ).toThrowError(getResponseNotCorrespondEventErrorMsg(ANNOUNCE_EVENT))
    })

    test(`throws error if response does not correspond to given transactionID`, () => {
      response = randomBytes(ANNOUNCE_RESP_MIN_LENGTH)

      response.writeUInt32BE(1, 0)
      randomBytes(TRANSACTION_ID_LENGTH).copy(response, 4)

      expect(() =>
        parseUDPAnnounceResponse(transactionID, response)
      ).toThrowError(responseNotCorrespondTransactionErrorMsg)
    })

    test('throws error if response has incorrect number of bytes for encapsulating peer information', () => {
      response = randomBytes(ANNOUNCE_RESP_MIN_LENGTH + 1)

      response.writeUInt32BE(1, 0)
      transactionID.copy(response, 4)

      const expectedErrorMsg = getUnableToParsePeerInfoErrorMsg(
        getInvalidBufferLengthErrorMsg(PEER_LENGTH)
      )

      expect(() =>
        parseUDPAnnounceResponse(transactionID, response)
      ).toThrowError(expectedErrorMsg)
    })

    test.each([0, 1, '>1'])(
      'parses valid response having %s peer(s)',
      (numPeers: number | string) => {
        if (typeof numPeers === 'string')
          numPeers = Math.ceil((Math.random() + 1) * 2)

        response = randomBytes(
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
          type,
          status,
          leechers: parsedLeechers,
          seeders: parsedSeeders,
          peers: parsedPeers
        } = parseUDPAnnounceResponse(transactionID, response)

        expect(type).toBe(PROTOCOL.UDP)
        expect(status).toBe(RESPONSE_STATUS.SUCCESS)

        expect(parsedLeechers).toBe(leechers)
        expect(parsedSeeders).toBe(seeders)

        expect(parsedPeers.length).toBe(numPeers)

        parsedPeers.forEach((peer, idx) => {
          const { ip: parsedIp, port: parsedPort } = peer

          const peerSubarray = peerBuffer.subarray(
            idx * PEER_LENGTH,
            (idx + 1) * PEER_LENGTH
          )

          const expectedIp = peerSubarray.subarray(0, 4).join('.')
          const expectedPort = peerSubarray.readUInt16BE(4)

          expect(parsedIp).toBe(expectedIp)
          expect(parsedPort).toBe(expectedPort)
        })
      }
    )
  })

  describe('parseHTTPAnnounceResponse', () => {
    test('throws error for empty response', () => {
      const expectedErrorMsg = getAnnounceResponseParseErrorMsg(
        emptyAnnounceResponseErrorMessage
      )
      expect(() => parseHTTPAnnounceResponse(randomBytes(0))).toThrowError(
        expectedErrorMsg
      )
    })

    test('throws error for non-empty non-bencoded response', () => {
      const invalidResponseString = 'invalid-response-string'
      const dataBuffer = Buffer.from(invalidResponseString, 'utf8')

      const expectedBaseErrorMsg = getAnnounceResponseParseErrorMsg(
        getUnableDecodeBencodedDataErrorMsg('')
      )

      try {
        parseHTTPAnnounceResponse(dataBuffer)
      } catch (error) {
        const { message: receivedErrorMsg } = error
        expect(receivedErrorMsg).toContain(expectedBaseErrorMsg)
      }
    })

    test('throws error if `peers` value in binary format has incorrect number of bytes to encapsulate peer information', () => {
      const peerBuffer = randomBytes(PEER_LENGTH - 1)
      const rawResponse = { peers: peerBuffer.toString('hex') }
      const dataBuffer = encode(rawResponse)

      const expectedErrorMsg = getAnnounceResponseParseErrorMsg(
        getUnableToParsePeerInfoErrorMsg(
          getInvalidBufferLengthErrorMsg(PEER_LENGTH)
        )
      )
      expect(() => parseHTTPAnnounceResponse(dataBuffer)).toThrowError(
        expectedErrorMsg
      )
    })

    test('correctly parses failure response', () => {
      const failureReason = 'some-random-failure-reason'
      const rawResponse = {
        'failure reason': Buffer.from(failureReason, 'utf8')
      }

      const dataBuffer = encode(rawResponse)
      const parsedResponse = parseHTTPAnnounceResponse(dataBuffer)

      const { type, status } = parsedResponse
      expect(type).toBe(PROTOCOL.HTTP)
      expect(status).toBe(RESPONSE_STATUS.FAILURE)

      expect(parsedResponse['failure reason']).toBe(failureReason)
    })

    test.each([0, 1, '>1'])(
      'parses valid response having %s peer(s) in binary format',
      (numPeers: number | string) => {
        if (typeof numPeers === 'string')
          numPeers = Math.ceil((Math.random() + 1) * 2)

        const peerBuffer = randomBytes(numPeers * PEER_LENGTH)

        const mockComplete = Math.ceil(Math.random() * 9 + 1)
        const mockIncomplete = Math.ceil(Math.random() * 9 + 1)
        const mockInterval = Math.ceil(Math.random() * 9 + 1)
        const mockMinInterval = mockInterval

        const rawResponse = {
          complete: mockComplete,
          incomplete: mockIncomplete,
          interval: mockInterval,
          'min interval': mockMinInterval,
          peers: peerBuffer
        }

        const dataBuffer = encode(rawResponse)
        const parsedResponse = parseHTTPAnnounceResponse(dataBuffer)

        const { type, status } = parsedResponse
        expect(type).toBe(PROTOCOL.HTTP)
        expect(status).toBe(RESPONSE_STATUS.SUCCESS)

        if (status === RESPONSE_STATUS.SUCCESS) {
          const {
            complete: parsedComplete,
            incomplete: parsedIncomplete,
            interval: parsedInterval,
            peers: parsedPeers
          } = parsedResponse

          const parsedMinInterval = parsedResponse['min interval']

          expect(parsedComplete).toBe(mockComplete)
          expect(parsedIncomplete).toBe(mockIncomplete)
          expect(parsedInterval).toBe(mockInterval)
          expect(parsedMinInterval).toBe(mockMinInterval)

          parsedPeers.forEach((peer, idx) => {
            const { ip: parsedIp, port: parsedPort } = peer

            const peerSubarray = peerBuffer.subarray(
              idx * PEER_LENGTH,
              (idx + 1) * PEER_LENGTH
            )

            const expectedIp = peerSubarray.subarray(0, 4).join('.')
            const expectedPort = peerSubarray.readUInt16BE(4)

            expect(parsedIp).toBe(expectedIp)
            expect(parsedPort).toBe(expectedPort)
          })
        }
      }
    )

    test.each([0, 1, '>1'])(
      'parses valid response having %s peer(s) in dictionary format',
      (numPeers: number | string) => {
        if (typeof numPeers === 'string')
          numPeers = Math.ceil((Math.random() + 1) * 2)

        const mockPeers = Array.from({ length: numPeers }, () => ({
          ip: randomBytes(4).join('.'),
          port: Math.ceil(Math.random() * 9 + 1)
        }))

        const mockComplete = Math.ceil(Math.random() * 9 + 1)
        const mockIncomplete = Math.ceil(Math.random() * 9 + 1)
        const mockInterval = Math.ceil(Math.random() * 9 + 1)
        const mockMinInterval = mockInterval

        const rawResponse = {
          complete: mockComplete,
          incomplete: mockIncomplete,
          interval: mockInterval,
          'min interval': mockMinInterval,
          peers: mockPeers
        }

        const dataBuffer = encode(rawResponse)
        const parsedResponse = parseHTTPAnnounceResponse(dataBuffer)

        const { type, status } = parsedResponse
        expect(type).toBe(PROTOCOL.HTTP)
        expect(status).toBe(RESPONSE_STATUS.SUCCESS)

        if (status === RESPONSE_STATUS.SUCCESS) {
          const {
            complete: parsedComplete,
            incomplete: parsedIncomplete,
            interval: parsedInterval,
            peers: parsedPeers
          } = parsedResponse

          const parsedMinInterval = parsedResponse['min interval']

          expect(parsedComplete).toBe(mockComplete)
          expect(parsedIncomplete).toBe(mockIncomplete)
          expect(parsedInterval).toBe(mockInterval)
          expect(parsedMinInterval).toBe(mockMinInterval)

          parsedPeers.forEach((peer, idx) => {
            const { ip: parsedIp, port: parsedPort } = peer
            const { ip: mockIp, port: mockPort } = mockPeers[idx]

            expect(parsedIp).toBe(mockIp)
            expect(parsedPort).toBe(mockPort)
          })
        }
      }
    )
  })
})
