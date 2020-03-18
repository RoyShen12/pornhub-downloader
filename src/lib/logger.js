try {
  Error.stackTraceLimit = 20
} catch (e) {}

const chalk = require('chalk').default

const getTraceInfo = (fx) => {
  const obj = {}
  Error.captureStackTrace(obj, fx || getTraceInfo)
  return obj.stack
}

/**
 * @typedef {keyof logLevel} LogType
 */

/**
 * @type {Map<string, (type: LogType, message: string, trace: boolean = false) => void>}
 */
const loggersCached = new Map()

/**
 * @type {Map<string, string[]>}
 */
const filesOfLogger = new Map() // only store unziped files

const logLevel = new Proxy({
  verbose:  'VERBOSE ',       // -1 各种冗长而不重要的输出
  debug:    'DEBUG   ',       // 0 调试信息的日志，日志信息最多
  suc:      'SUCCESS ',       // 1 重要的运行时成功信息
  info:     'INFO    ',       // 2 一般信息的日志，最常用
  notice:   'NOTICE  ',       // 3 最具有重要性的普通条件的信息
  warn:     'WARNING ',       // 4 警告级别
  err:      'ERROR   ',       // 5 错误级别，阻止某个功能或者模块不能正常工作的信息
  crit:     'CRIT    ',       // 6 严重级别，阻止整个系统或者整个软件不能正常工作的信息
  alert:    'ALERT   ',       // 7 需要立刻修改的信息
  fatal:    'FATAL   ',       // 8 崩溃等严重信息
  get error() { return this.err },
  get success() { return this.suc },
  get warning() { return this.warn },
  get inf() { return this.info },
  get information() { return this.info },
  get dbg() { return this.debug }
}, {
  get: function (target, property, receiver) {
    return Reflect.get(target, property, receiver) || target.info
  }
})

const levelNumberMap = new Map([
  ['VERBOSE ', -1],
  ['DEBUG   ', 0],
  ['SUCCESS ', 1],
  ['INFO    ', 2],
  ['NOTICE  ', 3],
  ['WARNING ', 4],
  ['ERROR   ', 5],
  ['CRIT    ', 6],
  ['ALERT   ', 7],
  ['FATAL   ', 8]
])

const levelColorMap = new Map([
  [-1, chalk.gray],
  [0, chalk.white],
  [1, chalk.greenBright],
  [2, chalk.whiteBright],
  [3, chalk.blueBright],
  [4, chalk.yellowBright],
  [5, chalk.redBright],
  [6, chalk.bgYellowBright],
  [7, chalk.bgMagentaBright],
  [8, chalk.bgRedBright]
])

/**
 * @param {string} level
 */
const logLevelToColor = level => levelColorMap.get(levelNumberMap.get(logLevel[level]))

function timeBasedLogHead(bc) {
  const DateObj = new Date()
  const year = DateObj.getFullYear()
  const month = ((DateObj.getMonth() + 1) + '').padStart(2, '0')
  const day = (DateObj.getDate() + '').padStart(2, '0')
  const hour = (DateObj.getHours() + '').padStart(2, '0')
  const minute = (DateObj.getMinutes() + '').padStart(2, '0')
  const second = (DateObj.getSeconds() + '').padStart(2, '0')
  const msecond = (DateObj.getMilliseconds() + '').padStart(3, '0')
  let blank = ''.padEnd(bc)
  return `${blank}${year}-${month}-${day} ${hour}:${minute}:${second}.${msecond}`
}

/**
 * @param {string} loggerName
 * @param {string} logfilePath
 * @param {string} logFileNameHead
 * @param {string} logFileNameTail
 * @param {boolean} zipOldFiles
 * @param {(type: LogType, logLine: string) => void | () => void} onLoggingHook
 * @returns {void}
 */
function initNewLogger(loggerName, onLoggingHook = () => {}) {

  if (loggerName === 'debug') return null

  if (loggersCached.has(loggerName)) return null

  filesOfLogger.set(loggerName, []) // init file record map

  function _inner_logger_(type, message, trace = false) {

    const timeH = timeBasedLogHead()

    const logLine = trace ?
      (timeH + '  ' + logLevel[type] + '  ' + message.toString() + '\n' + getTraceInfo(_inner_logger_)) :
      (timeH + '  ' + logLevel[type] + '  ' + message.toString())

    onLoggingHook(type, logLine)
  }

  loggersCached.set(loggerName, _inner_logger_)
}

/**
 * - 暴露给外部的获取 Logger 的函数
 * - 如果无 [loggerName] 对应的 Logger
 * - 则回退到 console.log
 * @param {string} loggerName
 * @returns {(type: LogType, message: string, trace?: boolean) => void}
 */
const getLogger = loggerName => loggersCached.get(loggerName) || ((...args) => console.log(...args))

module.exports = {
  initNewLogger,
  getLogger,
  logLevelToColor
}
