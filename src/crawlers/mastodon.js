const mega = require('megalodon')
const Tasks = require('./../models/tasks')

module.exports = class Mastodon {
  constructor(baseUrl, accessToken) {
    this.baseUrl = baseUrl
    this.client = mega.default('mastodon', baseUrl, accessToken)
    this.streamer = null
  }

  startStreamer() {
    if (this.streamer !== null) {
      console.log(this.baseUrl, 'streamer already running')
      return
    }

    this.streamer = this.client.localSocket()

    this.streamer.on('connect', (_) => {
      console.log('streamer connected to', this.baseUrl)
    })

    this.streamer.on('update', this.onStatus.bind(this))

    this.streamer.on('error', this.onError.bind(this))

    this.streamer.on('connection-limit-exceeded', (err) => {
      console.warn(`[${this.baseUrl}] instance has exceeded the connection limit and is going to stop`)
      this.stopStreamer()
    })
  }

  stopStreamer() {
    this.streamer.stop()
    this.streamer.removeAllListeners()
    this.streamer = null
  }

  onStatus(status) {
    if (this.shouldKeepStatus(status) === false) {
      // console.log(`[${this.baseUrl}] ignored status ${status.url}`)
      return
    }

    try {
      this.enqueue(status)
      console.log(`[${this.baseUrl}] 📥 enqueued status ${status.url}`)
    } catch (err) {
      console.error(err)
    }
  }

  onError(err) {
    console.error(`[${this.baseUrl}] ${err}`)
  }

  shouldKeepStatus(status) {
    // Ignore boosted toot
    if (status.reblogged === true) {
      return false
    }

    // Ignore toot without media
    if (!Array.isArray(status.media_attachments) || status.media_attachments.length === 0) {
      return false
    }

    // Ignore toot without an image
    const images = status.media_attachments.filter((media) => media.type === 'image')
    if (images.length === 0) {
      return false
    }

    return true
  }

  async enqueue(status) {
    const { id } = status

    // Extract images
    const images = status.media_attachments.filter((media) => media.type === 'image')
    const remoteImages = images.map((o) => o.url)

    const task = new Tasks({
      uniqueId: `${this.baseUrl}_${id}`,
      postId: id,
      originalPost: status,
      mediaRemotePaths: remoteImages,
    })

    try {
      await task.save()
    } catch (err) {
      throw err
    }
  }
}
