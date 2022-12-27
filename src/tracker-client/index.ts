import { Socket, createSocket } from 'dgram'

import { logger } from '../logging'
import {
  getRequestTimeout,
  buildConnectionRequest,
  getRandomTransactionID,
  parseConnectionResponse
} from './utils'

import { DecodedMetaInfo, ConnectionResponse } from '../types'

export class UDPTrackerClient {
  private socket: Socket
  private socketPort: number

  private connectionID: Buffer
  private connectionReceiptTime: number

  private announceUrl: URL
  private metaInfo: DecodedMetaInfo

  private static NUM_MAX_CONN_REQUESTS = 8

  constructor(metaInfo: DecodedMetaInfo, port = 6881) {
    this.metaInfo = metaInfo
    this.announceUrl = new URL(this.metaInfo.announce.toString('utf8'))

    this.socketPort = port
    this.socket = createSocket('udp4')
    this.socket.bind(this.socketPort, () => {
      logger.info(`listening on port: ${this.socketPort}`)
    })
  }

  private sendUDPDatagram(msgBuffer: Buffer, callBack: (any) => void): void {
    try {
      this.socket.send(
        msgBuffer,
        0,
        msgBuffer.length,
        +this.announceUrl.port,
        this.announceUrl.hostname,
        callBack
      )
    } catch (error) {
      throw Error(`unable to send UDP datagram: ${error.message || error}`)
    }
  }

  private sendConnectionRequest(
    timeoutMs: number
  ): Promise<ConnectionResponse> {
    return new Promise((resolve, reject) => {
      const transactionID = getRandomTransactionID()
      const connectionRequest = buildConnectionRequest(transactionID)

      try {
        this.sendUDPDatagram(connectionRequest, () => {
          logger.info(`sent connection request to ${this.announceUrl}`)

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

          const timer = setTimeout(() => {
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

  async getConnectionID(): Promise<void> {
    let numTries = 0

    // exponential backoff for fetching connection ID, as per BEP: 15
    // eslint-disable-next-line no-loops/no-loops
    while (numTries < UDPTrackerClient.NUM_MAX_CONN_REQUESTS) {
      const timeoutMs = getRequestTimeout(numTries)
      try {
        const { connectionID, receiptTime } = await this.sendConnectionRequest(
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

    if (numTries === UDPTrackerClient.NUM_MAX_CONN_REQUESTS)
      throw Error(`unable to get connection ID from ${this.announceUrl}`)
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
