import { join } from 'path'
import { readFileSync } from 'fs'

const FILE_NAME = 'puppy.torrent'

function parseTorrent(): void {
  const filePath = join(process.cwd(), FILE_NAME)
  const torrent = readFileSync(filePath).toString('utf-8')
  console.log(torrent)
}

parseTorrent()
