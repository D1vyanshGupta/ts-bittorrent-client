import { randomBytes } from 'crypto'

import getPeerId from './peer-id'

import {
  getInvalidBufferLengthErrorMsg,
  getAnnounceResponseParseErrorMsg,
  getUnableToParsePeerInfoErrorMsg,
  emptyAnnounceResponseErrorMessage,
  getResponseLengthLessThanErrorMsg,
  getResponseNotCorrespondEventErrorMsg,
  responseNotCorrespondTransactionErrorMsg
} from '../constants/error-message'

import {
  PROTOCOL,
  LEFT_KEY,
  PORT_KEY,
  COMPACT_KEY,
  PEER_ID_KEY,
  PEER_LENGTH,
  NUM_WANT_KEY,
  UPLOADED_KEY,
  CONNECT_EVENT,
  INFO_HASH_KEY,
  ANNOUNCE_EVENT,
  DOWNLOADED_KEY,
  RESPONSE_STATUS,
  CONN_REQ_MIN_LENGTH,
  DEFAULT_CLIENT_PORT,
  MAX_ASCII_CHAR_CODE,
  CONN_RESP_MIN_LENGTH,
  ANNOUNCE_REQ_MIN_LENGTH,
  ANNOUNCE_RESP_MIN_LENGTH,
  BUILD_CONN_REQ_PROTOCOL_ID
} from '../constants/protocol'

import {
  Peer,
  DecodedMetaInfo,
  UDPAnnounceResponse,
  HTTPAnnounceResponse,
  UDPConnectionResponse
} from '../types'

import { logger } from '../logging'
import { decodeBencodedData } from '../helpers'
import { getInfoHash, getTorrentSize } from '../meta-info'

function escapeByteHexString(byteHexString: string): string {
  let escapedString: string

  const base10Value = parseInt(byteHexString, 16)

  if (base10Value < MAX_ASCII_CHAR_CODE) {
    const asciiChar = String.fromCharCode(base10Value)
    escapedString = encodeURIComponent(asciiChar)
  } else {
    escapedString = `%${byteHexString.toUpperCase()}`
  }

  return escapedString
}

export function urlEncodeBuffer(buffer: Buffer): string {
  const hexStrings = buffer.toString('hex').match(/.{1,2}/g)
  const escapedStrings = hexStrings.map(escapeByteHexString)
  return escapedStrings.join('')
}

function getQueryStringForAnnounceRequest(
  metaInfo: DecodedMetaInfo,
  compact: number,
  port: number
): string {
  const searchParams: string[] = []

  // append info_hash
  const infoHash = getInfoHash(metaInfo)
  searchParams.push(`${INFO_HASH_KEY}=${urlEncodeBuffer(infoHash)}`)

  // append peer_id
  const peerId = getPeerId()
  searchParams.push(`${PEER_ID_KEY}=${urlEncodeBuffer(peerId)}`)

  // append port
  searchParams.push(`${PORT_KEY}=${port}`)

  // append uploaded
  searchParams.push(`${UPLOADED_KEY}=0`)

  // append downloaded
  searchParams.push(`${DOWNLOADED_KEY}=0`)

  // append left
  searchParams.push(`${LEFT_KEY}=0`)

  // append compact
  searchParams.push(`${COMPACT_KEY}=${compact}`)

  // append num_want
  searchParams.push(`${NUM_WANT_KEY}=-1`)

  const searchString = searchParams.join('&')

  return searchString
}

export function getURLForAnnounceRequest(
  metaInfo: DecodedMetaInfo,
  compact = 1,
  port: number = DEFAULT_CLIENT_PORT
): URL {
  const announceUrl = new URL(metaInfo.announce)
  announceUrl.search = getQueryStringForAnnounceRequest(metaInfo, compact, port)

  return announceUrl
}

// calculate timeout for exponential backoff, as per BEP: 15
export function getUDPRequestTimeoutMs(requestIdx: number): number {
  return 1000 * 15 * 2 ** requestIdx
}

