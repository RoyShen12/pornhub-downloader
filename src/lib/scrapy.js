const fs = require('fs')
const fsp = fs.promises
const path = require('path')
const os = require('os')
const vm = require('vm')
const util = require('util')
// eslint-disable-next-line no-unused-vars
const sysUtil = util

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const tempDir = path.resolve(os.tmpdir(), 'ph-dler/')
fs.existsSync(tempDir) || fs.mkdirSync(tempDir)

/**
 * @type {{ proxyUrl: string, timeout: number, downloadDir: string, httpChunkSizeKB: number }}
 */
const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'config.json')).toString())


const _ = require('lodash')

const chalk = require('chalk').default

const imgcat = require('imgcat')

const disk = require('diskusage')

const cheerio = require('cheerio')

// const request = require('request')
const makeFetchHappen = require('make-fetch-happen')

const Throttle = require('throttle')

const hs = require('human-size')
const pretty = require('pretty')
const prettyMilliseconds = require('pretty-ms')
const ProgressBar = require('progress')
const progressStream = require('progress-stream')

const LANGS = require('./LANG')

const downloadText = LANGS.downloading
const eatText = LANGS.EAT
const pieceText = LANGS.Piece

const { performance } = require('perf_hooks')
const perf = performance

const log = require('./logger').getLogger('main')

const LimitedQueue = require('./limited-queue')

// in windows, file name should not contain these symbols
// * : " * ? < > |
// here is the method to transfer these symbol to leagal ones
const {
  transferBadSymbolOnFileName,
  transferBadSymbolOnPathName,
  fileNameToTitle,
  randomStr,
  WideStr,
  DateTimeToFileString
} = require('./str')

const vblog = require('./verbose')

const domain = 'cn.pornhub.com'
const baseUrl = `https://${domain}`

const customHeaders = {
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,ja;q=0.7,zh-TW;q=0.6',
  // 'Cache-Control': 'max-age=0',
  // 'Connection': 'keep-alive',
  // 'Cookie': '',
  'DNT': '1',
  // 'Host': domain,
  // 'Referer': baseUrl,
  // 'Upgrade-Insecure-Requests': '1',
  // 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Safari/605.1.15'
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.61 Safari/537.36'
}

const baseFetchOptions = {
  // cacheManager: './.cache',
  headers: customHeaders,
  retry: 5,
  onRetry() {
    log('warn', `[Fetch] ${LANGS.retrying}...`)
  }
}

// proxy
if (config.proxyUrl.trim().length > 0) {
  log('notice', `${LANGS['Using Proxy']}: ${chalk.yellowBright(config.proxyUrl.trim())}`)
  baseFetchOptions.proxy = config.proxyUrl.trim()
}

// timeout
if (config.timeout > 0) {
  baseFetchOptions.timeout = config.timeout * 1000
}

const fetch = makeFetchHappen.defaults(baseFetchOptions)

const httpChunkBytes = (config.httpChunkSizeKB || 2048) * 1024

