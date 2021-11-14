const fs = require('fs-extra')
const mongoose = require('mongoose')
const config = require('./config')
const crawlers = require('./src/crawlers')

console.log('Yocat system starting...')

const { db, files } = config
fs.ensureDirSync(files.imageCacheDir)

const dsn = `mongodb://${db.user}:${db.pass}@${db.host}:${db.port}/${db.database}`
let dbReady = false
let retryDbConnLeft = 3

;(async () => {
  while (dbReady === false && retryDbConnLeft > 0) {
    try {
      console.log('attempting database connection...')
      await mongoose.connect(dsn, { useNewUrlParser: true })
    } catch (err) {
      console.warn(err)
    } finally {
      retryDbConnLeft--
      if (retryDbConnLeft === 0) {
        console.error('database connection failed after 3 attempts')
        process.exit(1)
      }
    }
  }
})()

mongoose.connection.on('connected', () => {
  console.log('database connected')
  dbReady = true

  // start crawling
  crawlers.init(config.sources)
})

mongoose.connection.on('error', (err) => {
  console.error('database connection error', err)
})

mongoose.connection.on('disconnected', () => {
  console.warn('database disconnected')
})

process.on('SIGINT', () => {
  mongoose.connection.close(() => {
    console.log('database connection closed')
    process.exit(0)
  })
})
