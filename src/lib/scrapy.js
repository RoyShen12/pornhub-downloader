const fs = require('fs')
const fsp = fs.promises
const path = require('path')
// const os = require('os')
const vm = require('vm')
const util = require('util')

/**
 * @type {{ proxyUrl: string, timeout: number, downloadDir: string, httpChunkSizeKB: number }}
 */
const config = JSON.parse(fs.readFileSync('config.json').toString())


const _ = require('lodash')
const chalk = require('chalk').default
const hs = require('human-size')
const disk = require('diskusage')
const cheerio = require('cheerio')
const request = require('request')
const prettyMilliseconds = require('pretty-ms')
const ProgressBar = require('progress')
const progressStream = require('progress-stream')

const { performance } = require('perf_hooks')

const log = require('ya-node-logger').getLogger('main')

const oldFiles = fs.readFileSync('./dlist.txt', 'utf-8').toString().split('\n')

// in windows, file name should not contain these symbols
// * : " * ? < > |
// here is the method to transfer these symbol to leagal ones
const { transferBadSymbolOnFileName, transferBadSymbolOnPathName, fileNameToTitle } = require('./str')

/**
 * @param {string} c
 */
const vblog = c => {
  if (global.cli.flags.verbose) {
    c = c.replace(/\[(\w+)\]/, chalk.cyanBright('[$1]'))
    c = c.replace(/<(\w+)>/, chalk.magentaBright('<$1>'))
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
 */
vblog.stopWatch = name => {
  if (vblog.watches.has(name)) {
    const tm = performance.now() - vblog.watches.get(name)
    vblog.watches.delete(name)
    return tm
  }
  else {
    vblog.watches.set(name, performance.now())
  }
}

const domain = 'www.pornhub.com'
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
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.0 Safari/605.1.15'
}
const baseReqOpts = {
  headers: customHeaders,
  gzip: true
}

// proxy
if (config.proxyUrl.trim().length > 0) {
  baseReqOpts.proxy = config.proxyUrl.trim()
}

// timeout
if (config.timeout > 0) {
  baseReqOpts.timeout = config.timeout
}

const httpChunkBytes = (config.httpChunkSizeKB || 2048) * 1024

async function findKeys(opts) {
  vblog(`[findKeys] entered, opt=${util.inspect(opts, false, Infinity, true)}`)

  const pm = new Promise((resolve, reject) => {

    const queryObj = {
      search: opts.search.trim(),
      page: opts.page
    }
    const reqOpts = {
      baseUrl,
      qs: queryObj,
      uri: '/video/search',
      url: `${baseUrl}/video/search`
    }

    Object.assign(reqOpts, baseReqOpts)

    vblog(`[findKeys] requests with opt=${util.inspect(reqOpts, false, Infinity, true)}`)

    request(reqOpts, (err, _res, body) => {
      if (err) {
        vblog(`[findKeys] request failed, err=${util.inspect(err, false, 3, true)}`)

        return reject(err)
      }

      const $ = cheerio.load(body)
      const allKeys = []

      $('.videoblock.videoBox').each((_idx, element) => {
        const key = element.attribs['_vkey']
        allKeys.push(key)
      })

      const skipKeys = []
      $('.dropdownHottestVideos .videoblock.videoBox').each((idx, element) => {
        const key = element.attribs['_vkey']
        skipKeys.push(key)
      })

      $('.dropdownReccomendedVideos .videoblock.videoBox').each((idx, element) => {
        const key = element.attribs['_vkey']
        skipKeys.push(key)
      })

      const retKeys = allKeys.filter(k => !skipKeys.includes(k))

      vblog(`[findKeys] exits with ret=${util.inspect(retKeys, false, Infinity, true)} inside Promise`)

      return resolve(retKeys)
    })
  })

  return pm
}

/**
 * @param {string} bodyStr
 */
function findTitle(bodyStr) {
  vblog(`[findTitle] entered, (bodyStr length=${bodyStr.length})`)

  const $ = cheerio.load(bodyStr)
  const title = $('title').text()

  vblog(`[findTitle] gets raw title=${title}`)

  const arr = title.split('-')
  arr.pop()

  const ret = arr.join('-')

  vblog(`[findTitle] exits with ret=${ret}`)

  return ret
}

/**
 * @param {string} bodyStr
 */
function parseDownloadInfo(bodyStr) {
  vblog(`[parseDownloadInfo] entered, (bodyStr length=${bodyStr.length})`)

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
    const c = vm.createContext({ loadScriptUniqueId:[], loadScriptVar: [], playerObjList: { playerDiv_243984141:{} } })
    vm.runInContext(jsline, c)
    // console.log(sysUtil.inspect(a.mediaDefinitions, false, 2, true))

    if (c.loadScriptVar[0].mediaDefinitions) {
      const arr = c.loadScriptVar[0].mediaDefinitions
        .filter(s => s.videoUrl.length > 0)
        .sort((a, b) => {
          return a.quality !== b.quality ? (+b.quality) - (+a.quality) : b.format.localeCompare(a.format)
        })
      // console.log(arr)
      // process.exit(0)
      const ret = arr[0]
      ret.title = findTitle(bodyStr)

      vblog(`[parseDownloadInfo] exits with ret=${util.inspect(ret, false, Infinity, true)}`)

      return ret
    }
    else {
      vblog('[parseDownloadInfo] exits with empty c.loadScriptVar[0].mediaDefinitions !')
      return ''
    }
  } catch (error) {
    console.error(error)
    return ''
  }
}

