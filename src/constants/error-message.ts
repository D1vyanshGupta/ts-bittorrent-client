export function getUnableDecodeTorrentFileErrorMsg(error: string): string {
  return `unable to decode torrent file: ${error}`
}

export function getUnableDecodeBencodedDataErrorMsg(error: string): string {
  return `unable to decode bencoded data: ${error}`
}

export function getResponseLengthLessThanErrorMsg(minLength: number): string {
  return `response has size less than ${minLength} bytes`
}

export function getResponseNotCorrespondEventErrorMsg(
  eventType: string
): string {
  return `response does not correspond to a ${eventType} request`
}

export const responseNotCorrespondTransactionErrorMsg =
  'response does not correspond to given transactionID'

export function getSendUDPDatagramErrorMsg(error: string): string {
  return `unable to send UDP datagram: ${error}`
}

export function getConnectionRequestSendErrorMsg(error: string): string {
  return `unable to send connection request: ${error}`
}

export function getConnectionRequestTimeoutErrorMsg(timeoutMs: number): string {
  return `connection response not received within ${timeoutMs / 1000} second${
    timeoutMs / 1000 === 1 ? '' : 's'
  }`
}

export function getConnectionResponseParseErrorMsg(error: string): string {
  return `invalid connection response: ${error}`
}

export function getUnableObtainConnectionIDErrorMsg(announceUrl: URL): string {
  return `unable to obtain connection response from ${announceUrl}`
}

export function getAnnounceRequestSendErrorMsg(error: string): string {
  return `unable to send announce request: ${error}`
}

export function getAnnounceResponseReceiveErrorMsg(error: string): string {
  return `unable to receive announce response: ${error}`
}

export function getAnnounceRequestTimeoutErrorMsg(timeoutMs: number): string {
  return `announce response not received within ${timeoutMs / 1000} second${
    timeoutMs / 1000 === 1 ? '' : 's'
  }`
}

export function getInvalidBufferLengthErrorMsg(chunkLength: number): string {
  return `buffer has invalid byte-length: not a mutiple of ${chunkLength}`
}

export function getUnableToParsePeerInfoErrorMsg(error: string): string {
  return `unable to parse peer information: ${error}`
}

export const emptyAnnounceResponseErrorMessage = 'announce response is empty'

export function getAnnounceResponseParseErrorMsg(error: string): string {
  return `invalid announce response: ${error}`
}

export function getConnectionIDFetchErrorMsg(error: string): string {
  return `cannot send announce request because unable to get connection ID: ${error}`
}

export function getUnableReceiveAnnounceResponseErrorMsg(
  announceUrl: URL
): string {
  return `unable to receive announce response from ${announceUrl}`
}

export const invalidAnnounceUrlProtocolErrorMsg =
  'announce url has invalid protocol'
