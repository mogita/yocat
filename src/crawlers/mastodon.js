const mega = require('megalodon')
const cheerio = require('cheerio')
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
    // public timeline streamer
    this.publicStreamer = null
    // direct message streamer
    this.userStreamer = null
  }

  startStreamer() {
    if (this.publicStreamer === null) {
      this.startPublicStreamer()
    }

    if (this.userStreamer === null) {
      this.startUserStreamer()
    }
  }

  startPublicStreamer() {
    // start public timeline streamer
    this.publicStreamer = this.streamClient.publicSocket()

    this.publicStreamer.on('connect', (_) => {
      console.log('public timeline streamer connected to', this.baseUrl)
    })

    this.publicStreamer.on('update', this.onStatus.bind(this))

    this.publicStreamer.on('error', this.onError.bind(this))

    this.publicStreamer.on('connection-limit-exceeded', (err) => {
      console.warn(`[${this.baseUrl}] public timeline streamer has exceeded the connection limit and is going to stop`)
      this.stopPublicStreamer()
    })
  }

  startUserStreamer() {
    // start direct messages streamer
    this.userStreamer = this.streamClient.userSocket()

    this.userStreamer.on('connect', (_) => {
      console.log('user streamer connected to', this.baseUrl)
    })

    this.userStreamer.on('update', this.onUserUpdate.bind(this))

    this.userStreamer.on('error', this.onError.bind(this))

    this.userStreamer.on('connection-limit-exceeded', (err) => {
      console.warn(`[${this.baseUrl}] direct message streamer has exceeded the connection limit and is going to stop`)
      this.stopDirectStreamer()
    })
  }

  stopStreamer() {
    this.stopPublicStreamer()
    this.stopDirectStreamer()
  }

  stopPublicStreamer() {
    this.publicStreamer.stop()
    this.publicStreamer.removeAllListeners()
    this.publicStreamer = null
  }

  stopDirectStreamer() {
    this.userStreamer.stop()
    this.userStreamer.removeAllListeners()
    this.userStreamer = null
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

  onUserUpdate(status) {
    const $ = cheerio.load(status.content)
    const msg = $('p').text()
    const { account, id } = status

    if (msg.indexOf('@yocat out') > -1) {
      // user requires to opt out
      this.handleUserOptOut(account.username, account.acct, id)
    } else if (msg.indexOf('@yocat in') > -1) {
      // user requires to opt in
      this.handleUserOptIn(account.username, account.acct, id)
    } else {
      // unknown act
    }
  }

  onError(err) {
    console.error(`[${this.baseUrl}] ${err}`)
  }

  async handleUserOptOut(username, acct, statusId) {
    try {
      await BlockedUsers.upsertUser(`${this.baseUrl}/@${username}`)
      const replyMsg = `@${acct} 😸 YoCat will leave your statuses alone and be a cute nice catto from now on.`
      this.httpClient.postStatus(replyMsg, {
        in_reply_to_id: statusId,
        visibility: 'direct',
      })
    } catch (err) {
      console.log(`[${this.baseUrl}] user opt-out operation failed`, err)
    }
  }

  async handleUserOptIn(username, acct, statusId) {
    try {
      await BlockedUsers.deleteByUniqueId(`${this.baseUrl}/@${username}`)
      const replyMsg = `@${acct} 😻 YoCat will see your statuses for my catto friends from now on.`
      this.httpClient.postStatus(replyMsg, {
        in_reply_to_id: statusId,
        visibility: 'direct',
      })
    } catch (err) {
      console.log(`[${this.baseUrl}] user opt-in operation failed`, err)
    }
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
    const images = status.media_attachments.filter(
      (media) => ['jpg', 'jpeg', 'png'].indexOf(getUrlExtension(media.remote_url || media.url)) > -1,
    )

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
    const images = status.media_attachments.filter(
      (media) => ['jpg', 'jpeg', 'png'].indexOf(getUrlExtension(media.remote_url || media.url)) > -1,
    )
    const remoteImages = images.map((o) => o.remote_url)

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

function getUrlExtension(url) {
  return url.split(/[#?]/)[0].split('.').pop().trim()
}
