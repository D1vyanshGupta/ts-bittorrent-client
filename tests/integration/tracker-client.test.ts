import { randomBytes } from 'crypto'
import { Socket, createSocket } from 'dgram'

import {
  metaInfoFixture,
  timeoutMsFixture,
  annouceUrlFixture,
  announceMaxNumRequestsFixture,
  connectionIDValidityMsFixture,
  connectionIDMaxNumRequestsFixture
} from './fixtures'

import { MockSocketSendSignature } from './types'

import {
  CONN_ID_LENGTH,
  CONN_RESP_MIN_LENGTH,
  CONNECTION_ID_VALIDITY_MS
} from '../../src/constants/protocol'

import {
  getSendUDPDatagramErrorMsg,
  getConnectionIDFetchErrorMsg,
  getAnnounceRequestSendErrorMsg,
  getAnnounceResponseParseErrorMsg,
  getConnectionRequestSendErrorMsg,
  getNotReceiveConnectionIDErrorMsg,
  getAnnounceRequestTimeoutErrorMsg,
  getConnectionResponseParseErrorMsg,
  getConnectionRequestTimeoutErrorMsg,
  getNotReceiveAnnounceResponseErrorMsg
} from '../../src/constants/error-message'

import { UDPTrackerClient } from '../../src/tracker-client'
import { getRequestTimeoutMs } from '../../src/tracker-client/utils'
import { AnnounceResponse, ConnectionResponse } from '../../src/types'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const utils = require('../../src/tracker-client/utils')

