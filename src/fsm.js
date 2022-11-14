const StateMachine = require('javascript-state-machine')
const path = require('path')
const axios = require('axios')
const fs = require('fs-extra')
const states = require('./states')
const config = require('./../config')
const YoloClient = require('./yolo')
const Tasks = require('./models/tasks')
const screenshot = require('./screenshot')
const globAsync = require('./glob-async')

module.exports = class FSM {
  constructor(task, repostFunc) {
    this.task = task
    this.mediaRemotePaths = task.mediaRemotePaths
    this.challengeRes = [{}]

    // The repost function should be implemented by the fsm user, the fsm will
    // put appropriate parameters to indicate if should repost and how to repost.
    // This is due to fsm needing to handle the retry logic while it is unaware
    // of the implementation of different crawlers
    //
    // The repostFunc will be called with these parameters:
    // repostFunc({cat: boolean, dog: boolean}, Error | null)
    this.repostFunc = repostFunc
    if (typeof this.repostFunc !== 'function') {
      throw new Error('must provide a repost function')
    }

    const onEnterState = this.onEnterState.bind(this)

    const failedToDownloadOrTodo = this.failedToDownloadOrTodo.bind(this)
    const failedToRecognizeOrWillRecognize = this.failedToRecognizeOrWillRecognize.bind(this)
    const failedToRepostOrWillRepost = this.failedToRepostOrWillRepost.bind(this)

    const onDownload = this.onDownload.bind(this)
    const onDownloadSuccess = this.onDownloadSuccess.bind(this)
    const onDownloadFailure = this.onDownloadFailure.bind(this)
    const onRecognize = this.onRecognize.bind(this)
    const onRecognizeSuccessAndWillRepost = this.onRecognizeSuccessAndWillRepost.bind(this)
    const onRecognizeSuccessButWillNotRepost = this.onRecognizeSuccessButWillNotRepost.bind(this)
    const onRecognizeFailure = this.onRecognizeFailure.bind(this)
    const onRepost = this.onRepost.bind(this)
    const onRepostSuccess = this.onRepostSuccess.bind(this)
    const onRepostFailure = this.onRepostFailure.bind(this)

    this.fsm = new StateMachine({
      init: states.TODO,
      transitions: [
        { name: 'download', from: states.TODO, to: states.DOWNLOADING },
        { name: 'downloadSuccess', from: states.DOWNLOADING, to: states.WILL_RECOGNIZE },
        { name: 'downloadFailure', from: states.DOWNLOADING, to: failedToDownloadOrTodo },
        { name: 'recognize', from: states.WILL_RECOGNIZE, to: states.RECOGNIZING },
        { name: 'recognizeSuccessAndWillRepost', from: states.RECOGNIZING, to: states.WILL_REPOST },
        { name: 'recognizeSuccessButWillNotRepost', from: states.RECOGNIZING, to: states.WILL_NOT_REPOST },
        { name: 'recognizeFailure', from: states.RECOGNIZING, to: failedToRecognizeOrWillRecognize },
        { name: 'repost', from: states.WILL_REPOST, to: states.REPOSTING },
        { name: 'repostSuccess', from: states.REPOSTING, to: states.REPOSTED },
        { name: 'repostFailure', from: states.REPOSTING, to: failedToRepostOrWillRepost },
      ],
      methods: {
        // built-in events
        onEnterState,

        // custom events
        onDownload,
        onDownloadSuccess,
        onDownloadFailure,
        onRecognize,
        onRecognizeSuccessAndWillRepost,
        onRecognizeSuccessButWillNotRepost,
        onRecognizeFailure,
        onRepost,
        onRepostSuccess,
        onRepostFailure,
      },
    })

    // initialize transition
    setTimeout(() => this.fsm.download())
  }

  async onDownload() {
    try {
      const localPaths = []

      for (const url of this.mediaRemotePaths) {
        const parts = url.split('.')
        const suffix = parts[parts.length - 1]
        const filename = `${this.task.uniqueId}.${suffix}`
        const localPath = `${config.files.imageCacheDir}/${filename}`

        try {
          await this.downloadFile(url, localPath)
        } catch (err) {
          console.error(`[${this.task.uniqueId}] failed to download image file from ${url}`, err)
          continue
        }

        // take screenshots if the file is a video
        if (suffix === 'mp4') {
          try {
            await screenshot(localPath, `${localPath}-%i.jpg`)
            const files = await globAsync(`${localPath}-*`)
            if (Array.isArray(files)) {
              files.forEach((file) => localPaths.push(file))
            }
          } catch (err) {
            console.error(`[${this.task.uniqueId}] failed to take screenshots from video file`, err)
            continue
          }
        } else {
          localPaths.push(localPath)
        }
      }

      this.task.mediaLocalPaths = localPaths
      await Tasks.updateMediaLocalPathsById(this.task.id, localPaths)

      setTimeout(() => this.fsm.downloadSuccess())
    } catch (err) {
      console.error(`[${this.task.uniqueId}] failed to download images`, err)
      setTimeout(() => this.fsm.downloadFailure())
    }
  }

  onDownloadSuccess() {
    setTimeout(() => this.fsm.recognize())
  }

  onDownloadFailure() {
    this.endTask('media download failures exhausted')
  }

  async onRecognize() {
    try {
      if (this.task.mediaLocalPaths.length === 0 && this.task.mediaRemotePaths.length > 0) {
        console.warn(`[${this.task.uniqueId}] no media downloaded yet`)
        await this.addLog('no media downloaded')
        return false
      }

      const yolo = new YoloClient()

      for (const filepath of this.task.mediaLocalPaths) {
        const basename = path.basename(filepath)
        const res = await yolo.challengeImage(basename)

        this.challengeRes.push(res)
        await this.addLog(
          `tags: ${JSON.stringify(res.labels)}. cat score: ${res.scores.cat}, dog score: ${res.scores.dog}`,
        )
      }

      await Tasks.updateChallengeResById(this.task.id, this.challengeRes)

      const totalPass = this.challengeRes.reduce((prev, cur) => {
        if (cur.passed === true) {
          prev++
        }
        return prev
      }, 0)

      if (totalPass > 0) {
        await this.addLog(`media challenge passed, will repost`)
        setTimeout(() => this.fsm.recognizeSuccessAndWillRepost())
      } else {
        await this.addLog(`media challenge did not pass, will not repost`)
        setTimeout(() => this.fsm.recognizeSuccessButWillNotRepost())
      }
    } catch (err) {
      console.error(`[${this.task.uniqueId}] failed to recognize image`, err)
      await this.addLog(`failed to recognize image: ${err}`)
      setTimeout(() => this.fsm.recognizeFailure())
    }
  }

  onRecognizeSuccessAndWillRepost() {
    setTimeout(() => this.fsm.repost())
  }

  onRecognizeSuccessButWillNotRepost() {
    this.endTask('recognition done, criteria not met')
  }

  onRecognizeFailure() {
    setTimeout(() => {
      if (this.fsm.state === states.WILL_RECOGNIZE) {
        setTimeout(() => this.fsm.recognize())
      } else {
        this.endTask('recognition failures exhausted')
      }
    })
  }

  async onRepost() {
    try {
      const catValid = this.challengeRes.filter((i) => i.category === 'cat').length > 0
      const dogValid = this.challengeRes.filter((i) => i.category === 'dog').length > 0

      console.log(`[${this.task.uniqueId}] will repost as ${catValid ? 'cat, ' : ''}${dogValid ? 'dog, ' : ''}`)

      // Either or both fail, it counts as a failure
      // TODO: This can potentially cause sending duplicated reposts to SNS like Fanfou,
      // but specifically for Fanfou, it detects repeated posts and rejects them anyway.
      // Maybe put different reposts into separated queues to handle this more elegantly?
      const repostErr = await this.repostFunc({ cat: catValid, dog: dogValid }, null)
      if (repostErr) {
        throw new Error(repostErr)
      }

      await this.addLog(`image reposted as cat: ${catValid}, dog: ${dogValid}`)
      setTimeout(() => this.fsm.repostSuccess())
    } catch (err) {
      console.error(`[${this.task.uniqueId}] failed to repost`, err)
      await this.addLog(`failed to repost: ${err}`)
      setTimeout(() => this.fsm.repostFailure())
    }
  }

  async onRepostSuccess() {
    this.endTask(null)
  }

  onRepostFailure() {
    setTimeout(() => {
      if (this.fsm.state === states.WILL_REPOST) {
        setTimeout(() => this.fsm.repost())
      } else {
        this.endTask('repost failures exhausted')
      }
    })
  }

  // ---------------- State Branches ----------------

  failedToDownloadOrTodo() {
    if (this.task.downloadTry >= 3) {
      return states.FAILED_TO_DOWNLOAD
    } else {
      return states.TODO
    }
  }

  failedToRecognizeOrWillRecognize() {
    if (this.task.recognizeTry >= 3) {
      return states.FAILED_TO_RECOGNIZE
    } else {
      return states.WILL_RECOGNIZE
    }
  }

  failedToRepostOrWillRepost() {
    if (this.task.repostTry >= 3) {
      return states.FAILED_TO_REPOST
    } else {
      return states.WILL_REPOST
    }
  }

  // ---------------- Utils ----------------

  async onEnterState(lifecycle) {
    if (!lifecycle || !lifecycle.transition || lifecycle.transition === 'init') {
      return false
    }

    switch (lifecycle.to) {
      case states.DOWNLOADING:
        this.task.downloadTry++
        await Tasks.addDownloadTryById(this.task.id)
        break
      case states.RECOGNIZING:
        this.task.recognizeTry++
        await Tasks.addRecognizeTryById(this.task.id)
        break
      case states.REPOSTING:
        this.task.repostTry++
        await Tasks.addRepostTryById(this.task.id)
        break
      default:
        break
    }

    return Tasks.updateTaskState(this.task.id, lifecycle.to)
  }

  endTask(err) {
    // don't care about the return value of repostFunc
    // basically fsm is simply telling it the task has ended
    // with an optional message
    this.repostFunc({}, err)
  }

  downloadFile(url, localPath) {
    return new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(localPath)
      axios({
        method: 'get',
        url,
        responseType: 'stream',
      })
        .then((res) => {
          res.data.pipe(writeStream)
          writeStream.on('finish', resolve)
          writeStream.on('error', reject)
        })
        .catch(reject)
    })
  }

  async addLog(log) {
    return Tasks.addLogById(this.task.id, this.fsm.state, log)
  }
}
