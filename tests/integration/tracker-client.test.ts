import { Socket } from 'dgram'
import { randomBytes } from 'crypto'

import { encode } from 'bencode'

import {
  peersFixture,
  intervalFixture,
  numSeedersFixture,
  minIntervalFixture,
  numCompleteFixture,
  numLeechersFixture,
  udpMetaInfoFixture,
  connectionIDFixture,
  httpMetaInfoFixture,
  numIncompleteFixture,
  udpAnnouceUrlFixture,
  requestTimeoutMsFixture,
  connectionResponseFixture,
  getUDPRequestTimeoutMsMock,
  udpAnnounceResponseFixture,
  httpAnnounceResponseFixture,
  connectionReceiptTimeFixture,
  connectionIDValidityMsFixture
} from '../fixtures'

import { MockSendRequestSignature } from './types'

import {
  CONN_ID_LENGTH,
  MAX_NUM_UDP_CLIENT_REQUESTS,
  PROTOCOL,
  RESPONSE_STATUS
} from '../../src/constants/protocol'

import {
  getSendUDPDatagramErrorMsg,
  getConnectionIDFetchErrorMsg,
  getAnnounceRequestSendErrorMsg,
  getAnnounceResponseParseErrorMsg,
  getConnectionRequestSendErrorMsg,
  getAnnounceRequestTimeoutErrorMsg,
  getAnnounceResponseReceiveErrorMsg,
  getConnectionResponseParseErrorMsg,
  getConnectionRequestTimeoutErrorMsg,
  getUnableDecodeBencodedDataErrorMsg,
  getUnableObtainConnectionIDErrorMsg,
  getUnableReceiveAnnounceResponseErrorMsg
} from '../../src/constants/error-message'

import {
  DecodedMetaInfo,
  UDPAnnounceResponse,
  UDPConnectionResponse
} from '../../src/types'

import { TrackerClient } from '../../src/tracker-client'
import { getUDPRequestTimeoutMs } from '../../src/tracker-client/utils'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const utils = require('../../src/tracker-client/utils')

