const fs = require('fs')
const path = require('path')
const rimraf = require('rimraf')

module.exports = class Cleaner {
  constructor(dirPath) {
    this.dirPath = dirPath
  }

  clean() {
    if (!this.dirPath) {
      console.warn('this.dirPath not set, ignore cleaning job')
    }

    fs.readdir(this.dirPath, function (_err, files) {
      files.forEach((file) => {
        const filepath = path.join(this.dirPath, file)
        fs.stat(filepath, (err, stat) => {
          if (err) {
            return console.error(err)
          }
          const now = new Date().getTime()
          // remove files older than 1 hour
          const endTime = new Date(stat.ctime).getTime() + 3600000
          if (now > endTime) {
            return rimraf(filepath, (err) => {
              if (err) {
                return console.error(err)
              }
              console.log(`removed files older than 1 hour in ${this.dirPath}`)
            })
          }
        })
      })
    })
  }
}
