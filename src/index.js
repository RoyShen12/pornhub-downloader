process.env.TZ = 'Asia/Shanghai'

// const childProcess = require('child_process')
const fs = require('fs')

/**
 * @type {{ proxyUrl: string, timeout: number, downloadDir: string, httpChunkSizeKB: number, aria2: any }}
 */
const config = JSON.parse(fs.readFileSync('config.json').toString())

const os = require('os')
// const util = require('util')
const path = require('path')
const { performance } = require('perf_hooks')

const axios = require('axios').default
const logger = require('./lib/logger')
const hs = require('human-size')
const prettyMilliseconds = require('pretty-ms')
const meow = require('meow')

const vblog = require('./lib/verbose')
const strTools = require('./lib/str')

const cli = meow(`
    Usage
      $ node src -s <> [options]
      $ node src -k <> [options]

    Options
      --search, -s         Searching key word
      --key, -k            Sprightly download target video from given key (or keys sepreted by commas)
      --exclude, -e        Excluding key word
      --amount, -a         Only download specified amount of files, default is Infinity
      --limit, -l          Limitation of the downloading content (MB), default is Infinity
      --fakerun, -f        Fake running (Dry run), won't actually download anything
      --skipless           Skipping file smaller than the given size (MB)
      --skipmore           Skipping file larger than the given size (MB)
      --rebuild_dlist      Rebuild the dlist.txt by searching the download path
      --verbose            Make the process more talkative
`, {
    flags: {
      search: {
        alias: 's'
      },
      key: {
        alias: 'k'
      },
      exclude: {
        alias: 'e'
      },
      limit: {
        alias: 'l',
        default: 'Infinity'
      },
      amount: {
        alias: 'a',
        default: 'Infinity'
      },
      fakerun: {
        type: 'boolean',
        alias: 'f'
      },
      skipless: {
        default: '0'
      },
      skipmore: {
        default: 'Infinity'
      },
      rebuild_dlist: {
        type: 'boolean'
      },
      verbose: {
        type: 'boolean'
      }
    }
})

if (cli.flags.skipless && isNaN(+cli.flags.skipless)) {
  console.log('bad arg --skipless, should be a number')
  process.exit(0)
}

if (cli.flags.skipmore && isNaN(+cli.flags.skipmore)) {
  console.log('bad arg --skipless, should be a number')
  process.exit(0)
}

global.cli = cli

const tmpp = path.resolve(os.tmpdir(), strTools.randomStr(16))
fs.existsSync(tmpp) || fs.mkdirSync(tmpp)

logger.initNewLogger('main', (t, m) => console.log(logger.logLevelToColor(t)(m)))
const log = logger.getLogger('main')

const scrapy = require('./lib/scrapy')

let processShutdownToken = false

const stdin = process.stdin

stdin.setEncoding('utf8')
stdin.on('readable', function() {
  var chunk = process.stdin.read();
  //
  // Restart process when user inputs stop
  //
  if (chunk !== null && chunk === 'stop\n' || chunk === 'stop\r\n') {
    log('alert', 'process will shutdown after current download finish.')
    processShutdownToken = true
  }
})

