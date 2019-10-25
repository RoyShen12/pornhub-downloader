process.env.TZ = 'Asia/Shanghai'

// const childProcess = require('child_process')

const meow = require('meow')

const cli = meow(`
    Usage
      $ node src -s <> [options]

    Options
      --search, -s   Searching key words
      --limit, -l    Limit of download content size (MB)
      --fakerun, -f  Fake running, won't actually download anything
`, {
    flags: {
      search: {
        type: 'string',
        alias: 's'
      },
      limit: {
        type: 'string',
        alias: 'l',
        default: 'Infinity'
      },
      fakerun: {
        type: 'boolean',
        alias: 'f'
      }
    }
})

global.cli = cli

const fs = require('fs')
const path = require('path')

const axios = require('axios').default
const logger = require('ya-node-logger')

/**
 * @type {{ proxyUrl: string, timeout: number, downloadDir: string, httpChunkSizeKB: number, aria2: any }}
 */
const config = JSON.parse(fs.readFileSync('config.json').toString())

logger.initNewLogger('main', '.', 'log-', '', true, (t, m) => console.log(logger.logLevelToColor(t)(m)))
const log = logger.getLogger('main')

const scrapy = require('./lib/scrapy')
const strTools = require('./lib/str')

const run = async () => {

  fs.existsSync(config.downloadDir) || fs.mkdirSync(config.downloadDir)

  // delete last download fragments
  fs.readdirSync(config.downloadDir).forEach(dp => {
    if (dp === '.DS_Store') return

    const secDir = path.resolve(config.downloadDir, dp)

    fs.readdirSync(secDir).forEach(fp => {
      if (!fp.includes('.') && fp.indexOf('ph') === 0) {
        fs.unlinkSync(path.resolve(secDir, fp))
      }
    })
  })

  let page = 1
  let search = cli.flags.search

  const limit = +cli.flags.limit

  if (isNaN(limit)) {
    console.log('bad arg --limit (-l), should be a number')
    process.exit(0)
  }

  let downloadedSize = 0

  log('info', `set limit dl size: ${limit}`)
  log('info', `set search key: ${search}`)

  fs.writeFileSync('./search.log', (new Date().toLocaleString() + '   ') + search + '\n', {
    flag: 'a+', encoding: 'utf-8'
  })

  // --- download loop ---
  while (downloadedSize <= limit) {

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

      if (downloadedSize > limit) {
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

      let sizeOfDl = -1
      let fileStoreName = ''
      try {
        result = await scrapy.downloadVideo(info, search)
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
            'token:1278950212',
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

  log('warn', `downloading content size is ${downloadedSize / 1024 / 1024} MB, process auto quit`)
}

run()
