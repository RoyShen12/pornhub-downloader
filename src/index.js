process.env.TZ = 'Asia/Shanghai'

// const childProcess = require('child_process')
const fs = require('fs')

/**
 * @type {{ proxyUrl: string, timeout: number, downloadDir: string, httpChunkSizeKB: number, aria2: any }}
 */
const config = JSON.parse(fs.readFileSync('config.json').toString())

const path = require('path')
const { performance } = require('perf_hooks')

const axios = require('axios').default
const logger = require('ya-node-logger')

const prettyMilliseconds = require('pretty-ms')

const meow = require('meow')

const strTools = require('./lib/str')

const cli = meow(`
    Usage
      $ node src -s <> [options]

    Options
      --search, -s         Searching key word
      --exclude, -e        Excluding key word
      --amount, -a         Only download specified amount of files
      --limit, -l          Limitation of the downloading content (MB)
      --fakerun, -f        Fake running (Dry run), won't actually download anything
      --skipless           Skipping file smaller than the given size (MB)
      --skipmore           Skipping file larger than the given size (MB)
      --rebuild_dlist      Rebuild the dlist.txt by searching the download path
`, {
    flags: {
      search: {
        alias: 's'
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
      },
      skipmore: {
      },
      rebuild_dlist: {
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

logger.initNewLogger('main', '.', 'log-', '', true, (t, m) => console.log(logger.logLevelToColor(t)(m)))
const log = logger.getLogger('main')

const scrapy = require('./lib/scrapy')

const run = async () => {

  fs.existsSync(config.downloadDir) || fs.mkdirSync(config.downloadDir)

  // delete last download fragments
  // fs.readdirSync(config.downloadDir).forEach(dp => {
  //   if (dp === '.DS_Store') return

  //   const dpath = path.resolve(config.downloadDir, dp)
  //   const fstat = fs.statSync(dpath)
  //   if (fstat.isDirectory()) {
  //     fs.readdirSync(dpath).forEach(fp => {
  //       if (!fp.includes('.') && fp.indexOf('ph') === 0) {
  //         fs.unlinkSync(path.resolve(dpath, fp))
  //       }
  //     })
  //   }
  // })

  let page = 1
  let search = cli.flags.search

  if (!search) {
    console.log('bad arg --search (-s), should be a valid string')
    process.exit(0)
  }

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

  log('info', `set limit dl size: ${limit}, dl amount: ${amountLimit}`)
  log('info', `set search key: ${search}`)

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

    const keys = await scrapy.findKeys(opts)

    if (!Array.isArray(keys) || keys.length === 0) {
      throw new Error('find nothing!')
    }

    // --- one page loop ---
    for (const key of keys) {

      if (downloadedSize > limit || downloadCount >= amountLimit) {
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
      log('verbose', `this turn has downloaded ${(sizeOfDl / 1024 / 1024).toFixed(3)} MB, total download size: ${(downloadedSize / 1024 / 1024).toFixed(3)} MB`)

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
total download content size: ${(downloadedSize / 1024 / 1024).toFixed(2)} MB`)

  setTimeout(process.exit, 500, 0)
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
