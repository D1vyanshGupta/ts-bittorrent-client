import { randomBytes } from 'crypto'
import { Socket, createSocket } from 'dgram'

import { HTTPClient } from './http-client'

import {
  getUDPAnnounceRequest,
  getUDPRequestTimeoutMs,
  getUDPConnectionRequest,
  getURLForAnnounceRequest,
  parseUDPAnnounceResponse,
  parseHTTPAnnounceResponse,
  parseUDPConnectionResponse
} from './utils'

import {
  PROTOCOL,
  DEFAULT_CLIENT_PORT,
  TRANSACTION_ID_LENGTH,
  CONNECTION_ID_VALIDITY_MS,
  MAX_NUM_UDP_CLIENT_REQUESTS
} from '../constants/protocol'

import {
  getSendUDPDatagramErrorMsg,
  getConnectionIDFetchErrorMsg,
  getAnnounceRequestSendErrorMsg,
  getAnnounceResponseParseErrorMsg,
  getConnectionRequestSendErrorMsg,
  getAnnounceRequestTimeoutErrorMsg,
  getAnnounceResponseReceiveErrorMsg,
  getConnectionResponseParseErrorMsg,
  invalidAnnounceUrlProtocolErrorMsg,
  getConnectionRequestTimeoutErrorMsg,
  getUnableObtainConnectionIDErrorMsg,
  getUnableReceiveAnnounceResponseErrorMsg
} from '../constants/error-message'

import {
  DecodedMetaInfo,
  UDPAnnounceResponse,
  HTTPAnnounceResponse,
  UDPConnectionResponse
} from '../types'

import { logger } from '../logging'

export class TrackerClient {
  private readonly socketPort: number
  private readonly httpClient: HTTPClient = new HTTPClient()
  private readonly udpSocket: Socket = createSocket('udp4')

  private udpConnectionID: Buffer
  private udpConnectionReceiptTime: number

  constructor(socketPort = DEFAULT_CLIENT_PORT) {
    this.socketPort = socketPort

    this.udpSocket.bind(this.socketPort)
  }

  setUDPConnection(connectionID: Buffer, connectionReceiptTime: number) {
    this.udpConnectionID = connectionID
    this.udpConnectionReceiptTime = connectionReceiptTime
  }

  resetUDPConnection(): void {
    this.udpConnectionID = undefined
    this.udpConnectionReceiptTime = undefined
  }

  close(): void {
    this.udpSocket.close()
  }

  private sendUDPDatagram(
    announceUrl: URL,
    msgBuffer: Buffer,
    callBack: (any) => void
  ): void {
    try {
      this.udpSocket.send(
        msgBuffer,
        0,
        msgBuffer.length,
        +announceUrl.port || DEFAULT_CLIENT_PORT,
        announceUrl.hostname,
        callBack
      )
    } catch (error) {
      throw Error(getSendUDPDatagramErrorMsg(error.message))
    }
  }

  private sendUDPConnectionRequest(
    announceUrl: URL,
    timeoutMs: number
  ): Promise<UDPConnectionResponse> {
    return new Promise((resolve, reject) => {
      const transactionID = randomBytes(TRANSACTION_ID_LENGTH)
      const connectionRequest = getUDPConnectionRequest(transactionID)

      try {
        this.sendUDPDatagram(announceUrl, connectionRequest, (): void => {
          logger.info(
            `sent connection request to ${announceUrl} at ${new Date().toISOString()}`
          )

          const callback = (response: Buffer): void => {
            try {
              clearTimeout(timer)
              const connectionResponse = parseUDPConnectionResponse(
                transactionID,
                response
              )
              resolve(connectionResponse)
            } catch (error) {
              const parseError = Error(
                getConnectionResponseParseErrorMsg(error.message)
              )
              reject(parseError)
            }
          }

          const timer = setTimeout(async (): Promise<void> => {
            const error = Error(getConnectionRequestTimeoutErrorMsg(timeoutMs))
            this.udpSocket.removeListener('message', callback)
            reject(error)
          }, timeoutMs)

          this.udpSocket.once('message', callback)
        })
      } catch (error) {
        const requestError = Error(
          getConnectionRequestSendErrorMsg(error.message)
        )
        reject(requestError)
      }
    })
  }

  private async getConnectionIDFromUDPTracker(announceUrl: URL): Promise<void> {
    let requestIdx = 0

    // exponential backoff for fetching connection ID, as per BEP: 15
    // eslint-disable-next-line no-loops/no-loops
    while (requestIdx < MAX_NUM_UDP_CLIENT_REQUESTS) {
      const timeoutMs = getUDPRequestTimeoutMs(requestIdx)
      try {
        const { connectionID, receiptTime } =
          await this.sendUDPConnectionRequest(announceUrl, timeoutMs)

        this.setUDPConnection(connectionID, receiptTime)

        logger.info(
          `received connection response at ${new Date(
            receiptTime
          ).toISOString()}`
        )
        break
      } catch (error) {
        logger.error(error.message)
      }

      requestIdx++
    }

    if (requestIdx === MAX_NUM_UDP_CLIENT_REQUESTS)
      throw Error(getUnableObtainConnectionIDErrorMsg(announceUrl))
  }

