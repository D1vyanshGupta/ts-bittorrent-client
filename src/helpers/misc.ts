export function isObject(value: unknown): boolean {
  return typeof value === 'object' && !Array.isArray(value) && value !== null
}

export function splitBufferToChunks(
  buffer: Buffer,
  chunkSize: number
): Buffer[] {
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
