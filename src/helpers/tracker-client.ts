import { randomBytes } from 'crypto'
import { Socket, createSocket } from 'dgram'

import getPeerId from './peer-id'
import { logger } from './logging'
import { splitBufferToChunks } from './misc'
import { getInfoHash, getTorrentSize } from './meta-info'
import {
  CONNECT_EVENT,
  ANNOUNCE_EVENT,
  BUILD_CONN_REQ_PROTOCOL_ID
} from '../constants'

import {
  Peer,
  DecodedMetaInfo,
  AnnounceResponse,
  ConnectionResponse
} from '../types'

export class UDPTrackerClient {
  private connIDBuff: Buffer
  private transcIDBuff: Buffer

  private metaInfo: DecodedMetaInfo

  constructor(metaInfo: DecodedMetaInfo) {
    this.metaInfo = metaInfo
  }

  private static getResponseType(respBuffer: Buffer): string {
    const action = respBuffer.readUInt32BE(0)
    if (action === 0) return CONNECT_EVENT
    return ANNOUNCE_EVENT
  }

  private static udpSend(
    socket: Socket,
    msgBuffer: Buffer,
    urlString: string,
    callBack: (any) => void
  ): void {
    const url = new URL(urlString)
    socket.send(
      msgBuffer,
      0,
      msgBuffer.length,
      +url.port,
      url.hostname,
      callBack
    )
  }

  /*
  BEP: 15
  Offset  Size            Name            Value
  0       64-bit integer  protocol_id     0x41727101980 // magic constant
  8       32-bit integer  action          0 // connect
  12      32-bit integer  transaction_id
  16
  */
  private buildConnRequest(): Buffer {
    const buffer = Buffer.allocUnsafe(16)

    // protocol_id 0x41727101980, fixed as per BEP: 15
    buffer.writeBigInt64BE(BUILD_CONN_REQ_PROTOCOL_ID, 0)

    // action
    // 0 <=> connection request
    buffer.writeUInt32BE(0, 8)

    // create random transaction ID
    const transcIDBuffer = randomBytes(4)
    transcIDBuffer.copy(buffer, 12)
    this.transcIDBuff = transcIDBuffer

    return buffer
  }

  /*
  BEP: 15
  Offset  Size            Name            Value
  0       32-bit integer  action          0 // connect
  4       32-bit integer  transaction_id
  8       64-bit integer  connection_id
  16
  */
  private parseConnResponse(respBuffer: Buffer): ConnectionResponse | null {
    // response buffer should be atleast 16 bytes
    if (respBuffer.length < 16) return null

    const action = respBuffer.readInt32BE(0)
    if (action !== 0) return null

    const rcvdTranscIDBuff = respBuffer.subarray(4, 8)
    const isSame = Buffer.compare(this.transcIDBuff, rcvdTranscIDBuff) === 0
    if (!isSame) return null

    const rcvdConnIdBuff = respBuffer.subarray(8, 16)
    this.connIDBuff = rcvdConnIdBuff

    return {
      action,
      transactionId: rcvdTranscIDBuff.readInt32BE(0),
      connectionId: rcvdConnIdBuff
    }
  }

