import { Socket } from 'dgram'
import { randomBytes } from 'crypto'

import {
  getRequestTimeout,
  buildAnnounceRequest,
  parseAnnounceResponse,
  buildConnectionRequest,
  parseConnectionResponse
} from './utils'

import { logger } from '../logging'
import { TRANSACTION_ID_LENGTH } from '../constants'
import { DecodedMetaInfo, ConnectionResponse, AnnounceResponse } from '../types'

export class UDPTrackerClient {
  private socket: Socket
  private socketPort: number

  private connectionID: Buffer
  private connectionReceiptTime: number

  private static NUM_MAX_REQUESTS = 8
  // connection ID is valid for 1 min, as per BEP: 15
  private static CONNECTION_ID_VALIDITY_MS = 60 * 1000

  constructor(socket: Socket, sockerPort = 6881) {
    this.socket = socket
    this.socketPort = sockerPort

    this.socket.bind(this.socketPort, () => {
      logger.info(`listening on port: ${this.socketPort}`)
    })
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
      throw Error(`unable to send UDP datagram: ${error.message || error}`)
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
                `invalid connection response: ${error.message || error}`
              )
              reject(parseError)
            }
          }

          const timer = setTimeout((): void => {
            const error = Error(
              `connection response not received within ${
                timeoutMs / 1000
              } seconds`
            )
            this.socket.removeListener('message', callback)
            reject(error)
          }, timeoutMs)

          this.socket.once('message', callback)
        })
      } catch (error) {
        const requestError = Error(
          `unable to send connection request: ${error.message || error}`
        )
        reject(requestError)
      }
    })
  }

  private async getConnectionID(announceUrl: URL): Promise<void> {
    let numTries = 0

    // exponential backoff for fetching connection ID, as per BEP: 15
    // eslint-disable-next-line no-loops/no-loops
    while (numTries < UDPTrackerClient.NUM_MAX_REQUESTS) {
      const timeoutMs = getRequestTimeout(numTries)
      try {
        const { connectionID, receiptTime } = await this.sendConnectionRequest(
          announceUrl,
          timeoutMs
        )

        this.connectionID = connectionID
        this.connectionReceiptTime = receiptTime

        logger.info(
          `received connection ID at ${new Date(receiptTime).toISOString()}`
        )
        break
      } catch (error) {
        logger.error(error.message)
      }
      numTries = numTries + 1
    }

    if (numTries === UDPTrackerClient.NUM_MAX_REQUESTS)
      throw Error(`unable to get connection ID from ${announceUrl}`)
  }

  private isConnectionIDValid(): boolean {
    if (!this.connectionID) return false

    const diffMs = Date.now() - this.connectionReceiptTime
    return diffMs < UDPTrackerClient.CONNECTION_ID_VALIDITY_MS
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
                `unable to parse announce response: ${error.message || error}`
              )
              reject(parseError)
            }
          }

          const timer = setTimeout((): void => {
            const timeoutError = Error(
              `announce response not received within ${
                timeoutMs / 1000
              } seconds`
            )

            this.socket.removeListener('message', callback)
            reject(timeoutError)
          }, timeoutMs)

          this.socket.once('message', callback)
        })
      } catch (error) {
        const requestError = Error(
          `unable to send announce request: ${error.message || error}`
        )
        reject(requestError)
      }
    })
  }

  async getPeersForTorrent(
    metaInfo: DecodedMetaInfo
  ): Promise<AnnounceResponse> {
    let numTries = 0
    let numRequests = 0

    const announceUrl = new URL(metaInfo.announce.toString('utf8'))

    // eslint-disable-next-line no-loops/no-loops
    while (numRequests < UDPTrackerClient.NUM_MAX_REQUESTS) {
      if (!this.isConnectionIDValid()) {
        await this.getConnectionID(announceUrl).catch((error) => {
          throw Error(
            `cannot send announce request because unable to get connection ID: ${
              error.message || error
            }`
          )
        })
        numTries = 0
      }

      const requestTimeout = getRequestTimeout(numTries)

      try {
        numRequests = numRequests + 1
        const announceResponse = await this.sendAnnounceRequest(
          metaInfo,
          requestTimeout
        )

        logger.info(`received announce response at ${new Date().toISOString()}`)

        return announceResponse
      } catch (error) {
        logger.error(error.message || error)
      }
      numTries = numTries + 1
    }

    throw Error(`unable to get announce response from ${announceUrl}`)
  }

  // getPeersForTorrent(timeoutMs = 5000): Promise<Peer[]> {
  //   const socket = createSocket('udp4')
  //   const annnounceUrl = this.metaInfo.announce.toString('utf-8')

  //   const connReqestBuff = this.buildConnRequest()
  //   UDPTrackerClient.udpSend(socket, connReqestBuff, annnounceUrl, () => {
  //     logger.info(`sent connection request to ${annnounceUrl}`)
  //   })

  //   return new Promise((resolve, reject) => {
  //     const timer = setTimeout(() => {
  //       reject(
  //         new Error(
  //           `unable to fetch peers from ${annnounceUrl} within ${
  //             timeoutMs / 1000
  //           } sec`
  //         )
  //       )
  //     }, timeoutMs)

  //     socket.on('message', (respBuffer) => {
  //       const responseType = UDPTrackerClient.getResponseType(respBuffer)

  //       if (responseType === CONNECT_EVENT) {
  //         logger.info(`received connection response from ${annnounceUrl}`)

  //         const connResponse = this.parseConnResponse(respBuffer)
  //         if (!connResponse) return

  //         const announceRequestBuff = this.buildAnnounceRequest()

  //         UDPTrackerClient.udpSend(
  //           socket,
  //           announceRequestBuff,
  //           annnounceUrl,
  //           () => {
  //             logger.info(`sent announce request to ${annnounceUrl}`)
  //           }
  //         )
  //       } else if (responseType === ANNOUNCE_EVENT) {
  //         logger.info(`received announce response from ${annnounceUrl}`)

  //         const announceResponse = this.parseAnnounceResponse(respBuffer)
  //         if (!announceResponse) return

  //         clearTimeout(timer)
  //         resolve(announceResponse.peers)
  //       }
  //     })
  //   })
  // }
}
