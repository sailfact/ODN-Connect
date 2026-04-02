/**
 * Generate placeholder icon files for the ODN Connect application.
 * Creates icon.png (256x256), icon.ico (multi-size), and icon.icns.
 *
 * Uses raw pixel data and file format encoding — no external dependencies.
 * The icon is a simple circle with the ODN brand color (#00c8f0) on a dark background.
 */

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const RESOURCES_DIR = path.join(__dirname, '..', 'resources')

// Colors
const BG = [7, 9, 15, 255]       // #07090f (dark background)
const FG = [0, 200, 240, 255]    // #00c8f0 (accent blue)
const WHITE = [232, 238, 246, 255] // #e8eef6 (text)

/**
 * Create a 256x256 RGBA pixel buffer with an ODN circle icon.
 */
function createIconPixels(size) {
  const pixels = Buffer.alloc(size * size * 4)
  const cx = size / 2
  const cy = size / 2
  const outerR = size * 0.42
  const innerR = size * 0.32
  const letterWidth = size * 0.06

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4
      const dx = x - cx
      const dy = y - cy
      const dist = Math.sqrt(dx * dx + dy * dy)

      let color = BG

      // Draw ring
      if (dist <= outerR && dist >= innerR) {
        color = FG
      }

      // Draw "O" letter in center (simplified as a small circle outline)
      const letterR = size * 0.14
      const letterInnerR = size * 0.08
      if (dist <= letterR && dist >= letterInnerR) {
        color = WHITE
      }

      pixels[idx] = color[0]
      pixels[idx + 1] = color[1]
      pixels[idx + 2] = color[2]
      pixels[idx + 3] = color[3]
    }
  }

  return pixels
}

/**
 * Encode RGBA pixels as a PNG file.
 */
function encodePNG(pixels, width, height) {
  // PNG raw data: filter byte (0 = None) + row pixels
  const rawData = Buffer.alloc(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 4)
    rawData[rowOffset] = 0 // filter: None
    pixels.copy(rawData, rowOffset + 1, y * width * 4, (y + 1) * width * 4)
  }

  const compressed = zlib.deflateSync(rawData)

  // Build PNG file
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  function makeChunk(type, data) {
    const typeBytes = Buffer.from(type, 'ascii')
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const combined = Buffer.concat([typeBytes, data])
    const crc = crc32(combined)
    const crcBuf = Buffer.alloc(4)
    crcBuf.writeUInt32BE(crc >>> 0)
    return Buffer.concat([length, combined, crcBuf])
  }

  // IHDR
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8  // bit depth
  ihdr[9] = 6  // color type: RGBA
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace

  const idat = compressed
  const iend = Buffer.alloc(0)

  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idat),
    makeChunk('IEND', iend)
  ])
}

/**
 * CRC32 for PNG chunks.
 */
function crc32(buf) {
  let table = crc32.table
  if (!table) {
    table = crc32.table = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) {
        if (c & 1) {
          c = 0xedb88320 ^ (c >>> 1)
        } else {
          c = c >>> 1
        }
      }
      table[n] = c
    }
  }
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

/**
 * Downscale RGBA pixels from srcSize to dstSize using simple area averaging.
 */
function downscale(pixels, srcSize, dstSize) {
  const out = Buffer.alloc(dstSize * dstSize * 4)
  const ratio = srcSize / dstSize

  for (let y = 0; y < dstSize; y++) {
    for (let x = 0; x < dstSize; x++) {
      let r = 0, g = 0, b = 0, a = 0, count = 0
      const sy0 = Math.floor(y * ratio)
      const sy1 = Math.min(Math.floor((y + 1) * ratio), srcSize)
      const sx0 = Math.floor(x * ratio)
      const sx1 = Math.min(Math.floor((x + 1) * ratio), srcSize)

      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const si = (sy * srcSize + sx) * 4
          r += pixels[si]
          g += pixels[si + 1]
          b += pixels[si + 2]
          a += pixels[si + 3]
          count++
        }
      }

      const di = (y * dstSize + x) * 4
      out[di] = Math.round(r / count)
      out[di + 1] = Math.round(g / count)
      out[di + 2] = Math.round(b / count)
      out[di + 3] = Math.round(a / count)
    }
  }

  return out
}

/**
 * Create an ICO file with multiple sizes.
 */
function encodeICO(pixels256) {
  const sizes = [16, 32, 48, 256]
  const images = sizes.map(size => {
    const px = size === 256 ? pixels256 : downscale(pixels256, 256, size)
    return encodePNG(px, size, size)
  })

  // ICO header: 6 bytes
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)           // reserved
  header.writeUInt16LE(1, 2)           // type: ICO
  header.writeUInt16LE(images.length, 4) // count

  // Directory entries: 16 bytes each
  const dirSize = images.length * 16
  let dataOffset = 6 + dirSize

  const entries = []
  for (let i = 0; i < images.length; i++) {
    const entry = Buffer.alloc(16)
    entry[0] = sizes[i] === 256 ? 0 : sizes[i] // width (0 = 256)
    entry[1] = sizes[i] === 256 ? 0 : sizes[i] // height
    entry[2] = 0  // color palette
    entry[3] = 0  // reserved
    entry.writeUInt16LE(1, 4)  // color planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(images[i].length, 8) // image data size
    entry.writeUInt32LE(dataOffset, 12)      // offset to data
    dataOffset += images[i].length
    entries.push(entry)
  }

  return Buffer.concat([header, ...entries, ...images])
}

/**
 * Create a minimal ICNS file with a 256x256 icon.
 * Uses 'ic08' type (256x256 PNG).
 */
function encodeICNS(pixels256) {
  const png256 = encodePNG(pixels256, 256, 256)

  // ic08 = 256x256 PNG
  const typeTag = Buffer.from('ic08', 'ascii')
  const entryLength = Buffer.alloc(4)
  entryLength.writeUInt32BE(8 + png256.length) // 4 type + 4 length + data

  const icnsHeader = Buffer.from('icns', 'ascii')
  const totalLength = Buffer.alloc(4)
  totalLength.writeUInt32BE(8 + 8 + png256.length) // header(8) + entry(8 + data)

  return Buffer.concat([icnsHeader, totalLength, typeTag, entryLength, png256])
}

// ─── Main ───────────────────────────────────────────────────────────────────

console.log('Generating icon resources...')

const pixels = createIconPixels(256)

const png = encodePNG(pixels, 256, 256)
fs.writeFileSync(path.join(RESOURCES_DIR, 'icon.png'), png)
console.log('  ✓ icon.png (256x256)')

const ico = encodeICO(pixels)
fs.writeFileSync(path.join(RESOURCES_DIR, 'icon.ico'), ico)
console.log('  ✓ icon.ico (16, 32, 48, 256)')

const icns = encodeICNS(pixels)
fs.writeFileSync(path.join(RESOURCES_DIR, 'icon.icns'), icns)
console.log('  ✓ icon.icns (256x256)')

console.log('Done.')
