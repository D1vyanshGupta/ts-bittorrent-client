import { PROTOCOL, RESPONSE_STATUS } from '../constants/protocol'

type FileInfo = {
  length: number
  path: string
}

export type DecodedMetaInfo = {
  announce: string
  'announce-list'?: string[]
  'created by'?: string
  'creation date'?: number
  encoding?: Buffer
  info: {
    files?: FileInfo[]
    length?: number
    name: string
    'piece length': number
    pieces: Buffer
  }
}

export type UDPConnectionResponse = {
  receiptTime: number
  connectionID: Buffer
}

export type Peer = {
  ip: string
  port: number
}

export type UDPAnnounceResponse = {
  type: PROTOCOL.UDP
  status: RESPONSE_STATUS.SUCCESS
  peers: Peer[]
  seeders: number
  leechers: number
}

type HTTPSuccessAnnounceResponse = {
  type: PROTOCOL.HTTP
  status: RESPONSE_STATUS.SUCCESS
  complete: number
  incomplete: number
  interval: number
  'min interval': number
  peers: Peer[]
}

type HTTPFailureAnnounceResponse = {
  type: PROTOCOL.HTTP
  status: RESPONSE_STATUS.FAILURE
  'failure reason': string
  'warning message'?: string
}

export type HTTPAnnounceResponse =
  | HTTPSuccessAnnounceResponse
  | HTTPFailureAnnounceResponse
