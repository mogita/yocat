const Mastodon = require('./mastodon')

exports.init = (sources) => {
  sources.forEach((source) => {
    switch (source.type) {
      case 'mastodon':
        console.log(`connecting to ${source.domain}...`)
        const mast = new Mastodon(source.domain, source.accessToken)
        mast.startStreamer()
        break
      case 'fanfou':
        break
      default:
    }
  })
}
