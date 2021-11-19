const mega = require('megalodon')
const { fromUrl, parseDomain } = require('parse-domain')
const Tasks = require('./../models/tasks')
const BlockedUsers = require('./../models/blocked_users')
const FSM = require('./../fsm')
const config = require('./../../config')

module.exports = class Mastodon {
  constructor(baseUrl, accessToken) {
    this.baseUrl = baseUrl
    this.accessToken = accessToken
    this.streamClient = mega.default('mastodon', `wss://${baseUrl}`, accessToken)
    this.httpClient = mega.default('mastodon', `https://${baseUrl}`, accessToken)
    this.streamer = null
  }

  startStreamer() {
    if (this.streamer !== null) {
      console.log(this.baseUrl, 'streamer already running')
      return
    }

    this.streamer = this.streamClient.publicSocket()

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

  async onStatus(status) {
    try {
      if ((await this.shouldKeepStatus(status)) === false) {
        return
      }

      this.runStatus(status)
    } catch (err) {
      console.error(err)
    }
  }

  onError(err) {
    console.error(`[${this.baseUrl}] ${err}`)
  }

  async shouldKeepStatus(status) {
    const { hostname } = parseDomain(fromUrl(status.url))

    // Ignore toots from unwanted instances
    if (config.mastodon.allowedHosts.indexOf(hostname) < 0) {
      return false
    }

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

    // Ignore toot of a blocked user
    const query = `${this.baseUrl}/@${status.account.username}`
    const blockedUser = await BlockedUsers.findByUniqueId(query)
    if (blockedUser) {
      console.log(`[${this.baseUrl}] 🚷 user ${query} has opted out`)
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

      const fsm = new FSM(task, async (repostValidity, msg) => {
        if (msg !== null) {
          console.warn(`[${this.baseUrl}] 🙅 status will not be reposted: ${msg}. ${status.url}`)
          return
        }

        if (repostValidity.cat === true) {
          try {
            await this.httpClient.reblogStatus(id)
            console.log(`[${this.baseUrl}] 😻 status reposted by YoCat ${status.url}`)
          } catch (err) {
            return err
          }
        }

        if (repostValidity.dog === true) {
          try {
            console.log(`[${this.baseUrl}] 🐶 status should be reposted by YoDog ${status.url} (not yet implemented)`)
          } catch (err) {
            return err
          }
        }

        return null
      })
    } catch (err) {
      throw err
    }
  }
}