export function getUDPResponseType(response: Buffer): string {
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
export function getUDPConnectionRequest(transactionID: Buffer): Buffer {
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
export function parseUDPConnectionResponse(
  transactionID: Buffer,
  response: Buffer
): UDPConnectionResponse {
  const receiptTime = Date.now()

  // response buffer should be atleast 16 bytes
  if (response.length < CONN_RESP_MIN_LENGTH)
    throw Error(getResponseLengthLessThanErrorMsg(CONN_RESP_MIN_LENGTH))

  const responseType = getUDPResponseType(response)
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
export function getUDPAnnounceRequest(
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

function splitBufferToChunks(buffer: Buffer, chunkSize: number): Buffer[] {
  const chunks: Buffer[] = []

  let idx = 0
  const bufferLength = buffer.length

  if (bufferLength % chunkSize !== 0)
    throw Error(getInvalidBufferLengthErrorMsg(chunkSize))

  //eslint-disable-next-line no-loops/no-loops
  while (idx < bufferLength) {
    const chunk = buffer.subarray(idx, idx + chunkSize)
    chunks.push(chunk)

    idx += chunkSize
  }

  return chunks
}

export function parsePeersInfoBuffer(peerInfoBuffer: Buffer): Peer[] {
  try {
    const peerList = splitBufferToChunks(peerInfoBuffer, PEER_LENGTH)

    return peerList.map(
      (peerInfo: Buffer): Peer => ({
        ip: peerInfo.subarray(0, 4).join('.'),
        port: peerInfo.readUInt16BE(4)
      })
    )
  } catch (error) {
    throw Error(getUnableToParsePeerInfoErrorMsg(error.message))
  }
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
export function parseUDPAnnounceResponse(
  transactionID: Buffer,
  response: Buffer
): UDPAnnounceResponse {
  if (response.length < ANNOUNCE_RESP_MIN_LENGTH)
    throw Error(getResponseLengthLessThanErrorMsg(ANNOUNCE_RESP_MIN_LENGTH))

  const responseType = getUDPResponseType(response)
  if (responseType !== ANNOUNCE_EVENT)
    throw Error(getResponseNotCorrespondEventErrorMsg(ANNOUNCE_EVENT))

  const responseTransactionID = response.subarray(4, 8)
  const isSame = Buffer.compare(transactionID, responseTransactionID) === 0
  if (!isSame) throw Error(responseNotCorrespondTransactionErrorMsg)

  const peers = parsePeersInfoBuffer(response.subarray(20))

  return {
    type: PROTOCOL.UDP,
    status: RESPONSE_STATUS.SUCCESS,
    peers,
    seeders: response.readUInt32BE(16),
    leechers: response.readUInt32BE(12)
  }
}

export function parseHTTPAnnounceResponse(
  dataBuffer: Buffer
): HTTPAnnounceResponse {
  try {
    if (!dataBuffer.length) throw Error(emptyAnnounceResponseErrorMessage)

    const decodedResponse = decodeBencodedData(dataBuffer)

    const { peers } = decodedResponse
    if (peers) {
      if (Buffer.isBuffer(peers))
        decodedResponse['peers'] = parsePeersInfoBuffer(peers)
      else
        decodedResponse['peers'] = peers.map((peer) => {
          peer['ip'] = peer['ip'].toString('utf8')
          return peer
        })
    }

    if ('failure reason' in decodedResponse) {
      decodedResponse['failure reason'] =
        decodedResponse['failure reason'].toString('utf8')

      decodedResponse['status'] = RESPONSE_STATUS.FAILURE
    } else decodedResponse['status'] = RESPONSE_STATUS.SUCCESS

    decodedResponse['type'] = PROTOCOL.HTTP

    return decodedResponse
  } catch (error) {
    throw Error(getAnnounceResponseParseErrorMsg(error.message))
  }
}
