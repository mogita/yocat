const glob = require('glob')

module.exports = function (pattern) {
  return new Promise((resolve, reject) => {
    glob(pattern, {}, (err, files) => {
      if (err) {
        reject(err)
      } else {
        resolve(files)
      }
    })
  })
}
