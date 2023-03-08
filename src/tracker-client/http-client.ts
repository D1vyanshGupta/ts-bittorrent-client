import axios from 'axios'

export class HTTPClient {
  private readonly baseInstance = axios.create({
    headers: {
      'Content-Type': 'text/plain'
    },
    responseType: 'arraybuffer',
    responseEncoding: 'binary'
  })

  async get<T>(urlString: string): Promise<T> {
    const response = await this.baseInstance.get<T>(urlString)
    return response.data
  }
}