describe('UDPTrackerClient', () => {
  let socket: Socket
  let trackerClient: UDPTrackerClient

  beforeAll(() => {
    socket = createSocket('udp4')
    trackerClient = new UDPTrackerClient(socket)
  })

  afterAll(() => {
    socket.close()
  })

  describe('sendConnectionRequest', () => {
    let socketSendSpy: jest.MockedFunction<MockSocketSendSignature>

    beforeAll(() => {
      socketSendSpy = jest.spyOn(
        socket,
        'send'
      ) as unknown as jest.MockedFunction<MockSocketSendSignature>
    })

    afterEach(() => {
      jest.restoreAllMocks()
    })

    test('throws error if underlying socket is unable to send UDP datagram', async () => {
      const socketErrorMsg = 'some random socket error'
      socketSendSpy.mockImplementationOnce(() => {
        throw Error(socketErrorMsg)
      })

      const errMsgSendUDPDatagram = getSendUDPDatagramErrorMsg(socketErrorMsg)
      const expectedErrMsg = getConnectionRequestSendErrorMsg(
        errMsgSendUDPDatagram
      )

      await expect(
        trackerClient['sendConnectionRequest'](
          annouceUrlFixture,
          timeoutMsFixture
        )
      ).rejects.toThrow(expectedErrMsg)

      expect(socket.listenerCount('message')).toBe(0)
    })

    test('throws error if connection response is not received within stipulated time', async () => {
      socketSendSpy.mockImplementationOnce(
        (
          _msg: Buffer,
          _offset: number,
          _length: number,
          _port: number,
          _address: string,
          callBack: () => void
        ): void => {
          callBack()
        }
      )

      const expectedErrMsg =
        getConnectionRequestTimeoutErrorMsg(timeoutMsFixture)

      await expect(
        trackerClient['sendConnectionRequest'](
          annouceUrlFixture,
          timeoutMsFixture
        )
      ).rejects.toThrow(expectedErrMsg)

      expect(socket.listenerCount('message')).toBe(0)
    })

    test('throws error if unable to parse connection response correctly', async () => {
      socketSendSpy.mockImplementationOnce(
        (
          _msg: Buffer,
          _offset: number,
          _length: number,
          _port: number,
          _address: string,
          callBack: () => void
        ): void => {
          callBack()
        }
      )

      const parseErrMsg = 'some random parsing error'
      jest
        .spyOn(utils, 'parseConnectionResponse')
        .mockImplementationOnce(() => {
          throw Error(parseErrMsg)
        })

      const expectedErrMsg = getConnectionResponseParseErrorMsg(parseErrMsg)

      setTimeout(() => {
        socket.emit('message', Buffer.allocUnsafe(0))
      }, timeoutMsFixture * Math.random())

      await expect(
        trackerClient['sendConnectionRequest'](
          annouceUrlFixture,
          timeoutMsFixture
        )
      ).rejects.toThrow(expectedErrMsg)

      expect(socket.listenerCount('message')).toBe(0)
    })

    test('returns valid connection response when received within stipulated time', async () => {
      socketSendSpy.mockImplementationOnce(
        (
          _msg: Buffer,
          _offset: number,
          _length: number,
          _port: number,
          _address: string,
          callBack: () => void
        ): void => {
          callBack()
        }
      )

      const mockReceiptTime = Date.now()
      const mockConnectionID = randomBytes(CONN_RESP_MIN_LENGTH)

      const mockResponse: ConnectionResponse = {
        receiptTime: mockReceiptTime,
        connectionID: mockConnectionID
      }

      jest
        .spyOn(utils, 'parseConnectionResponse')
        .mockImplementationOnce(() => mockResponse)

      setTimeout(() => {
        socket.emit('message', Buffer.allocUnsafe(0))
      }, timeoutMsFixture / 2)

      const { receiptTime, connectionID } = await trackerClient[
        'sendConnectionRequest'
      ](annouceUrlFixture, timeoutMsFixture)

      expect(receiptTime).toBe(mockReceiptTime)

      const isSame = Buffer.compare(connectionID, mockConnectionID) === 0
      expect(isSame).toBe(true)

      expect(socket.listenerCount('message')).toBe(0)
    })
  })

  describe('getConnectionID', () => {
    let socketSendSpy: jest.MockedFunction<MockSocketSendSignature>

    beforeAll(() => {
      jest
        .spyOn(utils, 'getRequestTimeoutMs')
        .mockImplementation(
          (requestIdx: number): number => 100 * 2 ** requestIdx
        )

      socketSendSpy = jest.spyOn(
        socket,
        'send'
      ) as unknown as jest.MockedFunction<MockSocketSendSignature>
    })

    afterAll(() => {
      jest.restoreAllMocks()
    })

    test('implements exponential backoff (as per BEP: 15)', async () => {
      const requestTimestamps: number[] = []

      socketSendSpy.mockImplementation(
        (
          _msg: Buffer,
          _offset: number,
          _length: number,
          _port: number,
          _address: string,
          callBack: () => void
        ): void => {
          // record the timestamp when connection request is being sent
          requestTimestamps.push(Date.now())

          callBack()
        }
      )

      const expectedErrMsg =
        getNotReceiveConnectionIDErrorMsg(annouceUrlFixture)
      await expect(
        trackerClient['getConnectionID'](
          annouceUrlFixture,
          connectionIDMaxNumRequestsFixture
        )
      ).rejects.toThrow(expectedErrMsg)

      expect(socket.listenerCount('message')).toBe(0)

      expect(socketSendSpy).toHaveBeenCalledTimes(
        connectionIDMaxNumRequestsFixture
      )

      const expectedTimeouts = Array.from({
        length: connectionIDMaxNumRequestsFixture - 1
      }).map((_, idx) => getRequestTimeoutMs(idx))

      const actualTimeouts = requestTimestamps
        .slice(1)
        .map((timestamp, idx) => timestamp - requestTimestamps[idx])

      /*
      timeout interval for `setTimeout` only provides a lower bound for the time
      interval after which the callback is invoked.

      therefore, expected timeout <= actualTimeout
      */

      const expectedLTEActual = actualTimeouts.reduce(
        (prev, cur, idx) => prev && expectedTimeouts[idx] <= cur,
        true
      )
      expect(expectedLTEActual).toBe(true)

      /*
      actual timeout intervals should be monotonically increasing
      */

      const isMonotonic = actualTimeouts.reduce(
        (prev, cur, idx, arr) => prev && (idx === 0 || arr[idx - 1] < cur),
        true
      )

      expect(isMonotonic).toBe(true)
    })

    test('correctly sets internal state when connection response is received', async () => {
      setTimeout(() => {
        socket.emit('message', Buffer.allocUnsafe(0))
      }, timeoutMsFixture)

      const mockReceiptTime: number = Date.now()
      const mockConnectionID: Buffer = randomBytes(CONN_ID_LENGTH)
      const mockResponse: ConnectionResponse = {
        receiptTime: mockReceiptTime,
        connectionID: mockConnectionID
      }

      jest
        .spyOn(utils, 'parseConnectionResponse')
        .mockImplementationOnce(() => mockResponse)

      socketSendSpy.mockImplementationOnce(
        (
          _msg: Buffer,
          _offset: number,
          _length: number,
          _port: number,
          _address: string,
          callBack: () => void
        ): void => {
          callBack()
        }
      )

      await expect(
        trackerClient['getConnectionID'](annouceUrlFixture)
      ).resolves.not.toThrow()

      expect(socket.listenerCount('message')).toBe(0)

      expect(trackerClient['connectionReceiptTime']).toBe(mockReceiptTime)

      const isSame =
        Buffer.compare(trackerClient['connectionID'], mockConnectionID) === 0
      expect(isSame).toBe(true)
    })
  })

  describe('isConnectionIDValid', () => {
    beforeEach(() => {
      // reset connectionID related state for tracker client
      trackerClient['connectionID'] = undefined
      trackerClient['connectionReceiptTime'] = undefined
    })

    test('returns false if trackerClient has no connectionID', () => {
      expect(trackerClient['isConnectionIDValid']()).toBe(false)
    })

    test('returns false if connectionID has expired', () => {
      trackerClient['connectionID'] = randomBytes(CONN_ID_LENGTH)
      trackerClient['connectionReceiptTime'] =
        Date.now() - CONNECTION_ID_VALIDITY_MS

      expect(trackerClient['isConnectionIDValid']()).toBe(false)
    })

    test('returns true if connectionID is valid', () => {
      trackerClient['connectionID'] = randomBytes(CONN_ID_LENGTH)
      trackerClient['connectionReceiptTime'] =
        Date.now() - CONNECTION_ID_VALIDITY_MS / 2

      expect(trackerClient['isConnectionIDValid']()).toBe(true)
    })
  })

  describe('sendAnnounceRequest', () => {
    let socketSendSpy: jest.MockedFunction<MockSocketSendSignature>

    beforeAll(() => {
      // set connectionID for trackerClient
      trackerClient['connectionID'] = randomBytes(CONN_ID_LENGTH)

      socketSendSpy = jest.spyOn(
        socket,
        'send'
      ) as unknown as jest.MockedFunction<MockSocketSendSignature>
    })

    afterEach(() => {
      jest.restoreAllMocks()
    })

    test('throws error if underlying socket is unable to send UDP datagram', async () => {
      const socketErrorMsg = 'some random socket error'
      socketSendSpy.mockImplementationOnce(() => {
        throw Error(socketErrorMsg)
      })

      const errMsgSendUDPDatagram = getSendUDPDatagramErrorMsg(socketErrorMsg)
      const expectedErrMsg = getAnnounceRequestSendErrorMsg(
        errMsgSendUDPDatagram
      )

      await expect(
        trackerClient['sendAnnounceRequest'](metaInfoFixture, timeoutMsFixture)
      ).rejects.toThrow(expectedErrMsg)

      expect(socket.listenerCount('message')).toBe(0)
    })

    test('throws error if announce response is not received within stipulated time', async () => {
      socketSendSpy.mockImplementationOnce(
        (
          _msg: Buffer,
          _offset: number,
          _length: number,
          _port: number,
          _address: string,
          callBack: () => void
        ): void => {
          callBack()
        }
      )

      const expectedErrMsg = getAnnounceRequestTimeoutErrorMsg(timeoutMsFixture)

      await expect(
        trackerClient['sendAnnounceRequest'](metaInfoFixture, timeoutMsFixture)
      ).rejects.toThrow(expectedErrMsg)

      expect(socket.listenerCount('message')).toBe(0)
    })

    test('throws error if unable to parse announce response correctly', async () => {
      socketSendSpy.mockImplementationOnce(
        (
          _msg: Buffer,
          _offset: number,
          _length: number,
          _port: number,
          _address: string,
          callBack: () => void
        ): void => {
          callBack()
        }
      )

      const parseErrMsg = 'some random parsing error'
      jest.spyOn(utils, 'parseAnnounceResponse').mockImplementationOnce(() => {
        throw Error(parseErrMsg)
      })

      const expectedErrMsg = getAnnounceResponseParseErrorMsg(parseErrMsg)

      setTimeout(() => {
        socket.emit('message', Buffer.allocUnsafe(0))
      }, timeoutMsFixture * Math.random())

      await expect(
        trackerClient['sendAnnounceRequest'](metaInfoFixture, timeoutMsFixture)
      ).rejects.toThrow(expectedErrMsg)

      expect(socket.listenerCount('message')).toBe(0)
    })

    test('returns valid announce response when received within stipulated time', async () => {
      socketSendSpy.mockImplementationOnce(
        (
          _msg: Buffer,
          _offset: number,
          _length: number,
          _port: number,
          _address: string,
          callBack: () => void
        ): void => {
          callBack()
        }
      )

      const mockPeers = [{ ip: Buffer.allocUnsafe(0), port: 0 }]
      const mockNumSeeders = Math.random()
      const mockNumLeechers = Math.random()

      const mockResponse: AnnounceResponse = {
        peers: mockPeers,
        seeders: mockNumSeeders,
        leechers: mockNumLeechers
      }

      jest
        .spyOn(utils, 'parseAnnounceResponse')
        .mockImplementationOnce(() => mockResponse)

      setTimeout(() => {
        socket.emit('message', Buffer.allocUnsafe(0))
      }, timeoutMsFixture / 2)

      const { peers, seeders, leechers } = await trackerClient[
        'sendAnnounceRequest'
      ](metaInfoFixture, timeoutMsFixture)

      expect(peers.length).toBe(mockPeers.length)
      peers.forEach((peer, idx) => {
        const { ip, port } = peer
        const { ip: mockIp, port: mockPort } = mockPeers[idx]

        const isSame = Buffer.compare(ip, mockIp) === 0
        expect(isSame).toBe(true)

        expect(port).toBe(mockPort)
      })

      expect(seeders).toBe(mockNumSeeders)
      expect(leechers).toBe(mockNumLeechers)
    })
  })

  describe('getPeersForTorrent', () => {
    beforeEach(() => {
      // reset connectionID related state for tracker client
      trackerClient['connectionID'] = undefined
      trackerClient['connectionReceiptTime'] = undefined
    })

    afterEach(() => {
      jest.restoreAllMocks()
    })

    test('throws error if unable to get connectionID', async () => {
      const mockErrorMsg = 'unable to fetch connectionID'

      jest
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .spyOn(trackerClient as any, 'getConnectionID')
        .mockImplementationOnce(() => {
          return Promise.reject(Error(mockErrorMsg))
        })

      const expectedErrorMsg = getConnectionIDFetchErrorMsg(mockErrorMsg)
      await expect(
        trackerClient.getPeersForTorrent(
          metaInfoFixture,
          announceMaxNumRequestsFixture
        )
      ).rejects.toThrow(expectedErrorMsg)
    })

    test('implements exponential backoff (as per BEP: 15) within the timeframe of connectionID being valid', async () => {
      jest
        .spyOn(utils, 'getRequestTimeoutMs')
        .mockImplementation(
          (requestIdx: number): number => 100 * 2 ** requestIdx
        )

      jest
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .spyOn(trackerClient as any, 'isConnectionIDValid')
        .mockImplementation(() => {
          if (!trackerClient['connectionID']) return false

          const diffMs = Date.now() - trackerClient['connectionReceiptTime']
          return diffMs < connectionIDValidityMsFixture
        })

      const numAnnounceInTimeframe = Math.floor(
        Math.log2(connectionIDValidityMsFixture / 100 + 1) + 1
      )

      /*
      when connectionID expires, requestIdx for exponential backoff resets to 0,
      each expiry event has corresponding list of announce request timestamps
      */
      let requestTimestamps: number[]
      const requestTimestampsList: number[][] = []

      jest
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .spyOn(trackerClient as any, 'getConnectionID')
        .mockImplementation(() => {
          trackerClient['connectionID'] = randomBytes(CONN_ID_LENGTH)
          trackerClient['connectionReceiptTime'] = Date.now()

          /*
          reset when new connectionID is being obtained,
          i.e. previous connectionID expired
          */
          requestTimestamps = []
          requestTimestampsList.push(requestTimestamps)

          return Promise.resolve()
        })

      const socketSendSpy = jest.spyOn(
        socket,
        'send'
      ) as unknown as jest.MockedFunction<MockSocketSendSignature>

      socketSendSpy.mockImplementation(
        (
          _msg: Buffer,
          _offset: number,
          _length: number,
          _port: number,
          _address: string,
          callBack: () => void
        ): void => {
          // record the timestamp when announce request is being sent
          requestTimestamps.push(Date.now())

          callBack()
        }
      )

      const expectedErrMsg =
        getNotReceiveAnnounceResponseErrorMsg(annouceUrlFixture)

      await expect(
        trackerClient.getPeersForTorrent(
          metaInfoFixture,
          announceMaxNumRequestsFixture
        )
      ).rejects.toThrow(expectedErrMsg)

      expect(socket.listenerCount('message')).toBe(0)
      expect(socketSendSpy).toHaveBeenCalledTimes(announceMaxNumRequestsFixture)

      const expectedTimeouts = Array.from({
        length: numAnnounceInTimeframe - 1
      }).map((_, idx) => getRequestTimeoutMs(idx))

      requestTimestampsList.forEach((requestTimestamps) => {
        const actualTimeouts = requestTimestamps
          .slice(1)
          .map((timestamp, idx) => timestamp - requestTimestamps[idx])

        /*
        timeout interval for `setTimeout` only provides a lower bound for the time
        interval after which the callback is invoked.

        therefore, expected timeout <= actualTimeout
        */
        const expectedLTEActual = actualTimeouts.reduce(
          (prev, cur, idx) => prev && expectedTimeouts[idx] <= cur,
          true
        )
        expect(expectedLTEActual).toBe(true)

        /*
        actual timeout intervals should be monotonically increasing
        */

        const isMonotonic = actualTimeouts.reduce(
          (prev, cur, idx, arr) => prev && (idx === 0 || arr[idx - 1] < cur),
          true
        )

        expect(isMonotonic).toBe(true)
      })
    })

    test('returns valid announce response when received within stipulated time', async () => {
      const socketSendSpy = jest.spyOn(
        socket,
        'send'
      ) as unknown as jest.MockedFunction<MockSocketSendSignature>

      socketSendSpy.mockImplementation(
        (
          _msg: Buffer,
          _offset: number,
          _length: number,
          _port: number,
          _address: string,
          callBack: () => void
        ): void => {
          callBack()
        }
      )

      jest
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .spyOn(trackerClient as any, 'getConnectionID')
        .mockImplementation(() => {
          trackerClient['connectionID'] = randomBytes(CONN_ID_LENGTH)
          trackerClient['connectionReceiptTime'] = Date.now()

          return Promise.resolve()
        })

      const mockPeers = [{ ip: Buffer.allocUnsafe(0), port: 0 }]
      const mockNumSeeders = Math.random()
      const mockNumLeechers = Math.random()

      const mockResponse: AnnounceResponse = {
        peers: mockPeers,
        seeders: mockNumSeeders,
        leechers: mockNumLeechers
      }
      jest
        .spyOn(utils, 'parseAnnounceResponse')
        .mockImplementationOnce(() => mockResponse)

      setTimeout(() => {
        socket.emit('message', Buffer.allocUnsafe(0))
      }, timeoutMsFixture / 2)

      const { peers, seeders, leechers } =
        await trackerClient.getPeersForTorrent(
          metaInfoFixture,
          announceMaxNumRequestsFixture
        )

      expect(peers.length).toBe(mockPeers.length)
      peers.forEach((peer, idx) => {
        const { ip, port } = peer
        const { ip: mockIp, port: mockPort } = mockPeers[idx]

        const isSame = Buffer.compare(ip, mockIp) === 0
        expect(isSame).toBe(true)

        expect(port).toBe(mockPort)
      })

      expect(seeders).toBe(mockNumSeeders)
      expect(leechers).toBe(mockNumLeechers)
    })
  })
})
