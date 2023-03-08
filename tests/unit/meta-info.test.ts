import { randomBytes } from 'crypto'

import { metaInfoNameFixture, udpAnnouceUrlFixture } from '../fixtures'

import { DecodedMetaInfo } from '../../src/types'
import { getTorrentSize } from '../../src/meta-info'

describe('meta-info', () => {
  describe('getTorrentSize', () => {
    let metaInfo: DecodedMetaInfo

    test.each([0, 'non-zero'])(
      'torrent comprises of a single file of %s length',
      (length) => {
        if (typeof length === 'string') length = Math.ceil(Math.random() + 1)

        metaInfo = {
          announce: udpAnnouceUrlFixture.toString(),
          info: {
            name: metaInfoNameFixture,
            pieces: randomBytes(Math.ceil((Math.random() + 1) * 10)),
            'piece length': Math.ceil((Math.random() + 1) * 10),
            length: length
          }
        }

        const torrentSize = getTorrentSize(metaInfo)
        expect(torrentSize).toBe(BigInt(length))
      }
    )

    test('calculates torrent comprises of multiple files', () => {
      const numFiles = Math.ceil((Math.random() + 1) * 10)

      const fileLengths = Array.from({ length: numFiles }, () =>
        Math.ceil(Math.random() * numFiles)
      )

      metaInfo = {
        announce: udpAnnouceUrlFixture.toString(),
        info: {
          name: metaInfoNameFixture,
          pieces: randomBytes(Math.ceil((Math.random() + 1) * 10)),
          'piece length': Math.ceil((Math.random() + 1) * 10),
          files: fileLengths.map((length) => ({
            length,
            path: randomBytes(Math.ceil((Math.random() + 1) * 10)).toString()
          }))
        }
      }

      const torrentSize = getTorrentSize(metaInfo)
      const expectedSize = BigInt(
        fileLengths.reduce((prev, cur) => prev + cur, 0)
      )

      expect(torrentSize).toBe(expectedSize)
    })
  })
})