  /*
  Offset  Size    Name    Value
  0       64-bit integer  connection_id
  8       32-bit integer  action          1 // announce
  12      32-bit integer  transaction_id
  16      20-byte string  info_hash
  36      20-byte string  peer_id
  56      64-bit integer  downloaded
  64      64-bit integer  left
  72      64-bit integer  uploaded
  80      32-bit integer  event           0 // 0: none; 1: completed; 2: started; 3: stopped
  84      32-bit integer  IP address      0 // default
  88      32-bit integer  key
  92      32-bit integer  num_want        -1 // default
  96      16-bit integer  port
  98
  */
  private buildAnnounceRequest(port = 6881): Buffer {
    const buffer = Buffer.allocUnsafe(98)

    // connection_id
    this.connIDBuff.copy(buffer, 0)

    // action
    // 1 <=> announce request
    buffer.writeUInt32BE(1, 8)

    // transaction_id
    this.transcIDBuff.copy(buffer, 12)

    // info_hash
    const infoHashBuff = getInfoHash(this.metaInfo)
    infoHashBuff.copy(buffer, 16)

    // peer_id
    const peerIdBuff = getPeerId()
    peerIdBuff.copy(buffer, 36)

    // downloaded (0 as of now)
    buffer.writeUInt32BE(0, 56)

    // left (entire file as of now)
    const size = getTorrentSize(this.metaInfo)
    size.copy(buffer, 64)

    // uploaded (0 as of now)
    buffer.writeUInt32BE(0, 72)

    // event (0: none)
    buffer.writeUInt32BE(0, 80)

    // ip address (default: 0)
    buffer.writeUInt32BE(0, 84)

    // key
    const key = randomBytes(4)
    key.copy(buffer, 88)

    // num_want
    buffer.writeInt32BE(-1, 92)

    // port
    buffer.writeUInt16BE(port, 96)

    return buffer
  }

  /*
  BERP: 15
  Offset      Size            Name            Value
  0           32-bit integer  action          1 // announce
  4           32-bit integer  transaction_id
  8           32-bit integer  interval
  12          32-bit integer  leechers
  16          32-bit integer  seeders
  20 + 6 * n  32-bit integer  IP address
  24 + 6 * n  16-bit integer  TCP port
  20 + 6 * N
  */
  private parseAnnounceResponse(respBuffer: Buffer): AnnounceResponse | null {
    if (respBuffer.length < 20) return null

    const action = respBuffer.readUint32BE(0)
    if (action !== 1) return null

    const transcIDBuff = respBuffer.subarray(4, 8)
    const isSame = Buffer.compare(this.transcIDBuff, transcIDBuff) === 0
    if (!isSame) return null

    const peerList = splitBufferToChunks(respBuffer.subarray(20), 6)

    const peers = peerList.map(
      (peer: Buffer): Peer => ({
        ip: peer.subarray(0, 4),
        port: peer.readInt16BE(4)
      })
    )

    return {
      action,
      transactionId: respBuffer.readUInt32BE(4),
      leechers: respBuffer.readUInt32BE(12),
      seeders: respBuffer.readUInt32BE(16),
      peers
    }
  }

  getPeersForTorrent(timeoutMs = 5000): Promise<Peer[]> {
    const socket = createSocket('udp4')
    const annnounceUrl = this.metaInfo.announce.toString('utf-8')

    const connReqestBuff = this.buildConnRequest()
    UDPTrackerClient.udpSend(socket, connReqestBuff, annnounceUrl, () => {
      logger.info(`sent connection request to ${annnounceUrl}`)
    })

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            `unable to fetch peers from ${annnounceUrl} within ${
              timeoutMs / 1000
            } sec`
          )
        )
      }, timeoutMs)

      socket.on('message', (respBuffer) => {
        const responseType = UDPTrackerClient.getResponseType(respBuffer)

        if (responseType === CONNECT_EVENT) {
          logger.info(`received connection response from ${annnounceUrl}`)

          const connResponse = this.parseConnResponse(respBuffer)
          if (!connResponse) return

          const announceRequestBuff = this.buildAnnounceRequest()

          UDPTrackerClient.udpSend(
            socket,
            announceRequestBuff,
            annnounceUrl,
            () => {
              logger.info(`sent announce request to ${annnounceUrl}`)
            }
          )
        } else if (responseType === ANNOUNCE_EVENT) {
          logger.info(`received announce response from ${annnounceUrl}`)

          const announceResponse = this.parseAnnounceResponse(respBuffer)
          if (!announceResponse) return

          clearTimeout(timer)
          resolve(announceResponse.peers)
        }
      })
    })
  }
}
