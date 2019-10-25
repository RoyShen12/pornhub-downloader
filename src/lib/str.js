module.exports = {
  randomStr: function (bits) {
    let ret = ''
    for (let index = 0; index < bits; index++) {
      ret += ((Math.random() * 16 | 0) & 0xf).toString(16)
    }
    return ret
  },
  transferBadSymbolOnFileName: function(fn) {
    return fn.replace(/[\\/\*:"\?<>|\s@!$%]/g, '_')
  },
  transferBadSymbolOnPathName: function(pn) {
    return pn.replace(/[\*:"\?<>|\s@!$%]/g, '_')
  }
}
