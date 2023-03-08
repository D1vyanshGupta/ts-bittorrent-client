import { decode } from 'bencode'

import { getUnableDecodeBencodedDataErrorMsg } from '../constants/error-message'

export function isObject(value: unknown): boolean {
  return typeof value === 'object' && !Array.isArray(value) && value !== null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function decodeBencodedData(dataBuffer: Buffer): any {
  try {
    return decode(dataBuffer)
  } catch (error) {
    throw Error(getUnableDecodeBencodedDataErrorMsg(error.message))
  }
}
