import { randomBytes } from 'crypto'

import getPeerId from './peer-id'
import { getInfoHash, getTorrentSize } from '../meta-info'

import {
  getResponseLengthLessThanErrorMsg,
  getResponseNotCorrespondEventErrorMsg,
  responseNotCorrespondTransactionErrorMsg
} from '../constants/error-message'

import {
  PEER_LENGTH,
  CONNECT_EVENT,
  ANNOUNCE_EVENT,
  CONN_REQ_MIN_LENGTH,
  CONN_RESP_MIN_LENGTH,
  ANNOUNCE_RESP_MIN_LENGTH,
  BUILD_CONN_REQ_PROTOCOL_ID,
  ANNOUNCE_REQ_MIN_LENGTH
} from '../constants/protocol'

import {
  Peer,
  DecodedMetaInfo,
  AnnounceResponse,
  ConnectionResponse
} from '../types'

// calculate timeout for exponential backoff, as per BEP: 15
export function getRequestTimeoutMs(requestIdx: number): number {
  return 1000 * 15 * 2 ** requestIdx
}

export function getResponseType(response: Buffer): string {
  const action = response.readUInt32BE(0)
  if (action === 0) return CONNECT_EVENT
  return ANNOUNCE_EVENT
}

/*
  BEP: 15
  Offset  Size            Name            Value
  0       64-bit integer  protocol_id     0x41727101980 // magic constant
  8       32-bit integer  action          0 // connect
  12      32-bit integer  transaction_id
  16
  */
export function buildConnectionRequest(transactionID: Buffer): Buffer {
  const buffer = Buffer.allocUnsafe(CONN_REQ_MIN_LENGTH)

  // protocol_id 0x41727101980, fixed as per BEP: 15
  buffer.writeBigInt64BE(BUILD_CONN_REQ_PROTOCOL_ID, 0)

  // action
  // 0 <=> connection request
  buffer.writeUInt32BE(0, 8)

  // copy transaction request buffer
  transactionID.copy(buffer, 12)

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
export function parseConnectionResponse(
  transactionID: Buffer,
  response: Buffer
): ConnectionResponse {
  const receiptTime = Date.now()

  // response buffer should be atleast 16 bytes
  if (response.length < CONN_RESP_MIN_LENGTH)
    throw Error(getResponseLengthLessThanErrorMsg(CONN_RESP_MIN_LENGTH))

  const responseType = getResponseType(response)
  if (responseType !== CONNECT_EVENT)
    throw Error(getResponseNotCorrespondEventErrorMsg(CONNECT_EVENT))

  const responseTransactionID = response.subarray(4, 8)
  const isSame = Buffer.compare(transactionID, responseTransactionID) === 0
  if (!isSame) throw Error(responseNotCorrespondTransactionErrorMsg)

  const connectionID = response.subarray(8, 16)

  return {
    receiptTime,
    connectionID
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
export function buildAnnounceRequest(
  socketPort: number,
  metaInfo: DecodedMetaInfo,
  connectionID: Buffer,
  transactionID: Buffer
): Buffer {
  const buffer = Buffer.allocUnsafe(ANNOUNCE_REQ_MIN_LENGTH)

  // connection_id
  connectionID.copy(buffer, 0)

  // action
  // 1 <=> announce request
  buffer.writeUInt32BE(1, 8)

  // transaction_id
  transactionID.copy(buffer, 12)

  // info_hash
  const infoHash = getInfoHash(metaInfo)
  infoHash.copy(buffer, 16)

  // peer_id
  const peerId = getPeerId()
  peerId.copy(buffer, 36)

  // downloaded (0 as of now)
  buffer.writeBigUInt64BE(BigInt(0), 56)

  // left (entire file as of now)
  const size = getTorrentSize(metaInfo)
  buffer.writeBigUInt64BE(size, 64)

  // uploaded (0 as of now)
  buffer.writeBigUInt64BE(BigInt(0), 72)

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
  buffer.writeUInt16BE(socketPort, 96)

  return buffer
}

export function buildAnnounceRequestUrl(
  socketPort: number,
  metaInfo: DecodedMetaInfo
): URL {
  const { announce } = metaInfo
  const announceUrl = new URL(announce.toString('utf8'))

  // append info_hash
  const infoHash = getInfoHash(metaInfo)
  announceUrl.searchParams.append(
    'info_hash',
    encodeURIComponent(infoHash.toString('base64'))
  )

  // append peer_id
  const peerId = getPeerId()
  announceUrl.searchParams.append(
    'peer_id',
    encodeURIComponent(peerId.toString('hex'))
  )

  // append port
  announceUrl.searchParams.append(
    'port',
    encodeURIComponent(socketPort.toString())
  )

  // append uploaded
  announceUrl.searchParams.append('uploaded', encodeURIComponent('0'))

  // append downloaded
  announceUrl.searchParams.append('downloaded', encodeURI('0'))

  // append downloaded
  const torrentSize = getTorrentSize(metaInfo)
  announceUrl.searchParams.append(
    'left',
    encodeURIComponent(torrentSize.toString())
  )

  return announceUrl
}

function splitBufferToChunks(buffer: Buffer, chunkSize: number): Buffer[] {
  const chunks: Buffer[] = []

  let idx = 0
  const bufferLength = buffer.length

  //eslint-disable-next-line no-loops/no-loops
  while (idx < bufferLength) {
    const chunk = buffer.subarray(idx, idx + chunkSize)
    chunks.push(chunk)

    idx += chunkSize
  }

  return chunks
}

/*
  BEP: 15
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
export function parseAnnounceResponse(
  transactionID: Buffer,
  response: Buffer
): AnnounceResponse {
  if (response.length < ANNOUNCE_RESP_MIN_LENGTH)
    throw Error(getResponseLengthLessThanErrorMsg(ANNOUNCE_RESP_MIN_LENGTH))

  const responseType = getResponseType(response)
  if (responseType !== ANNOUNCE_EVENT)
    throw Error(getResponseNotCorrespondEventErrorMsg(ANNOUNCE_EVENT))

  const responseTransactionID = response.subarray(4, 8)
  const isSame = Buffer.compare(transactionID, responseTransactionID) === 0
  if (!isSame) throw Error(responseNotCorrespondTransactionErrorMsg)

  const peerList = splitBufferToChunks(response.subarray(20), PEER_LENGTH)

  const peers = peerList.map(
    (peer: Buffer): Peer => ({
      ip: peer.subarray(0, 4),
      port: peer.readInt16BE(4)
    })
  )

  return {
    peers,
    seeders: response.readUInt32BE(16),
    leechers: response.readUInt32BE(12)
  }
}