async function findDownloadInfo(key) {
  vblog(`[findDownloadInfo] entered with key=${key}`)

  let finalKey = key

  return new Promise((resolve, reject) => {

    let pageUrl = `https://www.pornhub.com/view_video.php?viewkey=${key}`
    if (key.startsWith('http')) {
      pageUrl = key
      finalKey = key.split('=').pop()
    }
    let opts = {
      url: pageUrl
    }

    Object.assign(opts, baseReqOpts)

    vblog(`[findDownloadInfo] requests with opt=${util.inspect(opts, false, Infinity, true)}`)

    request(opts, (err, res, body) => {
      if (err) {
        vblog(`[findDownloadInfo] request failed, err=${util.inspect(err, false, 3, true)}`)
        return reject(err)
      }
      const ditem = parseDownloadInfo(body)
      if (ditem) {
        ditem.key = finalKey
      }
      vblog(`[findDownloadInfo] exits with ret=${util.inspect(ditem, false, Infinity, true)} inside Promise`)

      return resolve(ditem)
    })
  })
}

async function downloadVideo(ditem, folderName, downloadCount) {
  vblog.stopWatch('scrapy.js-downloadVideo')
  vblog(`[downloadVideo] entered with ditem=${util.inspect(ditem, false, Infinity, true)}, folderName=${folderName}, downloadCount=${downloadCount}`)

  const title = ditem.title.trim()
  const transferedTitle = transferBadSymbolOnFileName(title)
  const filename = `${transferedTitle}_${ditem.quality}P_${ditem.key}.mp4`
  // const transferedFilename = transferBadSymbolOnFileName(filename)
  const filenameWithRank = `${(downloadCount + '').padStart(4, '0')}_${filename}`
  const transferedFilenameWithRank = transferBadSymbolOnFileName(filenameWithRank)

  const dir = config.downloadDir + transferBadSymbolOnFileName(folderName)

  if (!cli.flags.fakerun) {
    fs.existsSync(dir) || fs.mkdirSync(dir)
  }

  const dst = path.join(dir, filename)
  const dstWithRank = path.join(dir, filenameWithRank)

  const transferedDst = transferBadSymbolOnPathName(dst)
  const transferedDstWithRank = transferBadSymbolOnPathName(dstWithRank)

  vblog(`[downloadVideo] generated safe title: ${transferedTitle}, safe path: ${transferedDst}`)

  const pm = new Promise((resolve, reject) => {
    const thisFolderFiles = global.cli.flags.fakerun ? [] : fs.readdirSync(dir).filter(f => f[0] !== '.')

    if (global.cli.flags.exclude && title.includes(global.cli.flags.exclude)) {
      return resolve([`title ${title} excluded by user flag ${global.cli.flags.exclude}`, 0])
    }
    // check old file
    if (fs.existsSync(transferedDst)) {
      // debug scan
      log('warn', `rename to -> ${filenameWithRank}`)
      fs.renameSync(transferedDst, transferedDstWithRank)
      return resolve([`${title} already exists in dl path and has been renamed into new style!`, 0])
    }
    // check new file
    if (thisFolderFiles.some(oldf => fileNameToTitle(oldf) === transferedTitle)) {
      return resolve([`${title} already exists in dl path!`, 0])
    }
    // check dl list
    if (oldFiles.includes(transferedTitle)) {
      return resolve([`${title} already exists in dlist.txt!`, 0])
    }

    let opts = {
      url: ditem.videoUrl,
      headers: customHeaders,
      gzip: true
    }

    Object.assign(opts, baseReqOpts)

    log('notice', `downloading > ${filename}`)

    vblog(`[downloadVideo] <in Promise> requests with opt=${util.inspect(opts, false, Infinity, true)}`)

    return request.get(opts)
      .on('response', async resp => {
        const resHeaders = resp.headers
        const contentTotalLength = +resHeaders['content-length']

        vblog(`[downloadVideo] <in Promise> getting Header.content-length=${contentTotalLength} (${hs(contentTotalLength)})`)

        if (global.cli.flags.fakerun) return resolve(['fake downloaded!', contentTotalLength])
        if (global.cli.flags.skipsize && global.cli.flags.skipsize * 1024 * 1024 > contentTotalLength) {
          return resolve(['detect file of too small size, skip it', 0])
        }

        // disk is full, stop tasks
        const diskusage = await disk.check(/*os.platform() === 'win32' ? 'c:' : '/'*/config.downloadDir)

        if (diskusage.free < contentTotalLength * 2.1) {
          reject(`incomming video size: ${hs(contentTotalLength)}, which is larger than disk free space: ${hs(diskusage.free)}, process auto quit`)
          return
        }
        else {
          log('verbose', `disk free space: ${hs(diskusage.free)}.\n`)
        }

        //if (contentTotalLength > httpChunkBytes) {

        /**
         * @type { { start: number, end: number }[] }
         */
        const ranges = []

        const _chunkCount = Math.floor(contentTotalLength / httpChunkBytes)
        const _mod = contentTotalLength % httpChunkBytes

        for (let i = 0; i < _chunkCount; i++) {
          ranges.push({
            start: i === 0 ? 0 : i * httpChunkBytes + 1,
            end: (i + 1) * httpChunkBytes
          })
        }

        if (_mod > 0) {
          ranges.push({
            start: _chunkCount === 0 ? 0 : _chunkCount * httpChunkBytes + 1,
            end: contentTotalLength - 1
          })
        }

        vblog(`[downloadVideo] <in Promise> generated ranges=${util.inspect(ranges, false, Infinity, true)}`)

        // log('info', `the file is splitted to ${ranges.length} pieces`)
        const times = performance.now()
        let downloadedBytes = 0

        const progress = new ProgressBar('downloading [:bar] :spd/s :percent Piece::piece ETA::etas', {
          incomplete: ' ',
          width: 80,
          total: contentTotalLength
        })

        const files = []
        let idx = 0

        // const maxPiecesL = (ranges.length + '').length
        // const maxBytesL = (contentTotalLength + '').length

        for (const item of ranges) {
          vblog.stopWatch('scrapy.js-downloadVideo-piece')
          vblog(`[downloadVideo] <in Promise> for...of at range=(${item.start}, ${item.end})`)

          const copyOpts = _.cloneDeep(opts)
          copyOpts.headers['Range'] = `bytes=${item.start}-${item.end}`
          copyOpts.headers['Connection'] = 'keep-alive'

          delete copyOpts.gzip

          const file = path.join(dir, `${ditem.key}${idx}`)

          files.push(file)

          // log('info', `downloading the ${(idx + 1 + '').padEnd(maxPiecesL)} / ${ranges.length} piece from ${(item.start + '').padEnd(maxBytesL)} to ${(item.end + '').padEnd(maxBytesL)} ...`)

          // log('debug', `checking ${file}`)
          if (fs.existsSync(transferBadSymbolOnPathName(file))) {
            const tmpStat = fs.statSync(transferBadSymbolOnPathName(file))
            if (tmpStat.size = httpChunkBytes) {
              log('warn', `detect file ${file} already downloaded, skip.`)
              idx += 1
              progress.tick(httpChunkBytes)
              continue
            }
          }

          // ----- request for file frag -----
          let oneFile = null

          while (!oneFile) {
            vblog(`[downloadVideo] <in Promise> for...of while loop for file piece(${idx}/${ranges.length}) entered`)
            try {
              oneFile = await (new Promise((resolve, reject) => {

                const pgStm = progressStream({ time: 16 })

                pgStm.on('progress', innerProgress => {
                  downloadedBytes += innerProgress.delta
                  // console.log(`debug: downloadedBytes ${downloadedBytes}, time dur ${(performance.now() - times) / 1000} sec`)
                  const avgSpeed = hs(downloadedBytes / (performance.now() - times) * 1000)
                  // console.log(`${hs(downloadedBytes)}/${hs(contentTotalLength)} spd:${hs(downloadedBytes / (performance.now() - times) * 1000)}`)
                  progress.tick(innerProgress.delta, {
                    spd: avgSpeed,
                    piece: `${idx}/${ranges.length}`
                  })
                  // console.log(downloadedBytes, contentTotalLength)
                })

                vblog(`[downloadVideo] <in Promise> for...of requests for file piece(${idx}/${ranges.length}) with opt=${util.inspect(copyOpts, false, Infinity, true)}, pipe to ${transferBadSymbolOnPathName(file)}`)

                request.get(copyOpts)
                  .on('response', resp => {
                    vblog(`[downloadVideo] <in Promise> for...of request for file piece(${idx}/${ranges.length}) responed with
Code=${resp.statusCode}
Header=${util.inspect(resp.headers, false, 2, true)}`)
                  })
                  .pipe(pgStm)
                  .on('error', err => {
                    reject(err)
                  })
                  .pipe(
                    fs.createWriteStream(
                      transferBadSymbolOnPathName(file),
                      {
                        encoding: 'binary'
                      }
                    )
                  )
                  .on('close', () => {
                    vblog(`[downloadVideo] <in Promise> for...of request for file piece(${idx}/${ranges.length}) ended, Stream closed`)
                    resolve(`file${idx} has been downloaded!`)
                  })
              }))

              idx += 1
            } catch (error) {
              oneFile = null
              log('err', error, true)
              log('warn', 'download chunk failed, will soon retry')
            }
          }
          // ----- end of while
          // ----- end of request for file frag -----
          const tmr = vblog.stopWatch('scrapy.js-downloadVideo-piece')
          const tmc = chalk.yellowBright(tmr.toFixed(1))
          const avs = chalk.redBright(hs(httpChunkBytes / tmr * 1000))
          vblog(`[downloadVideo] <in Promise> for...of piece(${idx}/${ranges.length}) time cost ${tmc} ms, speed ${avs}/s`)
        }

        log('info', 'all pieces have been downloaded, now concat pieces...')

        const ws = fs.createWriteStream(transferedDstWithRank, { flags: 'a', highWaterMark: 33554432 })

        for (const file of files) {
          vblog(`[downloadVideo] <in Promise> for...of at file=${file}`)

          const tmpRead = fs.createReadStream(transferBadSymbolOnPathName(file), { flags: 'r', highWaterMark: 2097152 })

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
          await fsp.unlink(transferBadSymbolOnPathName(file))
        }
        ws.end()

        vblog('[downloadVideo] <in Promise> piping ended, will write dlist.txt')

        fs.writeFileSync('./dlist.txt', transferedTitle + '\n', { flag: 'a+', encoding: 'utf-8' })

        const ret = [`${dst} downloaded!`, contentTotalLength, transferedFilenameWithRank]

        vblog(`[downloadVideo] exits with ret=${util.inspect(ret, false, Infinity, true)} inside Promise`)
        vblog(`[downloadVideo] time cost ${chalk.yellowBright(prettyMilliseconds(vblog.stopWatch('scrapy.js-downloadVideo'), { verbose: true }))}`)

        return resolve(ret)
        //}
        // else {
        //   return resolve(['skip small file (size less than [httpChunkSizeKB]).', 0])
        // }
      })
      .on('error', err => {
        log('err', 'error when start to fetch file info: ' + err, true)
        reject(err)
      })
  })

  return pm
}

module.exports = {
  findKeys,
  findDownloadInfo,
  downloadVideo
}
