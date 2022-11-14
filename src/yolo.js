const axios = require('axios')

module.exports = class YoloClient {
  async challengeImage(imageFilePath) {
    const challengeRes = await axios.get('http://yocat2-yolo-api:8000/api/detect_from_image', {
      params: {
        image: imageFilePath,
      },
    })

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

    if (!Array.isArray(challengeRes.detected_labels) || !challengeRes.detected_labels.length) {
      // "detected_labels" field is invalid
      return returnVal
    }

    // start to evaluate labels and scores
    const labels = challengeRes.detected_labels

    const initVal = parseFloat(0.0)
    const catScores = labels
      .filter((item) => item.label === 'cat')
      .reduce((accu, item) => {
        return accu + (parseFloat(item.confidence) || 0)
      }, initVal)

    const dogScores = labels
      .filter((item) => item.label === 'dog')
      .reduce((accu, item) => {
        return accu + (parseFloat(item.confidence) || 0)
      }, initVal)

    returnVal.scores.cat = catScores
    returnVal.scores.dog = dogScores

    if (catScores >= dogScores && catScores >= 0.5) {
      returnVal.category = 'cat'
      returnVal.passed = true
      return returnVal
    } else if (dogScores > catScores && dogScores >= 0.5) {
      returnVal.category = 'dog'
      returnVal.passed = true
      return returnVal
    }

    return returnVal
  }
}