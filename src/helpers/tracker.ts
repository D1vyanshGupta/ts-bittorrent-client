import { randomBytes } from 'crypto'
import { Socket, createSocket } from 'dgram'

import getPeerId from './peer-id'
import { splitBufferToChunks } from './misc'
import { BUILD_CONN_REQ_CONN_ID } from '../constants'
import { getInfoHash, getTorrentSize } from './meta-info'
import {
  Peer,
  DecodedMetaInfo,
  AnnounceResponse,
  ConnectionResponse
} from '../types'

// Offset  Size            Name            Value
// 0       32-bit integer  action          0 // connect
// 4       32-bit integer  transaction_id
// 8       64-bit integer  connection_id
// 16
function buildConnReqBuffer(): Buffer {
  const buffer = Buffer.alloc(16)

  // connection id fixed as 0x41727101980 as per BEP (64 bits)
  buffer.writeBigInt64BE(BUILD_CONN_REQ_CONN_ID, 0)

  // action
  // 0 <=> connection request (as per BEP) (32 bits)
  // can skip because buffer pre-filled with zeros

  // (random) transaction id (32 bits)
  randomBytes(4).copy(buffer, 12)

  return buffer
}

// Offset  Size            Name            Value
// 0       32-bit integer  action          0 // connect
// 4       32-bit integer  transaction_id
// 8       64-bit integer  connection_id
// 16
function parseConnRespBuffer(respBuffer: Buffer): ConnectionResponse {
  return {
    action: respBuffer.readUInt32BE(0),
    transactionId: respBuffer.readUInt32BE(4),
    connectionId: respBuffer.readBigInt64BE(8)
  }
}

// Offset  Size    Name    Value
// 0       64-bit integer  connection_id
// 8       32-bit integer  action          1 // announce
// 12      32-bit integer  transaction_id
// 16      20-byte string  info_hash
// 36      20-byte string  peer_id
// 56      64-bit integer  downloaded
// 64      64-bit integer  left
// 72      64-bit integer  uploaded
// 80      32-bit integer  event           0 // 0: none; 1: completed; 2: started; 3: stopped
// 84      32-bit integer  IP address      0 // default
// 88      32-bit integer  key             ? // random
// 92      32-bit integer  num_want        -1 // default
// 96      16-bit integer  port
// 98
function buildAnnounceReqBuffer(
  connIdBuf: Buffer,
  metaInfo: DecodedMetaInfo,
  port = 6881
): Buffer {
  const buffer = Buffer.alloc(98)

  // connection id (64 bits)
  connIdBuf.copy(buffer, 0)

  // action (32 bits)
  // 1 <=> announce request (as per BEP)
  buffer.writeUInt32BE(1, 8)

  // transaction id (32 bits)
  randomBytes(4).copy(buffer, 12)

  // SHA-1 hash of info dict (160 bits)
  const infoHash = getInfoHash(metaInfo)
  infoHash.copy(buffer, 16)

  // peer Id (160 bits)
  const peerIdBuf = getPeerId()
  peerIdBuf.copy(buffer, 36)

  // bytes downloaded (zero as of yet) (64 bits)
  // can skip because buffer pre-filled with zeros

  // bytes left to download (all as of yet) (64 bits)
  const leftBytes = getTorrentSize(metaInfo)
  leftBytes.copy(buffer, 64)

  // bytes uploaded (zero as of yet) (64 bits)
  // can skip because buffer pre-filled with zeros

  // event: 0 (none) (32 bits)
  // can skip because buffer pre-filled with zeros

  // ip: 0 (default) (32 bits)
  // can skip because buffer pre-filled with zeros

  // key (32 bits)
  randomBytes(4).copy(buffer, 88)

  // num_want (-1 in beginning) (32 bits)
  buffer.writeInt32BE(-1, 92)

  // port (16 bits)
  buffer.writeInt16BE(port, 96)

  return buffer
}

// Offset      Size            Name            Value
// 0           32-bit integer  action          1 // announce
// 4           32-bit integer  transaction_id
// 8           32-bit integer  interval
// 12          32-bit integer  leechers
// 16          32-bit integer  seeders
// 20 + 6 * n  32-bit integer  IP address
// 24 + 6 * n  16-bit integer  TCP port
// 20 + 6 * N
function parseAnnounceRespBuffer(respBuffer: Buffer): AnnounceResponse {
  const peerList = splitBufferToChunks(respBuffer.subarray(20), 6)

  const peers = peerList.map(
    (peer: Buffer): Peer => ({
      ip: peer.subarray(0, 4),
      port: peer.readInt16BE(4)
    })
  )

  return {
    action: respBuffer.readUInt32BE(0),
    transactionId: respBuffer.readUInt32BE(4),
    leechers: respBuffer.readUInt32BE(12),
    seeders: respBuffer.readUInt32BE(16),
    peers
  }
}

function udpSend(
  socket: Socket,
  msgBuffer: Buffer,
  urlString: string,
  callBack: (any) => Record<string, unknown> | null
): void {
  const url = new URL(urlString)
  socket.send(msgBuffer, 0, msgBuffer.length, +url.port, url.hostname, callBack)
}
