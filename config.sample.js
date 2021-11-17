module.exports = {
  db: {
    host: 'localhost',
    port: 27017,
    database: '',
    user: '',
    pass: '',
  },
  files: {
    imageCacheDir: '/tmp/yocat_image_cache',
  },
  baiduai: {
    appId: '',
    apiKey: '',
    secretKey: '',
  },
  mastodon: {
    domain: 'mastodon.social',
    accessToken: '',
    allowedHosts: ['mastodon.social', 'alive.bar', 'o3o.ca', 'nofan.xyz', 'me.ns.ci'],
  },
}
