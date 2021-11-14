const mega = require('megalodon')

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
      console.warn('streamer', this.baseUrl, 'has exceeded the connection limit and is going to stop')
      this.stopStreamer()
    })
  }

  stopStreamer() {
    this.streamer.stop()
    this.streamer.removeAllListeners()
    this.streamer = null
  }

  onStatus(status) {
    console.log(this.baseUrl, status.id, status.content)
  }

  onError(err) {
    console.error(this.baseUrl, err)
  }
}