async function findKeys(opts) {
  vblog.stopWatch('findKeys-requests', true)
  vblog(`[findKeys] entered, opt=${util.inspect(opts, false, Infinity, true)}`)

  const url = `${baseUrl}/video/search?search=${encodeURIComponent(opts.search.trim())}&page=${opts.page}` // &suggestion=true
  vblog(`[findKeys] requests to ${chalk.greenBright(url)}`)
  const res = await fetch(url)
  // console.log(res)
  /**
   * @type {string}
   */
  const text = await res.text()
  // console.log(text)
  if (global.cli.flags.verbose) fs.writeFileSync(`./debug/search-${DateTimeToFileString(new Date(), true, true, true, true)}.html`, pretty(text))
  const $ = cheerio.load(text)
  /**
   * @type {string[]}
   */
  const allKeys = []
  /**
   * @type {Map<string, { name: string, img: string }>}
   */
  const previews = new Map()

  $('.videoblock.videoBox').each((_idx, element) => {
    const key = element.attribs['_vkey']
    vblog(`[findKeys] working on .videoblock.videoBox Node, key=${chalk.greenBright(key)}`)
    const $$ = cheerio.load($(element).html())
    const previewImg = $$('img')
    const alt = previewImg.attr('alt')
    const imgUrl = previewImg.attr('data-thumb_url')

    previews.set(key, { name: alt, img: imgUrl })
    allKeys.push(key)
  })

  const skipKeys = []
  $('.dropdownHottestVideos .videoblock.videoBox').each((idx, element) => {
    const key = element.attribs['_vkey']
    vblog(`[findKeys] working on .dropdownHottestVideos .videoblock.videoBox Node, exclude key=${chalk.greenBright(key)}`)
    skipKeys.push(key)
  })

  $('.dropdownReccomendedVideos .videoblock.videoBox').each((idx, element) => {
    const key = element.attribs['_vkey']
    vblog(`[findKeys] working on .dropdownReccomendedVideos .videoblock.videoBox Node, exclude key=${chalk.greenBright(key)}`)
    skipKeys.push(key)
  })

  const retKeys = allKeys.filter(k => !skipKeys.includes(k))

  const tm = chalk.redBright(prettyMilliseconds(vblog.stopWatch('findKeys-requests', false), { verbose: true }))
  vblog(`[findKeys] exits with ret=${util.inspect(retKeys, false, Infinity, true)}, time cost ${tm}`)

  if (global.cli.flags.preview) {
    for (const rk of retKeys) {
      try {
        const { name, img } = previews.get(rk)
        // console.log('downloading image', img)
        let imgBuf = await (await fetch(img)).buffer()
        // console.log('download ok.')
        const imgTfName = `${randomStr(16)}.jpg`
        const imgTfPath = path.resolve(tempDir, imgTfName)
        await fsp.writeFile(imgTfPath, imgBuf)
        // console.log(`key: ${rk} name: ${name} preview: ${imgTfPath}`)
        /**
         * @type {string}
         */
        const image = await imgcat(imgTfPath, { height: global.cli.flags.previewSize, preserveAspectRatio: true })
        console.log(image + ` <- thumb of ${chalk.blue(name)}, key=${chalk.greenBright(rk)}`)
      } catch (error) {
        console.error(error)
      }
    }
  }

  if (global.cli.flags.listOnly) {
    console.log(retKeys)
  }

  return retKeys
}

/**
 * @param {string} bodyStr
 */
function findTitle(bodyStr) {
  vblog.stopWatch('findTitle', true)
  vblog(`[findTitle] entered, (bodyStr length=${bodyStr.length})`)

  const $ = cheerio.load(bodyStr)
  const title = $('title').text()

  vblog(`[findTitle] gets raw title=${title}`)

  const arr = title.split('-')
  arr.pop()

  const ret = arr.join('-').trim()

  const tm = chalk.redBright(prettyMilliseconds(vblog.stopWatch('findTitle', false), { verbose: true }))
  vblog(`[findTitle] exits with ret=${ret}, time cost ${tm}`)

  return ret
}

/**
 * @param {string} bodyStr
 */
