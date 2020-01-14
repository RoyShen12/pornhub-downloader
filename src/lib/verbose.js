const chalk = require('chalk').default
const { performance } = require('perf_hooks')

/**
 * @param {string} c
 */
const vblog = c => {
  if (global.cli.flags.verbose) {
    c = c.replace(/\[(\w+)\]/, chalk.cyanBright('[$1]'))
    c = c.replace(/<([\w\s]+)>/, chalk.magentaBright('<$1>'))
    c = c.replace(/(\sentered[\s,]?)/, chalk.green('$1'))
    c = c.replace(/(\sexits[\s,]?)/, chalk.red('$1'))
    c = chalk.gray('(debug) ') + c
    console.log(c)
  }
}

/**
 * @type {Map<string, number>}
 */
vblog.watches = new Map()

/**
 * @param {string} name
 * @param {boolean} start
 */
vblog.stopWatch = (name, start) => {
  if (!global.cli.flags.verbose) return 0
  if (start) {
    vblog.watches.set(name, performance.now())
  }
  else {
    return performance.now() - vblog.watches.get(name)
  }
  // if (vblog.watches.has(name)) {
  //   const tm = performance.now() - vblog.watches.get(name)
  //   vblog.watches.delete(name)
  //   return tm
  // }
  // else {
  //   vblog.watches.set(name, performance.now())
  // }
}

module.exports = vblog
