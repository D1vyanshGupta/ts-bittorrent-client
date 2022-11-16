type FileInfo = {
  length: number
  path: Buffer
}

export type DecodedMetaInfo = {
  announce: Buffer
  'announce-list'?: Buffer
  'created by'?: Buffer
  'creation date'?: number
  encoding?: Buffer
  info: {
    files?: FileInfo[]
    length?: number
    name: Buffer
    'piece length': number
    pieces: Buffer
  }
}

type ReadableFileInfo = {
  length: number
  path: string[]
}

export type ReadableMetaInfo = {
  announce: string
  'announce-list'?: string[]
  'created by'?: string
  'creation date'?: number
  encoding?: string
  info: {
    files?: ReadableFileInfo[]
    length?: number
    name: string
    'piece length': number
    pieces: string[]
  }
}

export type ConnectionResponse = {
  action: number
  transactionId: number
  connectionId: Buffer
}

export type Peer = {
  ip: Buffer
  port: number
}

export type AnnounceResponse = {
  action: number
  transactionId: number
  leechers: number
  seeders: number
  peers: Peer[]
}
