import { randomBytes } from 'crypto'
import { Socket, createSocket } from 'dgram'

import { BEPResponse } from '../types'

function buildConnReqBuffer(): Buffer {
  let buffer = Buffer.alloc(16)

  // connection id fixed as 0x41727101980 as per BEP
  // split 0x41727101980 into 2 32-bit hex values
  buffer.writeUint32BE(0x417, 0)
  buffer.writeUint32BE(0x27101980, 4)

  // action
  // 0 <=> connection request
  buffer.writeUint32BE(0, 8)

  // append random transaction id
  buffer = Buffer.concat([buffer, randomBytes(4)])

  return buffer
}

function parseConnRespBuffer(respBuffer: Buffer): BEPResponse {
  return {
    action: respBuffer.readUInt32BE(0),
    transactionId: respBuffer.readUInt32BE(4),
    connectionId: respBuffer.readUInt32BE(8)
  }
}

function udpSend(
  socket: Socket,
  msgBuffer: Buffer,
  urlString: string,
  callBack: (any) => Record<string, unknown> | null
): void {
  const url = new URL(urlString)
  socket.send(msgBuffer, 0, msgBuffer.length, +url.port, url.hostname, callBack)
}
