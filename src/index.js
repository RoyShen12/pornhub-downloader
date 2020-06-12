process.env.TZ = 'Asia/Shanghai'
// process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const fs = require('fs')
const path = require('path')

fs.existsSync('./config.json') || fs.writeFileSync('./config.json', JSON.stringify({
  proxyUrl: '',
  timeout: 0,
  downloadDir: './downloads/',
  httpChunkSizeKB: 5120
}, null, 2))

/**
 * @type {{ proxyUrl: string, timeout: number, downloadDir: string, httpChunkSizeKB: number, aria2: any }}
 */
const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'config.json')).toString())

// const util = require('util')
const { performance } = require('perf_hooks')
const fetch = require('make-fetch-happen').defaults()
const hs = require('human-size')
const prettyMilliseconds = require('pretty-ms')
const meow = require('meow')
const chalk = require('chalk').default

const logger = require('./lib/logger')
const vblog = require('./lib/verbose')
const strTools = require('./lib/str')
const LANGS = require('./lib/LANG')

const cli = meow(`
    Usage
      $ node src -s <> [options]
      $ node src -k <> [options]

    Options
      -s, --search <str>        Searching key word
                                搜索关键词下载

      -k, --key <str>           Sprightly download target video from given key (or muitl keys sepreted by commas)
                                直接下载ph号

      -p, --parallel <num>  (ex)Enable parallel downloading to accelerate download speed
                                多线程下载（实验性功能）

      -e, --exclude <str>       Excluding key word (or muitl words sepreted by commas) using for title filter
                                关键词过滤，对视频的标题进行过滤，多个关键词请用英文逗号连接

      -a, --amount <num>        Only download specified amount of files, default is Infinity
                                仅下载指定数量的视频后结束任务

      --limit-speed <num>       Limit download speed to specified rate (KB)
                                限制下载速度为指定值，单位是 KB

      -l, --limit <num>         Limitation of the downloading content (MB), default is Infinity
                                指定下载的总大小，到达指定大小后结束任务，单位是 MB

      -f, --fakerun             Fake running (Dry run), won't actually download anything
                                干运行，不会实际下载视频、写入dlist

      --force                   Force downloading, even the file is already downloaded or exists
                                强制下载，无视 dlist 记录和本地已存在文件

      --skip <num>              Skip the first few videos
                                跳过前 N 个视频

      --skipless <num>          Skipping file smaller than the given size (MB)
                                跳过小于指定大小的视频，单位是 MB

      --skipmore <num>          Skipping file larger than the given size (MB)
                                跳过大于指定大小的视频，单位是 MB

      --rebuild-dlist           Rebuild the dlist.txt by searching the download path

      --list-only               Only list keys from searching key word
                                仅列出搜索结果的ph号，并不会实际下载

      -d, --dir                 Specify storage directory to cover the config file option
                                指定存储目录，覆盖配置文件的项

      --preview                 Show preview image of each video before downloading
                                显示缩略图预览（需要Mac与iTerm版本>2.9）

      --preview-size <num>      Preview image height for iTerm2 only (show while --list-only or --verbose flag is on), default is 40px
                                缩略图显示尺寸，默认是40px

      --verbose                 Make the process more talkative
`, {
    flags: {
      search: {
        alias: 's'
      },
      key: {
        alias: 'k'
      },
      parallel: {
        alias: 'p'
      },
      exclude: {
        alias: 'e'
      },
      limitSpeed: {},
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
      force: {
        type: 'boolean'
      },
      dir: {
        alias: 'd'
      },
      skip: {
        default: '0'
      },
      skipless: {
      },
      skipmore: {
      },
      rebuildDlist: {
        type: 'boolean'
      },
      verbose: {
        type: 'boolean'
      },
      listOnly: {
        type: 'boolean'
      },
      preview: {
        type: 'boolean'
      },
      previewSize: {
        default: '40px'
      }
    }
})

logger.initNewLogger('main', (t, m) => console.log(logger.logLevelToColor(t)(m)))
const log = logger.getLogger('main')

if (cli.flags.skipless && isNaN(+cli.flags.skipless)) {
  console.log(`--skipless: ${LANGS['Invalid number value']} '${cli.flags.skipless}'`)
  process.exit(0)
}

if (cli.flags.skipmore && isNaN(+cli.flags.skipmore)) {
  console.log(`--skipless: : ${LANGS['Invalid number value']} '${cli.flags.skipmore}'`)
  process.exit(0)
}

if (cli.flags.parallel && isNaN(+cli.flags.parallel)) {
  console.log(`--parallel (-p): ${LANGS['Invalid number value']} '${cli.flags.parallel}'`)
  process.exit(0)
}

if (cli.flags.limitSpeed) {
  if (isNaN(+cli.flags.limitSpeed)) {
    console.log(`--limitSpeed: ${LANGS['Invalid number value']} '${cli.flags.limitSpeed}'`)
    process.exit(0)
  }
  log('info', `${LANGS['netword limitation']}: ${hs(cli.flags.limitSpeed * 1024)}/s`)
}

global.cli = cli

fs.existsSync('./dlist.txt') || fs.writeFileSync('./dlist.txt', '')

const scrapy = require('./lib/scrapy')

let processShutdownToken = false

const stdin = process.stdin

stdin.setEncoding('utf8')
stdin.on('readable', function() {
  const chunk = process.stdin.read()
  //
  // Restart process when user inputs stop
  //
  if (chunk !== null && chunk === 'stop\n' || chunk === 'stop\r\n') {
    log('alert', LANGS['process will shutdown after current download finish.'])
    processShutdownToken = true
  }
})

