const BaiduAip = require('baidu-aip-sdk').imageClassify
const config = require('./../config')

const { appId, apiKey, secretKey } = config.baiduai
const aipClient = new BaiduAip(appId, apiKey, secretKey)

module.exports = class BaiduAipClient {
  async challengeImage(imageFile) {
    const challengeRes = await aipClient.animalDetect(imageFile)

    const returnVal = {
      category: null,
      passed: false,
      scores: {
        cat: 0.0,
        dog: 0.0,
      },
      challengeRes,
    }

    if (challengeRes.error_code && challengeRes.error_code > 0) {
      // received error in response
      return returnVal
    }

    if (!Array.isArray(challengeRes.result) || !challengeRes.result.length) {
      // "result" field is invalid
      return returnVal
    }

    // start to evaluate labels and scores
    const labels = challengeRes.result

    const initVal = parseFloat(0.0)
    const catScores = labels
      .filter((item) => item.name.indexOf('猫') > -1)
      .reduce((accu, item) => {
        return accu + (parseFloat(item.score) || 0)
      }, initVal)

    const dogScores = labels
      .filter((item) => item.name.indexOf('狗') > -1 || item.name.indexOf('犬') > -1)
      .reduce((accu, item) => {
        return accu + (parseFloat(item.score) || 0)
      }, initVal)

    returnVal.scores.cat = catScores
    returnVal.scores.dog = dogScores

    if (catScores > dogScores && catScores >= 0.3) {
      returnVal.category = 'cat'
      returnVal.passed = true
      return returnVal
    } else if (dogScores > catScores && dogScores >= 0.3) {
      returnVal.category = 'dog'
      returnVal.passed = true
      return returnVal
    }

    return returnVal
  }
}
