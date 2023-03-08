export enum PROTOCOL {
  UDP = 'udp',
  HTTP = 'http'
}

export const MAX_ASCII_CHAR_CODE = 127

export const DEFAULT_CLIENT_PORT = 6881

// query params for `http` announce request
export const LEFT_KEY = 'left'
export const PORT_KEY = 'port'
export const COMPACT_KEY = 'compact'
export const PEER_ID_KEY = 'peer_id'
export const NUM_WANT_KEY = 'num_want'
export const UPLOADED_KEY = 'uploaded'
export const INFO_HASH_KEY = 'info_hash'
export const DOWNLOADED_KEY = 'downloaded'

// announce response status enum
export enum RESPONSE_STATUS {
  SUCCESS = 'success',
  FAILURE = 'failure'
}

// params related to `udp` (connection) request, (announce) response
export const MAX_NUM_UDP_CLIENT_REQUESTS = 9

// connection ID is valid for 1 min, as per BEP: 15
export const CONNECTION_ID_VALIDITY_MS = 60 * 1000

export const CONNECT_EVENT = 'connect'
export const ANNOUNCE_EVENT = 'announce'

export const PEER_LENGTH = 6

export const CONN_ID_LENGTH = 8
export const TRANSACTION_ID_LENGTH = 4

export const CONN_REQ_MIN_LENGTH = 16
export const CONN_RESP_MIN_LENGTH = 16

export const ANNOUNCE_REQ_MIN_LENGTH = 98
export const ANNOUNCE_RESP_MIN_LENGTH = 20

export const BUILD_CONN_REQ_PROTOCOL_ID = BigInt(0x41727101980)
