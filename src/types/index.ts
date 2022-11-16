type FileInfo = {
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
    files?: FileInfo[]
    length: number
    path?: string[]
    name: string
    'piece length': number
    pieces: string[]
  }
}

export type BEPResponse = {
  action: number
  transactionId: number
  connectionId: number
}
