module.exports = {
  randomStr(bits) {
    let ret = ''
    for (let index = 0; index < bits; index++) {
      ret += ((Math.random() * 16 | 0) & 0xf).toString(16)
    }
    return ret
  },
  transferBadSymbolOnFileName(fn) {
    return fn.replace(/[\\/\*:"\?<>|\s@!$%]/g, '_')
  },
  transferBadSymbolOnPathName(pn) {
    return pn.replace(/[\*:"\?<>|\s@!$%]/g, '_')
  },
  fileNameToTitle(fn) {
    return fn.replace(/^\d*_/, '').replace(/_\d{3,}P_ph[0-9a-f]+\.mp4$/, '')
  },
  DateTimeToFileString(DateObj, needHour = false, needMinute = false, needSecond = false, needMillisecond = false) {
    const year = DateObj.getFullYear()
    const month = ((DateObj.getMonth() + 1) + '').padStart(2, '0')
    const day = (DateObj.getDate() + '').padStart(2, '0')
    const hour = needHour ? (DateObj.getHours() + '').padStart(2, '0') : ''
    const minute = needMinute ? (DateObj.getMinutes() + '').padStart(2, '0') : ''
    const second = needSecond ? (DateObj.getSeconds() + '').padStart(2, '0') : ''
    const millisecond = needMillisecond ? (DateObj.getMilliseconds() + '').padStart(3, '0') : ''
    return `${year}-${month}-${day} ${hour}_${minute}_${second}.${millisecond}`
  },
  WideStr: class {
    constructor(s) {
      this._str = []
      s.split('').forEach(ch => {
        const length = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/.test(ch) ? 2 : 1
        this._str.push({ ch, length })
      })
    }
    get length() {
      return this._str.reduce((pv, v) => pv + v.length, 0)
    }
    substr(start, length) {
      length = Math.min(length, this._str.length - start)
      let ret = ''
      let sumL = 0
      for (let i = start;; i++) {
        if (sumL === length || (sumL === length - 1 && this._str[i].length === 2)) break
        ret += this._str[i].ch
        sumL += this._str[i].length
      }
      return ret
    }
    toString() {
      return this._str.map(ls => ls.ch).join('')
    }
  }
}
