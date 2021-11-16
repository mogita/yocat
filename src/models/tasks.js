const mongoose = require('mongoose')
mongoose.Promise = global.Promise
const Schema = mongoose.Schema
const  states  = require('./../states')

const Tasks = new Schema(
  {
    // generated from instance name/url and the post ID
    uniqueId: { type: String, required: true, unique: true },
    // the post ID itself
    postId: { type: String, required: true },
    // the post payload
    originalPost: { type: Schema.Types.Mixed, required: true },
    state: {
      type: String,
      enum: Object.values(states),
      default: states.TODO,
    },
    challengeRes: { type: [{ type: Schema.Types.Mixed, require: false }] },
    mediaRemotePaths: [String],
    mediaLocalPaths: [String],
    downloadTry: { type: Number, required: true, default: 0 },
    recognizeTry: { type: Number, required: true, default: 0 },
    repostTry: { type: Number, required: true, default: 0 },
    logs: { type: [{ state: { type: String }, log: { type: String }, created_at: { type: Date, default: Date.now } }] },
  },
  {
    minimize: false,
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    retainKeyOrder: true,
    strict: false,
  },
)

Tasks.set('toJSON', {
  transform(doc, ret, options) {
    ret.id = ret._id
    delete ret.__v
    return ret
  },
})

Tasks.statics.findById = function (id) {
  return this.model('Tasks').findOne({ _id: id }).exec()
}

Tasks.statics.deleteById = function (id) {
  return this.model('Tasks').remove({ _id: id }).exec()
}

Tasks.statics.addLogById = function (id, state, log = '') {
  return this.model('Tasks')
    .updateOne({ _id: id }, { $push: { logs: { state, log } } })
    .exec()
}

Tasks.statics.updateTaskState = function (id, newState) {
  return this.model('Tasks').updateOne({ _id: id }, { state: newState }).exec()
}

Tasks.statics.addDownloadTryById = function (id) {
  return this.model('Tasks')
    .updateOne({ _id: id }, { $inc: { downloadTry: 1 } })
    .exec()
}

Tasks.statics.addRecognizeTryById = function (id) {
  return this.model('Tasks')
    .updateOne({ _id: id }, { $inc: { recognizeTry: 1 } })
    .exec()
}

Tasks.statics.addRepostTryById = function (id) {
  return this.model('Tasks')
    .updateOne({ _id: id }, { $inc: { repostTry: 1 } })
    .exec()
}

Tasks.statics.updateMediaLocalPathsById = function (id, paths) {
  return this.model('Tasks').updateOne({ _id: id }, { mediaLocalPaths: paths }).exec()
}

Tasks.statics.updateChallengeResById = function (id, challengeRes) {
  return this.model('Tasks').updateOne({ _id: id }, { challengeRes: challengeRes }).exec()
}

module.exports = mongoose.model('Tasks', Tasks)
