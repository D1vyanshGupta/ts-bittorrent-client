import { randomBytes } from 'crypto'
import { Socket, createSocket } from 'dgram'

import {
  getRequestTimeoutMs,
  buildAnnounceRequest,
  parseAnnounceResponse,
  buildConnectionRequest,
  parseConnectionResponse
} from './utils'

import {
  DEFAULT_SOCKET_PORT,
  TRANSACTION_ID_LENGTH,
  MAX_NUM_CLIENT_REQUESTS,
  CONNECTION_ID_VALIDITY_MS
} from '../constants/protocol'

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
} from '../constants/error-message'

import { logger } from '../logging'
import { DecodedMetaInfo, ConnectionResponse, AnnounceResponse } from '../types'

export class UDPTrackerClient {
  private socket: Socket
  private socketPort: number

  private connectionID: Buffer
  private connectionReceiptTime: number

  constructor(socketPort = DEFAULT_SOCKET_PORT) {
    this.socket = createSocket('udp4')
    this.socketPort = socketPort

    this.socket.bind(this.socketPort)
  }

  setConnection(connectionID: Buffer, connectionReceiptTime: number) {
    this.connectionID = connectionID
    this.connectionReceiptTime = connectionReceiptTime
  }

  resetConnection(): void {
    this.connectionID = undefined
    this.connectionReceiptTime = undefined
  }

  close(): void {
    this.socket.close()
  }

  private sendUDPDatagram(
    announceUrl: URL,
    msgBuffer: Buffer,
    callBack: (any) => void
  ): void {
    try {
      this.socket.send(
        msgBuffer,
        0,
        msgBuffer.length,
        +announceUrl.port,
        announceUrl.hostname,
        callBack
      )
    } catch (error) {
      throw Error(getSendUDPDatagramErrorMsg(error.message))
    }
  }

  private sendConnectionRequest(
    announceUrl: URL,
    timeoutMs: number
  ): Promise<ConnectionResponse> {
    return new Promise((resolve, reject) => {
      const transactionID = randomBytes(TRANSACTION_ID_LENGTH)
      const connectionRequest = buildConnectionRequest(transactionID)

      try {
        this.sendUDPDatagram(announceUrl, connectionRequest, (): void => {
          logger.info(
            `sent connection request to ${announceUrl} at ${new Date().toISOString()}`
          )

          const callback = (response: Buffer): void => {
            try {
              clearTimeout(timer)
              const connectionResponse = parseConnectionResponse(
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
            this.socket.removeListener('message', callback)
            reject(error)
          }, timeoutMs)

          this.socket.once('message', callback)
        })
      } catch (error) {
        const requestError = Error(
          getConnectionRequestSendErrorMsg(error.message)
        )
        reject(requestError)
      }
    })
  }

  private async getConnectionID(announceUrl: URL): Promise<void> {
    let requestIdx = 0

    // exponential backoff for fetching connection ID, as per BEP: 15
    // eslint-disable-next-line no-loops/no-loops
    while (requestIdx < MAX_NUM_CLIENT_REQUESTS) {
      const timeoutMs = getRequestTimeoutMs(requestIdx)
      try {
        const { connectionID, receiptTime } = await this.sendConnectionRequest(
          announceUrl,
          timeoutMs
        )

        this.setConnection(connectionID, receiptTime)

        logger.info(
          `received connection ID at ${new Date(receiptTime).toISOString()}`
        )
        break
      } catch (error) {
        logger.error(error.message)
      }

      requestIdx++
    }

    if (requestIdx === MAX_NUM_CLIENT_REQUESTS)
      throw Error(getNotReceiveConnectionIDErrorMsg(announceUrl))
  }

  private isConnectionIDValid(): boolean {
    if (!this.connectionID) return false

    const diffMs = Date.now() - this.connectionReceiptTime
    return diffMs < CONNECTION_ID_VALIDITY_MS
  }

  private sendAnnounceRequest(
    metaInfo: DecodedMetaInfo,
    timeoutMs: number
  ): Promise<AnnounceResponse> {
    return new Promise((resolve, reject) => {
      const transactionID = randomBytes(TRANSACTION_ID_LENGTH)
      const announceRequest = buildAnnounceRequest(
        this.socketPort,
        metaInfo,
        this.connectionID,
        transactionID
      )

      try {
        const announceUrl = new URL(metaInfo.announce.toString('utf8'))

        this.sendUDPDatagram(announceUrl, announceRequest, (): void => {
          logger.info(
            `sent announce request to ${announceUrl} at ${new Date().toISOString()}`
          )

          const callback = (response: Buffer): void => {
            try {
              clearTimeout(timer)
              const announceResponse = parseAnnounceResponse(
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

            this.socket.removeListener('message', callback)
            reject(timeoutError)
          }, timeoutMs)

          this.socket.once('message', callback)
        })
      } catch (error) {
        const requestError = Error(
          getAnnounceRequestSendErrorMsg(error.message)
        )
        reject(requestError)
      }
    })
  }

  async getPeersForTorrent(
    metaInfo: DecodedMetaInfo
  ): Promise<AnnounceResponse> {
    let requestIdx = 0
    let numRequests = 0

    const announceUrl = new URL(metaInfo.announce.toString('utf8'))

    // exponential backoff, as per BEP: 15
    // eslint-disable-next-line no-loops/no-loops
    while (numRequests < MAX_NUM_CLIENT_REQUESTS) {
      if (!this.isConnectionIDValid()) {
        await this.getConnectionID(announceUrl).catch((error) => {
          throw Error(getConnectionIDFetchErrorMsg(error.message))
        })

        // requestIdx resets to zero once connectionID expires
        requestIdx = 0
      }

      const requestTimeout = getRequestTimeoutMs(requestIdx)

      try {
        const announceResponse = await this.sendAnnounceRequest(
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

    throw Error(getNotReceiveAnnounceResponseErrorMsg(announceUrl))
  }
}