function parseDownloadInfo(bodyStr) {
  vblog.stopWatch('parseDIF', true)
  vblog(`[parseDownloadInfo] entered, (bodyStr length=${bodyStr.length})`)

  if (global.cli.flags.verbose) fs.writeFileSync(`./debug/video-${DateTimeToFileString(new Date(), true, true, true, true)}.html`, pretty(bodyStr))

  let info
  const idx = bodyStr.indexOf('mediaDefinitions')

  if (idx < 0) {
    vblog('[parseDownloadInfo] exits with wrong <mediaDefinitions> section !')
    return info
  }

  const $ = cheerio.load(bodyStr)
  const scripts = $('script').toArray()
  // console.log(sysUtil.inspect(scripts, false, 2, true))
  const inlineScripts = scripts.filter(sc => sc.children.length > 0)
  // inlineScripts.forEach(is => is.children.length > 0 ? console.log(is.children[0].data) : '---')
  const inlineScriptText = inlineScripts.map(is => is.children.map(ch => ch.data).join('\n'))
  // console.log(inlineScriptText.length, inlineScriptText)
  // console.log(sysUtil.inspect(inlineScripts, false, 3, true))
  // process.exit(0)
  //const inlineScriptText = inlineScripts.map(sc => sc.data)
  const jsline = inlineScriptText.find(ist => ist.includes('var flashvars'))
  // console.log(jsline)

  //const jsline = bodyStr.split('\n').find(l => l.includes('var flashvars')).trim().replace(/^var\s?flashvars\S{1}\d+\s?=\s?/, 'k = ')
  if (!jsline) {
    vblog('[parseDownloadInfo] exits with wrong jsline !')
    return info
  }

  try {
    // eslint-disable-next-line
    const c = vm.createContext({ playerObjList: { } })
    vm.runInContext(jsline, c)
    // console.log(sysUtil.inspect(c, false, 4, true))
    for (const k in c) {
      if (/flashvars_\d+/.test(k) && c[k].mediaDefinitions) {
        // console.log(sysUtil.inspect(c[k].mediaDefinitions, false, 3, true))
        const arr = c[k].mediaDefinitions
          .filter(s => s.videoUrl.length > 0)
          .sort((a, b) => {
            return a.quality !== b.quality ? (+b.quality) - (+a.quality) : b.format.localeCompare(a.format)
          })
        // console.log(arr)
        // process.exit(0)
        const ret = arr[0]
        ret.title = findTitle(bodyStr)

        const tm = chalk.redBright(prettyMilliseconds(vblog.stopWatch('parseDIF', false), { verbose: true }))
        // vblog(`[parseDownloadInfo] exits with ret=${util.inspect(ret, false, Infinity, true)}, time cost ${tm}`)
        vblog(`[parseDownloadInfo] exits, time cost ${tm}`)

        return ret
      }
    }
    // console.log(sysUtil.inspect(c, false, 3, true))
    // process.exit(0)
  } catch (error) {
    console.error(error)
    return ''
  }
}

async function findDownloadInfo(key) {
  vblog.stopWatch('findDF', true)
  vblog(`[findDownloadInfo] entered with key=${key}`)

  // let finalKey = key
  const url = `https://www.pornhub.com/view_video.php?viewkey=${key}`
  vblog(`[findDownloadInfo] requests to ${chalk.greenBright(url)}`)
  const res = await fetch(url)
  /**
   * @type {string}
   */
  const text = await res.text()

  const ditem = parseDownloadInfo(text)
  if (ditem) {
    ditem.key = key
  }

  const tm = chalk.redBright(prettyMilliseconds(vblog.stopWatch('findDF', false), { verbose: true }))
  vblog(`[findDownloadInfo] exits with ret=${util.inspect(ditem, false, Infinity, true)}, time cost ${tm}`)

  return ditem
}

/**
 * @param {{ title: string, quality: string, key: string, videoUrl: string }} ditem
 * @param {string} folderName
 * @param {number} downloadCount
 * @param {number} parallel
 */
