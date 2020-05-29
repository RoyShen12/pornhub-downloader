const _ = require('lodash')
const osLocale = require('os-locale')

const Locale = osLocale.sync().toLowerCase()

let lang = 'en'

if (Locale.includes('cn') && Locale.includes('zh')) lang = 'sc'

if ((Locale.includes('tw') || Locale.includes('hk')) && Locale.includes('zh')) lang = 'tc'

const STRINGS = {
  downloading: {
    sc: '下载',
    tc: '下載'
  },
  EAT: {
    sc: '剩余',
    tc: '剩余'
  },
  Piece: {
    sc: '块',
    tc: '塊'
  },
  retrying: {
    sc: '重试',
    tc: '重試'
  },
  'Using Proxy': {
    sc: '使用代理',
    tc: '使用代理'
  },
  'process will shutdown after current download finish.': {
    sc: '当前下载完成后，进程将关闭。',
    tc: '當前下載完成後，該進程將關閉。'
  },
  'netword limitation': {
    sc: '网速限制',
    tc: '網絡速度限制'
  },
  'The program cannot run if neither --search nor --key is provided!': {
    sc: '--search 或 --key 参数均未提供，程序无法运行',
    tc: '未提供--search或--key，程序無法運行'
  },
  'task finished.': {
    sc: '任务完成',
    tc: '任務完成'
  },
  'Invalid number value': {
    sc: '不是有效的数字',
    tc: '無效的數值类型'
  },
  'type "stop" and enter, and this program will be terminated after the current download task finished.': {
    sc: '输入"stop"并回车，程序将在当前下载任务结束后自动退出',
    tc: '鍵入“停止”並輸入，當前下載任務完成後，該程式將自動終止。'
  }
}

_.forOwn(STRINGS, (v, k, o) => {
  o[k] = new Proxy(v, {
    get(t, p, r) {
      if (p === 'en') return k
      else return Reflect.get(t, p, r)
    }
  })
})

module.exports = {
  downloading: STRINGS.downloading[lang],
  EAT: STRINGS.EAT[lang],
  Piece: STRINGS.Piece[lang],
  retrying: STRINGS.retrying[lang],
  'Using Proxy': STRINGS['Using Proxy'][lang],
  'process will shutdown after current download finish.': STRINGS['process will shutdown after current download finish.'][lang],
  'netword limitation': STRINGS['netword limitation'][lang],
  'The program cannot run if neither --search nor --key is provided!': STRINGS['The program cannot run if neither --search nor --key is provided!'][lang],
  'task finished.': STRINGS['task finished.'][lang],
  'Invalid number value': STRINGS['Invalid number value'][lang],
  'type "stop" and enter, and this program will be terminated after the current download task finished.': STRINGS['type "stop" and enter, and this program will be terminated after the current download task finished.'][lang]
}