const run = async () => {
  vblog('[main run] entered')

  fs.existsSync(config.downloadDir) || fs.mkdirSync(config.downloadDir)
  fs.existsSync('./dlist.txt') || fs.writeFileSync('./dlist.txt', '')

  let page = 1
  const { search, key } = cli.flags


  if (!search && !key) {
    console.log('cannot run with both --search and --key flags are not given!')
    process.exit(0)
  }

  // Key Mode
  if (key) {
    const keyList = key.split(',')
    for (const k of keyList) {
      try {
        const info = await scrapy.findDownloadInfo(k)
        const result = await scrapy.downloadVideo(info, '')
        log('suc', result[0])
      } catch (error) {
        console.error(error)
      }
    }

    log('suc', 'task finished.')
    process.exit(0)
  }
  // Search Mode
  else {
    const limit = +cli.flags.limit
    const amountLimit = +cli.flags.amount

    if (isNaN(limit)) {
      console.log('bad arg --limit (-l), should be a number')
      process.exit(0)
    }

    if (isNaN(amountLimit)) {
      console.log('bad arg --amount (-a), should be a number')
      process.exit(0)
    }

    let downloadedSize = 0

    log('info', `set limit dl size: ${limit} MB, dl amount: ${amountLimit}`)
    log('info', `set search key: ${search}`)
    log('notice', 'input "stop" to terminate this program after the current download task finished.')

    fs.writeFileSync('./search.log', (new Date().toLocaleString() + '   ') + search + '\n', {
      flag: 'a+', encoding: 'utf-8'
    })

    let downloadCount = 0

    // --- download loop ---
    while (downloadedSize <= limit && downloadCount < amountLimit) {

      const opts = {
        page,
        search
      }

      vblog('[main download] while loop entered')

      const keys = await scrapy.findKeys(opts)

      if (!Array.isArray(keys) || keys.length === 0) {
        throw new Error('scrapy.findKeys: find nothing!')
      }

      // --- one page loop ---
      for (const key of keys) {
        vblog(`[main download] for...of loop entered, key=${key}`)

        if (downloadedSize > limit || downloadCount >= amountLimit || processShutdownToken) {
          break
        }

        let info = null
        let result = null

        while (!info) {

          try {
            info = await scrapy.findDownloadInfo(key)
          } catch (error) {
            log('error', 'error occured in function [findDownloadInfo], will retry')
            info = null
            log('error', error, true)
          }
        }

        if (!info.title || info.title.trim().length === 0) {
          log('warn', 'cannot find video title.')
          continue
        }

        downloadCount++

        let sizeOfDl = -1
        let fileStoreName = ''

        try {
          result = await scrapy.downloadVideo(info, search, downloadCount)
          sizeOfDl = +result[1]
          fileStoreName = result[2]
        } catch (error) {
          log('error', 'error occured in function [downloadVideo]:')
          log('error', error, true)
          if (error.toString().includes('disk')) {
            process.exit(22)
          } else {
            continue
          }
        }

        if (sizeOfDl > 0) {
          downloadedSize += sizeOfDl
        }

        log('suc', result[0])
        log('verbose', `this turn has downloaded ${hs(sizeOfDl)}, total download size: ${hs(downloadedSize)}`)

        if (config.aria2 && config.aria2.address && fileStoreName) {
          axios.post(config.aria2.address, {
            jsonrpc: '2.0',
            method: 'aria2.addUri',
            id: strTools.randomStr(48),
            params: [
              'token:<token>',
              [`${config.aria2.localPrefix}/${strTools.transferBadSymbolOnFileName(search)}/${fileStoreName}`],
              {}
            ]
          }).then(({ data }) => {
            log('suc', `remote aria2 server: ${data.id}-${data.jsonrpc}-${data.result}`)
          }).catch(err => {
            log('err', 'send command to remote aria2 server failed: ' + err.toString(), true)
          })
        }
      }
      // --- endof one page loop ---

      page += 1
    }
    // --- endof download loop ---

    log('suc', `one of the limitation satisfied, process will auto quit
total time cost: ${prettyMilliseconds(performance.now(), { verbose: true })}
total download content size: ${hs(downloadedSize)}`)

    setTimeout(process.exit, 500, 0)
  }

}

if (cli.flags.rebuildDlist) {
  const older = new Set(fs.readFileSync('./dlist.txt').toString().split('\n'))
  fs.readdirSync(config.downloadDir).forEach(dp => {
    const dpath = path.resolve(config.downloadDir, dp)
    const dstat = fs.statSync(dpath)
    if (dstat.isDirectory()) {
      fs.readdirSync(dpath).forEach(fp => {
        const fpath = path.resolve(dpath, fp)
        const fstat = fs.statSync(fpath)
        if (fp.includes('.mp4') && fstat.isFile()) {
          const title = strTools.fileNameToTitle(fp)
          older.add(title)
        }
      })
    }
  })
  fs.writeFileSync('./dlist.txt', Array.from(older).join('\n') + '\n')
  process.exit(0)
}
else {
  run()
}