async function downloadVideo(ditem, folderName, downloadCount, parallel) {
  vblog.stopWatch('scrapy.js-downloadVideo', true)
  vblog(`[downloadVideo] entered, folderName=${chalk.yellowBright(folderName)}, downloadCount=${chalk.greenBright(downloadCount)}`)

  const title = ditem.title.trim()

  const _wide_title = new WideStr(title)

  const shortTitle = _wide_title.length <= 20 ? title : (_wide_title.substr(0, 17) + '...')

  const transferedTitle = transferBadSymbolOnFileName(title)
  const filename = `${transferedTitle}_${ditem.quality}P_${ditem.key}.mp4`
  // const transferedFilename = transferBadSymbolOnFileName(filename)
  const filenameWithRank = downloadCount === undefined ? filename : `${(downloadCount + '').padStart(4, '0')}_${filename}`
  const transferedFilenameWithRank = transferBadSymbolOnFileName(filenameWithRank)

  const dir = path.resolve(config.downloadDir, transferBadSymbolOnFileName(folderName))

  if (!global.cli.flags.fakerun) {
    fs.existsSync(dir) || fs.mkdirSync(dir)
  }

  const dst = path.join(dir, filename)
  const dstWithRank = path.join(dir, filenameWithRank)

  const transferedDst = transferBadSymbolOnPathName(dst)
  const transferedDstWithRank = transferBadSymbolOnPathName(dstWithRank)

  vblog(`[downloadVideo] generated safe title: ${chalk.cyan(transferedTitle)} in safe path: ${chalk.cyanBright(transferedDst)}`)

  if (global.cli.flags.exclude) {
    /**
     * @type {string[]}
     */
    const excludes = global.cli.flags.exclude.split(',')
    if (excludes.some(ex => title.includes(ex))) {
      const resWords = global.cli.flags.verbose ? `title ${title} excluded by user flag ${global.cli.flags.exclude}` : 'skip a video by title filter'
      return [resWords, 0]
    }
  }

  if (fs.existsSync(transferedDst) && downloadCount === undefined) {
    log('warn', `rename to -> ${filenameWithRank}`)
    fs.renameSync(transferedDst, transferedDstWithRank)
    return [`${title} already exists in dl path and has been renamed into new style!`, 0]
  }

  // check new file
  const thisFolderFiles = global.cli.flags.fakerun ? [] : fs.readdirSync(dir).filter(f => f[0] !== '.')
  if (thisFolderFiles.some(oldf => fileNameToTitle(oldf) === transferedTitle)) {
    return [`${title} already exists in dl path!`, 0]
  }

  // check dl list
  const oldFiles = fs.readFileSync(path.join(process.cwd(), './dlist.txt'), 'utf-8').toString().split('\n')
  if (oldFiles.includes(transferedTitle)) {
    return [`${title} already exists in dlist.txt!`, 0]
  }

  log('notice', `start downloading > ${filename}`)
  vblog(`[downloadVideo] requests to ${chalk.greenBright(ditem.videoUrl)}`)

  const res = await fetch(ditem.videoUrl)

  if (res.status !== 200) {
    throw new Error('cannot access to video file, response status ' + chalk.redBright(res.status))
  }
  vblog(`[downloadVideo] getting Code=${chalk.redBright(res.status)}, Header ${util.inspect(res.headers, false, Infinity, true)}`)

  const contentTotalLength = +res.headers.get('content-length')
  vblog(`[downloadVideo] getting content-length: ${chalk.bold(contentTotalLength)} (${chalk.bold(chalk.greenBright(hs(contentTotalLength, 3)))})`)

  if (global.cli.flags.fakerun) return ['fake downloaded!', contentTotalLength]

  if (global.cli.flags.skipless && contentTotalLength < global.cli.flags.skipless * 1024 ** 2) {
    return ['skip this video (size too small for --skipless)', 0]
  }

  if (global.cli.flags.skipmore && contentTotalLength > global.cli.flags.skipmore * 1024 ** 2) {
    return ['skip this video (size too large for --skipmore)', 0]
  }

  // stop tasks while disk is full
  const diskusage = await disk.check(/*os.platform() === 'win32' ? 'c:' : '/'*/config.downloadDir)
  if (diskusage.free < contentTotalLength * 2.5) {
    throw new Error('skip this video (no free disk space remains)')
  }
  else {
    log('verbose', `disk free space: ${hs(diskusage.free, 2)}\n`)
  }

  /**
   * @type { { start: number, end: number }[] }
   */
  const ranges = []

  const _chunkCount = Math.floor(contentTotalLength / httpChunkBytes)
  const _mod = contentTotalLength % httpChunkBytes

  for (let i = 0; i < _chunkCount; i++) {
    ranges.push({
      start: i * httpChunkBytes,
      end: (i + 1) * httpChunkBytes - 1
    })
  }

  if (_mod > 0) {
    ranges.push({
      start: _chunkCount * httpChunkBytes,
      end: contentTotalLength - 1
    })
  }

  if (global.cli.flags.verbose) {
    const rl = ranges.length
    const rll = (rl + '').length
    const vblogRanges = ranges.map((r, i) => `  piece: ${((i + 1) + '').padStart(rll)}/${rl}, range: ${chalk.yellowBright(r.start)} - ${chalk.yellowBright(r.end)}${i !== rl - 1 ? ',' : ''}`).join('\n')

    vblog(`[downloadVideo] <in Promise> generated ranges=\n${vblogRanges}`)
  }

  /**
   * Download Start time
   */
  // const timeStart = perf.now()

  /**
   * Total downloaded size
   */
  let downloadedBytes = 0

  // [11]1[20]1[bar]1[spd]1[5]1[piece]7[3][EAT]
  // 78 + [bar] + [piece] + [progress]
  // 极限情况
  // SC:
  // 下载 title [bar] 582.9KB/s 116.42MB/996.42MB 块:116/997 100% 剩余:4400.0s
  // 86+bar
  const progressBar = new ProgressBar(`${downloadText} ${shortTitle} [:bar] :spd/s :prog ${pieceText}::piece :percent ${eatText}::etas`, {
    incomplete: ' ',
    complete: '-',
    width: process.stdout.columns - 95,
    total: contentTotalLength
  })

  const files = []
  let idx = 0

  const analyzingSteps = 12
  const dlTimeQueue = new LimitedQueue(analyzingSteps)
  const dlChunkQueue = new LimitedQueue(analyzingSteps)

  dlTimeQueue.push(perf.now())
  dlChunkQueue.push(0)

  for (const item of ranges) {
    vblog.stopWatch('scrapy.js-downloadVideo-piece', true)
    vblog(`[downloadVideo] for...of at range=(${chalk.bold(item.start)}, ${chalk.bold(item.end)})`)

    const file = path.join(dir, `${ditem.key}${idx}`)

    files.push(file)

    const standardFile = transferBadSymbolOnPathName(file)

    if (fs.existsSync(standardFile)) {
      const tmpStat = fs.statSync(standardFile)
      vblog(`[downloadVideo] <in Promise> for...of check file piece(${idx + 1}/${ranges.length}) ${chalk.greenBright('(Exists)')} (Size: ${chalk.blueBright(tmpStat.size)})`)
      if (tmpStat.size === httpChunkBytes) {
        log('warn', `detect file ${file} (piece ${idx + 1}/${ranges.length}) already downloaded, skip it`)
        idx += 1
        downloadedBytes += httpChunkBytes
        progressBar.tick(httpChunkBytes, {
          prog: chalk.bold(`${hs(downloadedBytes, 2)}/${hs(contentTotalLength, 2)}`)
        })
        continue
      }
      else {
        vblog(`file ${file} (piece ${idx + 1}/${ranges.length}) exists but ${chalk.yellowBright('Incomplete')}, redownload it`)
      }
    }

    // ----- Download the file frags -----
    const bdOpt = {
      headers: Object.assign(_.cloneDeep(customHeaders), {
        Accept: '*/*',
        'Accept-Encoding': 'identity',
        Range: `bytes=${item.start}-${item.end}`,
        Pragma: 'no-cache',
        'Cache-Control': 'no-cache'
      }),
      retry: 5,
      onRetry() {
        log('warn', `[Fetch] ${LANGS['retrying']}...`)
      }
    }
    if (config.proxyUrl.trim().length > 0) {
      bdOpt.proxy = config.proxyUrl.trim()
    }
    // console.log(util.inspect(bdOpt.headers.Range, false, Infinity, true))
    const bytesFetch = makeFetchHappen.defaults(bdOpt)

    /**
     * @type {Buffer | null}
     */
    let oneFile = null

    while (!oneFile) {
      vblog(`[downloadVideo] for...of while loop for file piece(${idx + 1}/${ranges.length}) entered`)

      try {
        const res = await bytesFetch(ditem.videoUrl)
        vblog(`[downloadVideo] for...of Request for file piece(${idx + 1}/${ranges.length}) responed with
Code=${res.status}
Header=${util.inspect(res.headers, false, 2, true)}`)

        if (res.status !== 206) {
          throw new Error(`error code ${chalk.redBright(res.status)} while downloading piece`)
        }

        // oneFile = await res.buffer()

        // console.log(`Downloaded bytes ${oneFile.length}, Speed ${hs(oneFile.length / (perf.now() - timeStart) * 1000, 1)}`)
        // process.exit(0)

        // const timePE = perf.now()
        // downloadedBytes += oneFile.length
        // const avgSpeed = hs(downloadedBytes / (timePE - timeStart) * 1000, 1)
        // progressBar.tick(oneFile.length, {
        //   spd: avgSpeed,
        //   piece: `${idx + 1}/${ranges.length}`
        // })

        // await fsp.writeFile(standardFile, oneFile, { encoding: 'binary' })

        // idx += 1

        oneFile = await new Promise((resolve, reject) => {
          let OriginStream = res.body

          if (global.cli.flags.limitSpeed) {
            OriginStream = OriginStream.pipe(new Throttle(global.cli.flags.limitSpeed * 1024))
          }

          OriginStream.pipe(progressStream({ time: 17, speed: Infinity }))
          .on('error', err => {
            reject(err)
          })
          .on('progress', innerProgress => {
            const progressTime = perf.now()

            downloadedBytes += innerProgress.delta

            dlTimeQueue.push(progressTime)
            dlChunkQueue.push(downloadedBytes)

            progressBar.tick(innerProgress.delta, {
              // spd: hs(downloadedBytes / (progressTime - timeStart) * 1000, 1),
              spd: hs((dlChunkQueue.last - dlChunkQueue.first) / (dlTimeQueue.last - dlTimeQueue.first) * 1000, 1),
              piece: `${idx + 1}/${ranges.length}`,
              prog: chalk.bold(`${hs(downloadedBytes, 2)}/${hs(contentTotalLength, 2)}`)
            })
          })
          .pipe(fs.createWriteStream(standardFile, { encoding: 'binary', highWaterMark: Math.round(httpChunkBytes * 1.25) }))
          .on('error', err => {
            reject(err)
          })
          .on('close', () => {
            // console.log('\n', downloadedBytes, httpChunkBytes * (idx + 1))
            if (idx < ranges.length - 1 && downloadedBytes !== httpChunkBytes * (idx + 1)) {
              console.log(chalk.bold(chalk.yellowBright('\nbad Close !')))
              downloadedBytes = httpChunkBytes * idx
              reject('bad Close !')
            }
            else {
              vblog(`[downloadVideo] for...of Request for file piece(${idx + 1}/${ranges.length}) ended, Stream closed`)
              idx += 1
              resolve(true)
            }
          })
        })
      } catch (error) {
        oneFile = null
        log('err', error, true)
        log('alert', 'downloading chunk fails, waiting for retry')
        await sleep(500)
      }
    } // ----- end of while
    const tmr = vblog.stopWatch('scrapy.js-downloadVideo-piece', false)
    const tmc = chalk.yellowBright(tmr.toFixed(1))
    const avs = chalk.redBright(hs(httpChunkBytes / tmr * 1000, 1))
    vblog(`[downloadVideo] for...of piece(${idx}/${ranges.length}) exits, time cost ${tmc} ms, speed ${avs}/s`)
  }

  // log('info', 'all pieces have been downloaded, now concat pieces...')

  const ws = fs.createWriteStream(transferedDstWithRank, { flags: 'a', highWaterMark: 32 * 1024 ** 2 }) // 32 MB write cache

  for (const file of files) {
    vblog(`[downloadVideo] <in Promise> for...of at file=${file}`)

    const standardFile = transferBadSymbolOnPathName(file)

    const tmpRead = fs.createReadStream(standardFile, { flags: 'r', highWaterMark: httpChunkBytes })

    await new Promise((__res, __rej) => {
      vblog(`[downloadVideo] <in Promise> for...of <in Promise> pipes file to ${transferedDstWithRank}`)

      tmpRead.pipe(ws, { end: false })
      tmpRead.on('end', () => {
        __res()
      })
      tmpRead.on('error', e => {
        __rej(e)
      })
    })

    vblog('[downloadVideo] <in Promise> for...of <in Promise> deletes file')
    // await fsp.unlink(standardFile)
    fsp.unlink(standardFile)
  }
  ws.end()

  vblog('[downloadVideo] <in Promise> piping ended, appending dlist.txt')

  // comment while debug
  fs.writeFileSync('./dlist.txt', transferedTitle + '\n', { flag: 'a+', encoding: 'utf-8' })

  const ret = [`${dst} downloaded!`, contentTotalLength, transferedFilenameWithRank]

  // vblog(`[downloadVideo] exits with ret=${util.inspect(ret, false, Infinity, true)}`)
  vblog(`[downloadVideo] time cost ${chalk.yellowBright(prettyMilliseconds(vblog.stopWatch('scrapy.js-downloadVideo', false), { verbose: true }))}`)

  return ret
}

module.exports = {
  findKeys,
  findDownloadInfo,
  downloadVideo
}
