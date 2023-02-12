import { Socket } from 'dgram'
import { randomBytes } from 'crypto'

import {
  peersFixture,
  metaInfoFixture,
  annouceUrlFixture,
  numSeedersFixture,
  numLeechersFixture,
  connectionIDFixture,
  announceResponseFixture,
  getRequestTimeoutMsMock,
  requestTimeoutMsFixture,
  connectionResponseFixture,
  connectionReceiptTimeFixture,
  connectionIDValidityMsFixture
} from './fixtures'

import { MockSendRequestSignature } from './types'

import {
  CONN_ID_LENGTH,
  MAX_NUM_CLIENT_REQUESTS
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

import {
  DecodedMetaInfo,
  AnnounceResponse,
  ConnectionResponse
} from '../../src/types'

import { TrackerClient } from '../../src/tracker-client'
import { getRequestTimeoutMs } from '../../src/tracker-client/utils'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const utils = require('../../src/tracker-client/utils')

describe('TrackerClient', () => {
  let trackerClient: TrackerClient

  beforeAll(() => {
    trackerClient = new TrackerClient()

    // override default implementation for tests to run faster
    jest
      .spyOn(utils, 'getRequestTimeoutMs')
      .mockImplementation((requestIdx: number): number =>
        getRequestTimeoutMsMock(requestIdx)
      )
  })

  afterAll(() => {
    trackerClient.close()
  })

  describe('sendConnectionRequest', () => {
    let clientSocket: Socket
    let sendUDPDatagramSpy: jest.SpyInstance<void, [URL, Buffer, () => void]>

    beforeAll(() => {
      clientSocket = trackerClient['socket']

      sendUDPDatagramSpy = jest.spyOn(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        trackerClient as any,
        'sendUDPDatagram'
      ) as unknown as jest.SpyInstance<void, [URL, Buffer, () => void]>
    })

    test('throws error if underlying socket is unable to send UDP datagram', async () => {
      const socketErrorMsg = 'some random socket error'
      sendUDPDatagramSpy.mockImplementationOnce(() => {
        throw Error(getSendUDPDatagramErrorMsg(socketErrorMsg))
      })

      const errMsgSendUDPDatagram = getSendUDPDatagramErrorMsg(socketErrorMsg)
      const expectedErrMsg = getConnectionRequestSendErrorMsg(
        errMsgSendUDPDatagram
      )

      await expect(
        trackerClient['sendConnectionRequest'](
          annouceUrlFixture,
          requestTimeoutMsFixture
        )
      ).rejects.toThrow(expectedErrMsg)

      expect(clientSocket.listenerCount('message')).toBe(0)
    })

    test('throws error if connection response is not received within stipulated time', async () => {
      sendUDPDatagramSpy.mockImplementationOnce(
        (_announceUrl: URL, _msgBuffer: Buffer, callBack: () => void): void => {
          callBack()
        }
      )

      const expectedErrMsg = getConnectionRequestTimeoutErrorMsg(
        requestTimeoutMsFixture
      )

      await expect(
        trackerClient['sendConnectionRequest'](
          annouceUrlFixture,
          requestTimeoutMsFixture
        )
      ).rejects.toThrow(expectedErrMsg)

      expect(clientSocket.listenerCount('message')).toBe(0)
    })

    test('throws error if unable to parse connection response correctly', async () => {
      sendUDPDatagramSpy.mockImplementationOnce(
        (_announceUrl: URL, _msgBuffer: Buffer, callBack: () => void): void => {
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
        clientSocket.emit('message', Buffer.allocUnsafe(0))
      }, requestTimeoutMsFixture * Math.random())

      await expect(
        trackerClient['sendConnectionRequest'](
          annouceUrlFixture,
          requestTimeoutMsFixture
        )
      ).rejects.toThrow(expectedErrMsg)

      expect(clientSocket.listenerCount('message')).toBe(0)
    })

    test('returns valid connection response when received within stipulated time', async () => {
      sendUDPDatagramSpy.mockImplementationOnce(
        (_announceUrl: URL, _msgBuffer: Buffer, callBack: () => void): void => {
          callBack()
        }
      )

      jest
        .spyOn(utils, 'parseConnectionResponse')
        .mockImplementationOnce(() => connectionResponseFixture)

      setTimeout(() => {
        clientSocket.emit('message', Buffer.allocUnsafe(0))
      }, requestTimeoutMsFixture * Math.random())

      const { receiptTime, connectionID } = await trackerClient[
        'sendConnectionRequest'
      ](annouceUrlFixture, requestTimeoutMsFixture)

      expect(receiptTime).toBe(connectionReceiptTimeFixture)

      const isSame = Buffer.compare(connectionID, connectionIDFixture) === 0
      expect(isSame).toBe(true)

      expect(clientSocket.listenerCount('message')).toBe(0)
    })
  })

  describe('getConnectionID', () => {
    let sendConnectionRequestSpy: jest.MockedFunction<
      MockSendRequestSignature<URL, ConnectionResponse>
    >

    beforeAll(() => {
      sendConnectionRequestSpy = jest.spyOn(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        trackerClient as any,
        'sendConnectionRequest'
      ) as unknown as jest.MockedFunction<
        MockSendRequestSignature<URL, ConnectionResponse>
      >
    })

    afterEach(() => {
      sendConnectionRequestSpy.mockClear()
    })

    test('implements exponential backoff (as per BEP: 15)', async () => {
      /*
      mock sendConnectionRequest to throw timeoutErrors to test whether
      successive requests are being sent with an exponential backoff or not
      */
      sendConnectionRequestSpy.mockImplementation(
        (_: URL, timeoutMs: number): Promise<ConnectionResponse> => {
          return new Promise((_, reject) => {
            setTimeout(() => {
              const timeoutError =
                getConnectionRequestTimeoutErrorMsg(timeoutMs)
              reject(timeoutError)
            }, timeoutMs)
          })
        }
      )

      const expectedErrMsg =
        getNotReceiveConnectionIDErrorMsg(annouceUrlFixture)
      await expect(
        trackerClient['getConnectionID'](annouceUrlFixture)
      ).rejects.toThrow(expectedErrMsg)

      expect(sendConnectionRequestSpy).toHaveBeenCalledTimes(
        MAX_NUM_CLIENT_REQUESTS
      )

      // array of timeout(Ms) values with whom the (spy)method was invoked
      const timeouts = sendConnectionRequestSpy.mock.calls.map(
        (args: [URL, number]) => args[1]
      )

      /*
      (spy)method was invoked with the correct series of
      exponenitally increasing timeout values
      */
      const areTimeoutsValid = timeouts.reduce(
        (acc: boolean, cur: number, idx: number): boolean =>
          acc && cur === getRequestTimeoutMs(idx),
        true
      )
      expect(areTimeoutsValid).toBe(true)
    })

    test('correctly sets internal state when connection response is received', async () => {
      // mock sendConnectionRequest to provide mockResponse on the first request
      sendConnectionRequestSpy.mockImplementationOnce(
        (_: URL, timeoutMs: number): Promise<ConnectionResponse> => {
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve(connectionResponseFixture)
            }, timeoutMs * Math.random())
          })
        }
      )

      await expect(
        trackerClient['getConnectionID'](annouceUrlFixture)
      ).resolves.not.toThrow()

      expect(sendConnectionRequestSpy).toHaveBeenCalledTimes(1)

      expect(trackerClient['connectionReceiptTime']).toBe(
        connectionReceiptTimeFixture
      )

      const isSame =
        Buffer.compare(trackerClient['connectionID'], connectionIDFixture) === 0
      expect(isSame).toBe(true)
    })
  })

  describe('sendAnnounceRequest', () => {
    let clientSocket: Socket
    let sendUDPDatagramSpy: jest.SpyInstance<void, [URL, Buffer, () => void]>

    beforeAll(() => {
      clientSocket = trackerClient['socket']

      // set connection (details) for trackerClient
      trackerClient.setConnection(randomBytes(CONN_ID_LENGTH), Date.now())

      sendUDPDatagramSpy = jest.spyOn(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        trackerClient as any,
        'sendUDPDatagram'
      ) as unknown as jest.SpyInstance<void, [URL, Buffer, () => void]>
    })

    test('throws error if underlying socket is unable to send UDP datagram', async () => {
      const socketErrorMsg = 'some random socket error'
      sendUDPDatagramSpy.mockImplementationOnce(() => {
        throw Error(getSendUDPDatagramErrorMsg(socketErrorMsg))
      })

      const errMsgSendUDPDatagram = getSendUDPDatagramErrorMsg(socketErrorMsg)
      const expectedErrMsg = getAnnounceRequestSendErrorMsg(
        errMsgSendUDPDatagram
      )

      await expect(
        trackerClient['sendAnnounceRequest'](
          metaInfoFixture,
          requestTimeoutMsFixture
        )
      ).rejects.toThrow(expectedErrMsg)

      expect(clientSocket.listenerCount('message')).toBe(0)
    })

    test('throws error if announce response is not received within stipulated time', async () => {
      sendUDPDatagramSpy.mockImplementationOnce(
        (_announceUrl: URL, _msgBuffer: Buffer, callBack: () => void): void => {
          callBack()
        }
      )

      const expectedErrMsg = getAnnounceRequestTimeoutErrorMsg(
        requestTimeoutMsFixture
      )

      await expect(
        trackerClient['sendAnnounceRequest'](
          metaInfoFixture,
          requestTimeoutMsFixture
        )
      ).rejects.toThrow(expectedErrMsg)

      expect(clientSocket.listenerCount('message')).toBe(0)
    })

    test('throws error if unable to parse announce response correctly', async () => {
      sendUDPDatagramSpy.mockImplementationOnce(
        (_announceUrl: URL, _msgBuffer: Buffer, callBack: () => void): void => {
          callBack()
        }
      )

      const parseErrMsg = 'some random parsing error'
      jest.spyOn(utils, 'parseAnnounceResponse').mockImplementationOnce(() => {
        throw Error(parseErrMsg)
      })

      const expectedErrMsg = getAnnounceResponseParseErrorMsg(parseErrMsg)

      setTimeout(() => {
        clientSocket.emit('message', Buffer.allocUnsafe(0))
      }, requestTimeoutMsFixture * Math.random())

      await expect(
        trackerClient['sendAnnounceRequest'](
          metaInfoFixture,
          requestTimeoutMsFixture
        )
      ).rejects.toThrow(expectedErrMsg)

      expect(clientSocket.listenerCount('message')).toBe(0)
    })

    test('returns valid announce response when received within stipulated time', async () => {
      sendUDPDatagramSpy.mockImplementationOnce(
        (_announceUrl: URL, _msgBuffer: Buffer, callBack: () => void): void => {
          callBack()
        }
      )

      jest
        .spyOn(utils, 'parseAnnounceResponse')
        .mockImplementationOnce(() => announceResponseFixture)

      setTimeout(() => {
        clientSocket.emit('message', Buffer.allocUnsafe(0))
      }, requestTimeoutMsFixture * Math.random())

      const { peers, seeders, leechers } = await trackerClient[
        'sendAnnounceRequest'
      ](metaInfoFixture, requestTimeoutMsFixture)

      expect(peers.length).toBe(peersFixture.length)
      peers.forEach((peer, idx) => {
        const { ip, port } = peer
        const { ip: mockIp, port: mockPort } = peersFixture[idx]

        const isSame = Buffer.compare(ip, mockIp) === 0
        expect(isSame).toBe(true)

        expect(port).toBe(mockPort)
      })

      expect(seeders).toBe(numSeedersFixture)
      expect(leechers).toBe(numLeechersFixture)
    })
  })

  describe('getPeersForTorrent', () => {
    let getConnectionIDSpy: jest.MockedFunction<() => Promise<void>>
    let sendAccounceRequestSpy: jest.MockedFunction<
      MockSendRequestSignature<DecodedMetaInfo, AnnounceResponse>
    >

    beforeAll(() => {
      jest
        .spyOn(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          trackerClient as any,
          'isConnectionIDValid'
        )
        .mockImplementation(() => {
          if (!trackerClient['connectionID']) return false

          const diffMs = Date.now() - trackerClient['connectionReceiptTime']
          return diffMs < connectionIDValidityMsFixture
        })

      getConnectionIDSpy = jest.spyOn(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        trackerClient as any,
        'getConnectionID'
      ) as unknown as jest.MockedFunction<() => Promise<void>>

      sendAccounceRequestSpy = jest.spyOn(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        trackerClient as any,
        'sendAnnounceRequest'
      ) as unknown as jest.MockedFunction<
        MockSendRequestSignature<DecodedMetaInfo, AnnounceResponse>
      >
    })

    beforeEach(() => {
      trackerClient.resetConnection()
    })

    afterEach(() => {
      sendAccounceRequestSpy && sendAccounceRequestSpy.mockClear()
    })

    test('throws error if unable to get connectionID', async () => {
      const mockErrorMsg = 'unable to fetch connectionID'
      getConnectionIDSpy.mockImplementationOnce(() => {
        return Promise.reject(Error(mockErrorMsg))
      })

      const expectedErrorMsg = getConnectionIDFetchErrorMsg(mockErrorMsg)
      await expect(
        trackerClient.getPeersForTorrent(metaInfoFixture)
      ).rejects.toThrow(expectedErrorMsg)
    })

    test('implements exponential backoff (as per BEP: 15) within the timeframe of connectionID being valid', async () => {
      getConnectionIDSpy.mockImplementation((): Promise<void> => {
        trackerClient.setConnection(randomBytes(CONN_ID_LENGTH), Date.now())
        return Promise.resolve()
      })

      /*
      mock sendAccounceRequest to throw timeoutErrors to test whether
      successive requests are being sent with an exponential backoff or not
      */
      sendAccounceRequestSpy.mockImplementation(
        (_: DecodedMetaInfo, timeoutMs: number): Promise<AnnounceResponse> => {
          return new Promise((_, reject) => {
            setTimeout(() => {
              const timeoutError =
                getNotReceiveConnectionIDErrorMsg(annouceUrlFixture)
              reject(timeoutError)
            }, timeoutMs)
          })
        }
      )

      const expectedErrMsg =
        getNotReceiveAnnounceResponseErrorMsg(annouceUrlFixture)

      await expect(
        trackerClient.getPeersForTorrent(metaInfoFixture)
      ).rejects.toThrow(expectedErrMsg)

      expect(sendAccounceRequestSpy).toHaveBeenCalledTimes(
        MAX_NUM_CLIENT_REQUESTS
      )

      // array of timeout(Ms) values with whom the (spy)method was invoked
      const timeouts = sendAccounceRequestSpy.mock.calls.map(
        (args: [DecodedMetaInfo, number]) => args[1]
      )

      /*
      (spy)method was invoked with the correct series of exponenitally
      increasing timeout values, within connectionID validity timeframe.
      */

      // counter to keep track of when subsequence changes monotonicity
      let ctr = 0
      const boolArray = timeouts.map(
        (cur: number, idx: number, arr: number[]): boolean => {
          if (idx === 0) return true
          if (arr[idx - 1] < cur) ctr++
          else ctr = 0
          return cur === getRequestTimeoutMs(ctr)
        }
      )
      const areTimeoutsValid = boolArray.reduce(
        (prev: boolean, cur: boolean): boolean => prev && cur,
        true
      )
      expect(areTimeoutsValid).toBe(true)
    })

    test('returns peer information if announce response received within stipulated time', async () => {
      getConnectionIDSpy.mockImplementation((): Promise<void> => {
        trackerClient.setConnection(randomBytes(CONN_ID_LENGTH), Date.now())
        return Promise.resolve()
      })

      // mock sendAccounceRequestSpy to provide mockResponse on the first request
      sendAccounceRequestSpy.mockImplementationOnce(
        (_: DecodedMetaInfo, timeoutMs: number): Promise<AnnounceResponse> => {
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve(announceResponseFixture)
            }, timeoutMs * Math.random())
          })
        }
      )

      const { peers, seeders, leechers } = await trackerClient[
        'getPeersForTorrent'
      ](metaInfoFixture)

      expect(sendAccounceRequestSpy).toHaveBeenCalledTimes(1)

      expect(peers.length).toBe(peersFixture.length)
      peers.forEach((peer, idx) => {
        const { ip, port } = peer
        const { ip: mockIp, port: mockPort } = peersFixture[idx]

        const isSame = Buffer.compare(ip, mockIp) === 0
        expect(isSame).toBe(true)

        expect(port).toBe(mockPort)
      })

      expect(seeders).toBe(numSeedersFixture)
      expect(leechers).toBe(numLeechersFixture)
    })
  })
})
