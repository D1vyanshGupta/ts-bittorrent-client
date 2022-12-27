import { randomBytes } from 'crypto'

let id: Buffer

export default function (): Buffer {
  if (!id) id = randomBytes(20)
  return id
}
