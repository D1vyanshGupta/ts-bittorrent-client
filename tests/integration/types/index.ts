export type MockSocketSendSignature = (
  msg: Buffer,
  offset: number,
  length: number,
  port: number,
  address: string,
  callBack: () => void
) => void
