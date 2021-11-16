const mega = require('megalodon')
const Tasks = require('./../models/tasks')
const FSM = require('./../fsm')

module.exports = class Mastodon {
  constructor(baseUrl, accessToken) {
    this.baseUrl = baseUrl
    this.client = mega.default('mastodon', `wss://${baseUrl}`, accessToken)
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
      this.runStatus(status)
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

  async runStatus(status) {
    console.log(`[${this.baseUrl}] 📥 enqueued status ${status.url}`)

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

      const fsm = new FSM(task, (repostValidity, err) => {
        if (err !== null) {
          console.warn(`[${this.baseUrl}] 🙅 status will not be reposted ${status.url}:`, err)
          return
        }

        if (repostValidity.cat === true) {
          console.log(`[${this.baseUrl}] 😻 status will be reposted by YoCat ${status.url}`)
        }

        if (repostValidity.dog === true) {
          console.log(`[${this.baseUrl}] 🐶 status will be reposted by YoDog ${status.url}`)
        }
      })
    } catch (err) {
      throw err
    }
  }
}
