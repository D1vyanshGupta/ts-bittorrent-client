export type MockSendRequestSignature<T, V> = (
  requestMeta: T,
  timeoutMs: number
) => Promise<V>
