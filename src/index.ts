import { join } from 'path'
import { decode } from 'bencode'
import { readFileSync } from 'fs'

import { logTorrent } from './helpers/logging'

const FILE_NAME = 'puppy.torrent'

function parseTorrent(): void {
  const filePath = join(process.cwd(), FILE_NAME)
  const torrent = decode(readFileSync(filePath))

  logTorrent(torrent)
}

parseTorrent()
