export function isObject(value: unknown): boolean {
  return typeof value === 'object' && !Array.isArray(value) && value !== null
}

export function parseSHA1HashList(buffer: Buffer): string[] {
  const hashString = buffer.toString('hex')

  // SHA1 hash is 160 bits long == 40 hex chars
  const hashList: string[] = []

  let startIdx = 0
  const hashLength = hashString.length

  //eslint-disable-next-line no-loops/no-loops
  while (startIdx < hashLength) {
    const pieceHash = hashString.slice(startIdx, startIdx + 40)
    hashList.push(pieceHash)

    startIdx += 40
  }

  return hashList
}
