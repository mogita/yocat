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
  sources: [
    {
      type: 'mastodon',
      domain: 'mastodon.social',
      accessToken: '',
    },
  ],
}
