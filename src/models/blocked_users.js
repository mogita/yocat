const mongoose = require('mongoose')
mongoose.Promise = global.Promise
const Schema = mongoose.Schema

const BlockedUser = new Schema(
  {
    uniqueId: { type: String, required: true, index: true, unique: true },
  },
  { minimize: false, timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, retainKeyOrder: true },
)

BlockedUser.set('toJSON', {
  transform(doc, ret, options) {
    delete ret.__v
    return ret
  },
})

BlockedUser.statics.findById = function (id) {
  return this.model('BlockedUser').findOne({ _id: id }).exec()
}

BlockedUser.statics.deleteById = function (id) {
  return this.model('BlockedUser').remove({ _id: id }).exec()
}

BlockedUser.statics.findByUniqueId = function (id) {
  return this.model('BlockedUser').findOne({ uniqueId: id }).exec()
}

BlockedUser.statics.deleteByUniqueId = function (id) {
  return this.model('BlockedUser').remove({ uniqueId: id }).exec()
}

BlockedUser.statics.upsertUser = function (uniqueId) {
  return this.model('BlockedUser')
    .update(
      { uniqueId },
      {
        uniqueId,
      },
      { upsert: true },
    )
    .exec()
}

module.exports = mongoose.model('BlockedUser', BlockedUser)
