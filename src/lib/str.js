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
  }
}