if (cli.flags.verbose) {
  fs.existsSync('./debug') || fs.mkdirSync('./debug')
}

const run = async () => {
  vblog('[main run] entered')

  fs.existsSync(config.downloadDir) || fs.mkdirSync(config.downloadDir)
  fs.existsSync('./dlist.txt') || fs.writeFileSync('./dlist.txt', '')

  /**
   * start from 1
   */
  let page = 1

  /**
   * @type {{ search: string, key: string }}
   */
  const { search, key } = cli.flags


  if (!search && !key) {
    console.log(LANGS['The program cannot run if neither --search nor --key is provided!'])
    process.exit(0)
  }

  // Key Mode
  if (key) {
    const keyList = key.split(',')
    for (const k of keyList) {
      try {
        let info = null

        while (!info) {

          try {
            info = await scrapy.findDownloadInfo(k)
          } catch (error) {
            log('error', 'error occured while getting download info, waiting for retry')
            info = null
            log('error', error, true)
          }
        }

        if (!info.title || info.title.trim().length === 0) {
          log('warn', `cannot find the video title, skipping ${k}.`)
          continue
        }

        const result = await scrapy.downloadVideo(info, '', undefined, cli.flags.parallel)
        log('suc', result[0])
      } catch (error) {
        console.error(error)
      }
    }

    log('suc', LANGS['task finished.'])
    process.exit(0)
  }
  // Search Mode
  else {
    const limit = +cli.flags.limit
    const amountLimit = +cli.flags.amount

    let skip = +cli.flags.skip

    log('notice', `skipping first ${skip} results`)

    if (isNaN(limit)) {
      console.log(`--limit (-l): ${LANGS['Invalid number value']} '${cli.flags.limit}'`)
      process.exit(0)
    }

    if (isNaN(amountLimit)) {
      console.log(`--amount (-a): ${LANGS['Invalid number value']} '${cli.flags.amount}'`)
      process.exit(0)
    }

    if (isNaN(skip)) {
      console.log(`--skip: ${LANGS['Invalid number value']} '${cli.flags.skip}'`)
      process.exit(0)
    }

    const limitBytes = limit * 1024 ** 2

    let downloadedSize = 0

    log('info', `set Maximum download size: ${chalk.blueBright(limit + '')} MB, Maximum download amount: ${chalk.blueBright(amountLimit + '')}`)
    log('info', `set search keyword: ${chalk.blueBright(search)}`)
    log('notice', LANGS['type "stop" and enter, and this program will be terminated after the current download task finished.'])

    fs.writeFileSync('./search.log', (new Date().toLocaleString() + '   ') + search + '\n', {
      flag: 'a+', encoding: 'utf-8'
    })

    let downloadCount = 0

    // --- download loop ---
    while (downloadedSize <= limitBytes && downloadCount < amountLimit && !processShutdownToken) {

      const opts = {
        page,
        search
      }

      vblog('[main download] while loop entered')

      const keys = await scrapy.findKeys(opts)

      if (!Array.isArray(keys) || keys.length === 0) {
        throw new Error('scrapy.findKeys: find nothing!')
      }

      if (cli.flags.listOnly) {
        vblog('[main download] skip key loop (listOnly)')
        page += 1
        continue
      }

      if (skip > 0) {
        const remainSkip = skip > keys.length ? skip - keys.length : 0
        // console.log(keys)
        new Array(Math.min(keys.length, skip)).fill(1).forEach(() => keys.shift())
        // console.log(keys)
        skip = remainSkip
      }

      // --- one page loop ---
      for (const key of keys) {
        vblog(`[main download] for...of loop entered, key=${key}`)

        if (downloadedSize > limitBytes || downloadCount >= amountLimit || processShutdownToken) {
          break
        }

        let info = null
        let result = null

        while (!info) {

          try {
            info = await scrapy.findDownloadInfo(key)
          } catch (error) {
            log('error', 'error occured while getting download info, waiting for retry')
            info = null
            log('error', error, true)
          }
        }

        if (!info.title || info.title.trim().length === 0) {
          log('warn', `cannot find the video title, skipping ${key}.`)
          continue
        }

        downloadCount++

        let sizeOfDl = -1
        let fileStoreName = ''

        try {
          result = await scrapy.downloadVideo(info, search, downloadCount, cli.flags.parallel)
          sizeOfDl = +result[1]
          fileStoreName = result[2]
        } catch (error) {
          log('error', 'error occured while downloading the video')
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
        log('verbose', `downloading size statistic (this/total/limitation): ${hs(sizeOfDl)} / ${hs(downloadedSize)} / ${limit} MB`)

        if (config.aria2 && config.aria2.address && fileStoreName) {
          fetch(config.aria2.address, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'aria2.addUri',
              id: strTools.randomStr(48),
              params: [
                'token:<token>',
                [`${config.aria2.localPrefix}/${strTools.transferBadSymbolOnFileName(search)}/${fileStoreName}`],
                {}
              ]
            })
          }).then(res => {
            return res.json()
          }).then(data => {
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

    log('suc', `One situation has been satisfied, process will auto quit.
total time cost: ${prettyMilliseconds(performance.now(), { verbose: true })}
total download size: ${hs(downloadedSize)}`)

    setTimeout(process.exit, 200, 0)
  }

}

if (cli.flags.rebuildDlist) {
  const older = new Set(fs.readFileSync(path.join(process.cwd(), './dlist.txt')).toString().split('\n'))
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

process.on('unhandledRejection', (reason, p) => {
  console.log('unhandled promise rejection:', reason, p)
})
