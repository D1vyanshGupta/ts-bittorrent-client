export const DEFAULT_SOCKET_PORT = 6881
export const MAX_NUM_CLIENT_REQUESTS = 9

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