describe('TrackerClient', () => {
  let trackerClient: TrackerClient

  beforeAll(() => {
    trackerClient = new TrackerClient()

    // override default implementation for tests to run faster
    jest
      .spyOn(utils, 'getUDPRequestTimeoutMs')
      .mockImplementation((requestIdx: number): number =>
        getUDPRequestTimeoutMsMock(requestIdx)
      )
  })

  afterAll(() => {
    trackerClient.close()
  })

  describe('sendUDPConnectionRequest', () => {
    let clientSocket: Socket
    let sendUDPDatagramSpy: jest.SpyInstance<void, [URL, Buffer, () => void]>

    beforeAll(() => {
      clientSocket = trackerClient['udpSocket']

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
        trackerClient['sendUDPConnectionRequest'](
          udpAnnouceUrlFixture,
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
        trackerClient['sendUDPConnectionRequest'](
          udpAnnouceUrlFixture,
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
        .spyOn(utils, 'parseUDPConnectionResponse')
        .mockImplementationOnce(() => {
          throw Error(parseErrMsg)
        })

      const expectedErrMsg = getConnectionResponseParseErrorMsg(parseErrMsg)

      setTimeout(() => {
        clientSocket.emit('message', Buffer.allocUnsafe(0))
      }, requestTimeoutMsFixture * Math.random())

      await expect(
        trackerClient['sendUDPConnectionRequest'](
          udpAnnouceUrlFixture,
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
        .spyOn(utils, 'parseUDPConnectionResponse')
        .mockImplementationOnce(() => connectionResponseFixture)

      setTimeout(() => {
        clientSocket.emit('message', Buffer.allocUnsafe(0))
      }, requestTimeoutMsFixture * Math.random())

      const { receiptTime, connectionID } = await trackerClient[
        'sendUDPConnectionRequest'
      ](udpAnnouceUrlFixture, requestTimeoutMsFixture)

      expect(receiptTime).toBe(connectionReceiptTimeFixture)

      const isSame = Buffer.compare(connectionID, connectionIDFixture) === 0
      expect(isSame).toBe(true)

      expect(clientSocket.listenerCount('message')).toBe(0)
    })
  })

  describe('getConnectionIDFromUDPTracker', () => {
    let sendConnectionRequestSpy: jest.MockedFunction<
      MockSendRequestSignature<URL, UDPConnectionResponse>
    >

    beforeAll(() => {
      sendConnectionRequestSpy = jest.spyOn(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        trackerClient as any,
        'sendUDPConnectionRequest'
      ) as unknown as jest.MockedFunction<
        MockSendRequestSignature<URL, UDPConnectionResponse>
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
        (_: URL, timeoutMs: number): Promise<UDPConnectionResponse> => {
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
        getUnableObtainConnectionIDErrorMsg(udpAnnouceUrlFixture)
      await expect(
        trackerClient['getConnectionIDFromUDPTracker'](udpAnnouceUrlFixture)
      ).rejects.toThrow(expectedErrMsg)

      expect(sendConnectionRequestSpy).toHaveBeenCalledTimes(
        MAX_NUM_UDP_CLIENT_REQUESTS
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
          acc && cur === getUDPRequestTimeoutMs(idx),
        true
      )
      expect(areTimeoutsValid).toBe(true)
    })

    test('correctly sets internal state when connection response is received', async () => {
      // mock sendConnectionRequest to provide mockResponse on the first request
      sendConnectionRequestSpy.mockImplementationOnce(
        (_: URL, timeoutMs: number): Promise<UDPConnectionResponse> => {
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve(connectionResponseFixture)
            }, timeoutMs * Math.random())
          })
        }
      )

      await expect(
        trackerClient['getConnectionIDFromUDPTracker'](udpAnnouceUrlFixture)
      ).resolves.not.toThrow()

      expect(sendConnectionRequestSpy).toHaveBeenCalledTimes(1)

      expect(trackerClient['udpConnectionReceiptTime']).toBe(
        connectionReceiptTimeFixture
      )

      const isSame =
        Buffer.compare(
          trackerClient['udpConnectionID'],
          connectionIDFixture
        ) === 0
      expect(isSame).toBe(true)
    })
  })

  describe('sendUDPAnnounceRequest', () => {
    let clientSocket: Socket
    let sendUDPDatagramSpy: jest.SpyInstance<void, [URL, Buffer, () => void]>

    beforeAll(() => {
      clientSocket = trackerClient['udpSocket']

      // set connection (details) for trackerClient
      trackerClient.setUDPConnection(randomBytes(CONN_ID_LENGTH), Date.now())

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
        trackerClient['sendUDPAnnounceRequest'](
          udpMetaInfoFixture,
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
        trackerClient['sendUDPAnnounceRequest'](
          udpMetaInfoFixture,
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
      jest
        .spyOn(utils, 'parseUDPAnnounceResponse')
        .mockImplementationOnce(() => {
          throw Error(parseErrMsg)
        })

      const expectedErrMsg = getAnnounceResponseParseErrorMsg(parseErrMsg)

      setTimeout(() => {
        clientSocket.emit('message', Buffer.allocUnsafe(0))
      }, requestTimeoutMsFixture * Math.random())

      await expect(
        trackerClient['sendUDPAnnounceRequest'](
          udpMetaInfoFixture,
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
        .spyOn(utils, 'parseUDPAnnounceResponse')
        .mockImplementationOnce(() => udpAnnounceResponseFixture)

      setTimeout(() => {
        clientSocket.emit('message', Buffer.allocUnsafe(0))
      }, requestTimeoutMsFixture * Math.random())

      const { peers, seeders, leechers } = await trackerClient[
        'sendUDPAnnounceRequest'
      ](udpMetaInfoFixture, requestTimeoutMsFixture)

      expect(peers.length).toBe(peersFixture.length)
      peers.forEach((peer, idx) => {
        const { ip, port } = peer
        const { ip: mockIp, port: mockPort } = peersFixture[idx]

        expect(ip).toBe(mockIp)
        expect(port).toBe(mockPort)
      })

      expect(seeders).toBe(numSeedersFixture)
      expect(leechers).toBe(numLeechersFixture)
    })
  })

  describe('getPeersForTorrent', () => {
    describe('from UDP Tracker', () => {
      let sendUDPAccounceRequestSpy: jest.MockedFunction<
        MockSendRequestSignature<DecodedMetaInfo, UDPAnnounceResponse>
      >
      let getConnectionIDFromUDPTrackerSpy: jest.MockedFunction<
        () => Promise<void>
      >

      beforeAll(() => {
        jest
          .spyOn(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            trackerClient as any,
            'isUDPConnectionValid'
          )
          .mockImplementation(() => {
            if (!trackerClient['udpConnectionID']) return false

            const diffMs =
              Date.now() - trackerClient['udpConnectionReceiptTime']
            return diffMs < connectionIDValidityMsFixture
          })

        getConnectionIDFromUDPTrackerSpy = jest.spyOn(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          trackerClient as any,
          'getConnectionIDFromUDPTracker'
        ) as unknown as jest.MockedFunction<() => Promise<void>>

        sendUDPAccounceRequestSpy = jest.spyOn(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          trackerClient as any,
          'sendUDPAnnounceRequest'
        ) as unknown as jest.MockedFunction<
          MockSendRequestSignature<DecodedMetaInfo, UDPAnnounceResponse>
        >
      })

      beforeEach(() => {
        trackerClient.resetUDPConnection()
      })

      afterEach(() => {
        sendUDPAccounceRequestSpy && sendUDPAccounceRequestSpy.mockClear()
      })

      test('throws error if unable to get connectionID', async () => {
        const mockErrorMsg = 'unable to fetch connectionID'
        getConnectionIDFromUDPTrackerSpy.mockImplementationOnce(() => {
          return Promise.reject(Error(mockErrorMsg))
        })

        const expectedErrorMsg = getConnectionIDFetchErrorMsg(mockErrorMsg)
        await expect(
          trackerClient.getPeersForTorrent(udpMetaInfoFixture)
        ).rejects.toThrow(expectedErrorMsg)
      })

      test('implements exponential backoff (as per BEP: 15) within the timeframe of connectionID being valid', async () => {
        getConnectionIDFromUDPTrackerSpy.mockImplementation(
          (): Promise<void> => {
            trackerClient.setUDPConnection(
              randomBytes(CONN_ID_LENGTH),
              Date.now()
            )
            return Promise.resolve()
          }
        )

        /*
        mock sendAccounceRequest to throw timeoutErrors to test whether
        successive requests are being sent with an exponential backoff or not
        */
        sendUDPAccounceRequestSpy.mockImplementation(
          (
            _: DecodedMetaInfo,
            timeoutMs: number
          ): Promise<UDPAnnounceResponse> => {
            return new Promise((_, reject) => {
              setTimeout(() => {
                const timeoutError =
                  getUnableObtainConnectionIDErrorMsg(udpAnnouceUrlFixture)
                reject(timeoutError)
              }, timeoutMs)
            })
          }
        )

        const expectedErrMsg =
          getUnableReceiveAnnounceResponseErrorMsg(udpAnnouceUrlFixture)

        await expect(
          trackerClient.getPeersForTorrent(udpMetaInfoFixture)
        ).rejects.toThrow(expectedErrMsg)

        expect(sendUDPAccounceRequestSpy).toHaveBeenCalledTimes(
          MAX_NUM_UDP_CLIENT_REQUESTS
        )

        // array of timeout(Ms) values with whom the (spy)method was invoked
        const timeouts = sendUDPAccounceRequestSpy.mock.calls.map(
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
            return cur === getUDPRequestTimeoutMs(ctr)
          }
        )
        const areTimeoutsValid = boolArray.reduce(
          (prev: boolean, cur: boolean): boolean => prev && cur,
          true
        )
        expect(areTimeoutsValid).toBe(true)
      })

      test('returns peer information if announce response received within stipulated time', async () => {
        getConnectionIDFromUDPTrackerSpy.mockImplementation(
          (): Promise<void> => {
            trackerClient.setUDPConnection(
              randomBytes(CONN_ID_LENGTH),
              Date.now()
            )
            return Promise.resolve()
          }
        )

        // mock sendAccounceRequestSpy to provide mockResponse on the first request
        sendUDPAccounceRequestSpy.mockImplementationOnce(
          (
            _: DecodedMetaInfo,
            timeoutMs: number
          ): Promise<UDPAnnounceResponse> => {
            return new Promise((resolve) => {
              setTimeout(() => {
                resolve(udpAnnounceResponseFixture)
              }, timeoutMs * Math.random())
            })
          }
        )

        const parsedResponse = await trackerClient.getPeersForTorrent(
          udpMetaInfoFixture
        )

        const { type } = parsedResponse

        if (type === PROTOCOL.UDP) {
          const { peers, seeders, leechers } = parsedResponse

          expect(sendUDPAccounceRequestSpy).toHaveBeenCalledTimes(1)

          expect(peers.length).toBe(peersFixture.length)
          peers.forEach((peer, idx) => {
            const { ip, port } = peer
            const { ip: mockIp, port: mockPort } = peersFixture[idx]

            expect(ip).toBe(mockIp)
            expect(port).toBe(mockPort)
          })

          expect(seeders).toBe(numSeedersFixture)
          expect(leechers).toBe(numLeechersFixture)
        }
      })
    })

    describe('from HTTP Tracker', () => {
      let httpClientGetRequestSpy: jest.MockedFunction<(url: string) => string>

      beforeAll(() => {
        httpClientGetRequestSpy = jest.spyOn(
          trackerClient['httpClient'],
          'get'
        ) as unknown as jest.MockedFunction<(url: string) => string>
      })

      test('throws error if the HTTP request fails', async () => {
        const httpGetRequestError = 'some-random-http-error'

        httpClientGetRequestSpy.mockImplementationOnce(() => {
          throw Error(httpGetRequestError)
        })

        const expectedErrorMsg =
          getAnnounceResponseReceiveErrorMsg(httpGetRequestError)

        await expect(
          trackerClient.getPeersForTorrent(httpMetaInfoFixture)
        ).rejects.toThrow(expectedErrorMsg)
      })

      test('throws error if unable to parse invalid response', async () => {
        const invalidResponseString = 'invalid-response-string'

        httpClientGetRequestSpy.mockImplementationOnce(() => {
          return invalidResponseString
        })

        const expectedBaseErrorMsg = getAnnounceResponseReceiveErrorMsg(
          getAnnounceResponseParseErrorMsg(
            getUnableDecodeBencodedDataErrorMsg('')
          )
        )

        try {
          await trackerClient.getPeersForTorrent(httpMetaInfoFixture)
        } catch (error) {
          const { message: receivedErrorMsg } = error
          expect(receivedErrorMsg).toContain(expectedBaseErrorMsg)
        }
      })

      test('returns peer information if announce response is valid', async () => {
        const bencodedString = encode(httpAnnounceResponseFixture).toString(
          'utf8'
        )

        httpClientGetRequestSpy.mockImplementationOnce(() => {
          return bencodedString
        })

        const parsedResponse = await trackerClient.getPeersForTorrent(
          httpMetaInfoFixture
        )

        const { type, status } = parsedResponse

        if (type === PROTOCOL.HTTP && status === RESPONSE_STATUS.SUCCESS) {
          const { complete, incomplete, interval, peers } = parsedResponse
          const minInterval = parsedResponse['min interval']

          expect(peers.length).toBe(peersFixture.length)
          peers.forEach((peer, idx) => {
            const { ip, port } = peer
            const { ip: mockIp, port: mockPort } = peersFixture[idx]

            expect(ip).toBe(mockIp)
            expect(port).toBe(mockPort)
          })

          expect(complete).toBe(numCompleteFixture)
          expect(incomplete).toBe(numIncompleteFixture)
          expect(interval).toBe(intervalFixture)
          expect(minInterval).toBe(minIntervalFixture)
        }
      })
    })
  })
})