  private isUDPConnectionValid(): boolean {
    if (!this.udpConnectionID) return false

    const diffMs = Date.now() - this.udpConnectionReceiptTime
    return diffMs < CONNECTION_ID_VALIDITY_MS
  }

  private sendUDPAnnounceRequest(
    metaInfo: DecodedMetaInfo,
    timeoutMs: number
  ): Promise<UDPAnnounceResponse> {
    return new Promise((resolve, reject) => {
      const transactionID = randomBytes(TRANSACTION_ID_LENGTH)
      const announceRequest = getUDPAnnounceRequest(
        this.socketPort,
        metaInfo,
        this.udpConnectionID,
        transactionID
      )

      try {
        const announceUrl = new URL(metaInfo.announce)

        this.sendUDPDatagram(announceUrl, announceRequest, (): void => {
          logger.info(
            `sent announce request to ${announceUrl} at ${new Date().toISOString()}`
          )

          const callback = (response: Buffer): void => {
            try {
              clearTimeout(timer)
              const announceResponse = parseUDPAnnounceResponse(
                transactionID,
                response
              )
              resolve(announceResponse)
            } catch (error) {
              const parseError = Error(
                getAnnounceResponseParseErrorMsg(error.message)
              )
              reject(parseError)
            }
          }

          const timer = setTimeout((): void => {
            const timeoutError = Error(
              getAnnounceRequestTimeoutErrorMsg(timeoutMs)
            )

            this.udpSocket.removeListener('message', callback)
            reject(timeoutError)
          }, timeoutMs)

          this.udpSocket.once('message', callback)
        })
      } catch (error) {
        const requestError = Error(
          getAnnounceRequestSendErrorMsg(error.message)
        )
        reject(requestError)
      }
    })
  }

  private async getPeersFromUDPTracker(
    metaInfo: DecodedMetaInfo
  ): Promise<UDPAnnounceResponse> {
    let requestIdx = 0
    let numRequests = 0

    const announceUrl = new URL(metaInfo.announce)

    // exponential backoff, as per BEP: 15
    // eslint-disable-next-line no-loops/no-loops
    while (numRequests < MAX_NUM_UDP_CLIENT_REQUESTS) {
      if (!this.isUDPConnectionValid()) {
        await this.getConnectionIDFromUDPTracker(announceUrl).catch((error) => {
          throw Error(getConnectionIDFetchErrorMsg(error.message))
        })

        // requestIdx resets to zero once connectionID expires
        requestIdx = 0
      }

      const requestTimeout = getUDPRequestTimeoutMs(requestIdx)

      try {
        const announceResponse = await this.sendUDPAnnounceRequest(
          metaInfo,
          requestTimeout
        )

        logger.info(`received announce response at ${new Date().toISOString()}`)

        return announceResponse
      } catch (error) {
        logger.error(error.message)
      }

      requestIdx++
      numRequests++
    }

    throw Error(getUnableReceiveAnnounceResponseErrorMsg(announceUrl))
  }

  private async getPeersFromHTTPTracker(
    metaInfo: DecodedMetaInfo
  ): Promise<HTTPAnnounceResponse> {
    const announceUrl = getURLForAnnounceRequest(metaInfo)

    try {
      const responseBuffer = await this.httpClient.get<Buffer>(
        announceUrl.toString()
      )
      const announceResponse = parseHTTPAnnounceResponse(responseBuffer)
      return announceResponse
    } catch (error) {
      throw Error(getAnnounceResponseReceiveErrorMsg(error.message))
    }
  }

  async getPeersForTorrent(
    metaInfo: DecodedMetaInfo
  ): Promise<UDPAnnounceResponse | HTTPAnnounceResponse> {
    const announceUrl = new URL(metaInfo.announce)
    let { protocol } = announceUrl
    protocol = protocol.slice(0, protocol.length - 1)

    if (protocol.includes(PROTOCOL.HTTP)) protocol = PROTOCOL.HTTP

    switch (protocol) {
      case PROTOCOL.UDP: {
        return this.getPeersFromUDPTracker(metaInfo)
      }

      case PROTOCOL.HTTP: {
        return this.getPeersFromHTTPTracker(metaInfo)
      }

      default: {
        throw Error(invalidAnnounceUrlProtocolErrorMsg)
      }
    }
  }
}
