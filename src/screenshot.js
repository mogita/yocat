const extractFrames = require('ffmpeg-extract-frames')
const fs = require('fs').promises

module.exports = async function (input, output) {
  const buff = Buffer.alloc(100)
  const header = Buffer.from('mvhd')

  try {
    const file = await fs.open(input, 'r')
    const { buffer } = await file.read(buff, 0, 100, 0)
    await file.close()

    const start = buffer.indexOf(header) + 17
    const timeScale = buffer.readUInt32BE(start)
    const duration = buffer.readUInt32BE(start + 4)
    const lengthInMs = Math.floor((duration / timeScale) * 1000)

    // take 5 screenshots from the given media file at these 5 points:
    // start of the media, 1/4, half, 3/4, and 80 ms before end
    const offsets = [
      0,
      Math.floor(lengthInMs / 4),
      Math.floor(lengthInMs / 2),
      Math.floor((lengthInMs / 4) * 3),
      Math.floor(lengthInMs - 80),
    ]

    await extractFrames({
      input,
      output,
      offsets,
    })
  } catch (err) {
    throw err
  }
}
