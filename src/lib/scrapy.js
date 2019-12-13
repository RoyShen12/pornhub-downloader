const fs = require('fs')
const fsp = fs.promises
const path = require('path')
const os = require('os')
const vm = require('vm')
// const util = require('util')

/**
 * @type {{ proxyUrl: string, timeout: number, downloadDir: string, httpChunkSizeKB: number }}
 */
const config = JSON.parse(fs.readFileSync('config.json').toString())


const _ = require('lodash')
const fse = require('fs-extra')
const hs = require('human-size')
const disk = require('diskusage')
const cheerio = require('cheerio')
const request = require('request')
const ProgressBar = require('progress')
// const prettyMilliseconds = require('pretty-ms')
const progressStream = require('progress-stream')
const performance = {
  now: require('performance-now')
}

const log = require('ya-node-logger').getLogger('main')

const oldFiles = fse.readFileSync('./dlist.txt', 'utf-8').toString().split('\n')

// in windows, file name should not contain these symbols
// * : " * ? < > |
// here is the method to transfer these symbol to leagal ones
const { transferBadSymbolOnFileName, transferBadSymbolOnPathName, fileNameToTitle } = require('./str')

const domain = 'www.pornhub.com'
const baseUrl = `https://${domain}`

const customHeaders = {
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
  // 'Accept-Encoding': 'gzip, deflate, br',
  // 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,ja;q=0.7,zh-TW;q=0.6',
  // 'Cache-Control': 'max-age=0',
  // 'Connection': 'keep-alive',
  // 'Cookie': '',
  // 'DNT': '1',
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

const maxChunkBytes = (config.httpChunkSizeKB || 2048) * 1024

async function findKeys(opts) {
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

    request(reqOpts, (err, _res, body) => {
      if (err) {
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

      return resolve(allKeys.filter(k => !skipKeys.includes(k)))
    })
  })

  return pm
}

function findTitle(bodyStr) {
  const $ = cheerio.load(bodyStr)
  const title = $('title').text()

  const arr = title.split('-')
  arr.pop()

  return arr.join('-')
}

/**
 * @param {string} bodyStr
 */
function parseDownloadInfo(bodyStr) {
  let info
  const idx = bodyStr.indexOf('mediaDefinitions')

  if (idx < 0) {
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
      return ret
    } else {
      return ''
    }
  } catch (error) {
    console.error(error)
    return ''
  }
}

async function findDownloadInfo(key) {
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

    request(opts, (err, res, body) => {
      if (err) {
        return reject(err)
      }
      const ditem = parseDownloadInfo(body)
      if (ditem) {
        ditem.key = finalKey
      }
      return resolve(ditem)
    })
  })
}

async function downloadVideo(ditem, folderName, downloadCount) {
  const title = ditem.title.trim()
  const transferedTitle = transferBadSymbolOnFileName(title)
  const filename = `${title}_${ditem.quality}P_${ditem.key}.mp4`
  const transferedFilename = transferBadSymbolOnFileName(filename)
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

  const pm = new Promise((resolve, reject) => {
    const thisFolderFiles = global.cli.flags.fakerun ? [] : fs.readdirSync(dir).filter(f => f[0] !== '.')

    if (global.cli.flags.exclude && title.includes(global.cli.flags.exclude)) {
      return resolve([`title ${title} excluded by user flag ${global.cli.flags.exclude}`, 0])
    }
    // old
    if (fse.existsSync(transferedDst)) {
      // debug scan
      log('warn', `rename to -> ${filenameWithRank}`)
      fs.renameSync(transferedDst, transferedDstWithRank)
      return resolve([`${title} already exists in dl path and has been renamed into new style!`, 0])
    }
    // new
    if (thisFolderFiles.some(oldf => fileNameToTitle(oldf) === transferedTitle)) {
      return resolve([`${title} already exists in dl path!`, 0])
    }
    if (oldFiles.includes(transferedTitle)) {
      return resolve([`${title} already exists in dlist.txt!`, 0])
    }

    let opts = {
      url: ditem.videoUrl
    }

    Object.assign(opts, baseReqOpts)
    log('notice', `downloading > ${filename}`)

    return request.get(opts)
      .on('response', async resp => {
        const resHeaders = resp.headers
        const contentTotalLength = resHeaders['content-length']

        if (global.cli.flags.fakerun) return resolve(['fake downloaded!', contentTotalLength])
        if (global.cli.flags.skipsize && global.cli.flags.skipsize * 1024 * 1024 > contentTotalLength) {
          return resolve(['detect file of too small size, skip it', 0])
        }

        // disk is full, stop tasks
        const diskusage = await disk.check(/*os.platform() === 'win32' ? 'c:' : '/'*/config.downloadDir)
        if (diskusage.free < contentTotalLength * 2.1) {
          reject(`incomming video size: ${hs(contentTotalLength)}, which is larger than disk free space: ${hs(diskusage.free)}, process auto quit`)
          return
        } else {
          log('verbose', `disk free space: ${hs(diskusage.free)}.\n`)
        }

        if (contentTotalLength > maxChunkBytes) {
          const ranges = []
          const chunkCount = parseInt(contentTotalLength / maxChunkBytes)
          const mod = parseInt(contentTotalLength % maxChunkBytes)

          for (let i = 0; i < chunkCount; i++) {
            const rg = {
              start: i === 0 ? i : i * maxChunkBytes + 1,
              end: (i + 1) * maxChunkBytes
            }
            ranges.push(rg)
          }

          if (mod > 0) {
            const rg = {
              start: chunkCount * maxChunkBytes + 1,
              end: contentTotalLength
            }
            ranges.push(rg)
          }
          ranges[ranges.length - 1].end = ranges[ranges.length - 1].end - 1

          // log('info', `the file is splitted to ${ranges.length} pieces`)
          const times = performance.now()
          let downloadedBytes = 0

          const progress = new ProgressBar('downloading [:bar] :spd/s :percent Piece::piece ETA::etas', {
            incomplete: ' ',
            width: 80,
            total: +contentTotalLength
          })

          const files = []
          let idx = 0

          // const maxPiecesL = (ranges.length + '').length
          // const maxBytesL = (contentTotalLength + '').length

          for (const item of ranges) {
            const copyOpts = _.cloneDeep(opts)
            copyOpts.headers['Range'] = `bytes=${item.start}-${item.end}`
            copyOpts.headers['Connection'] = 'keep-alive'

            const file = path.join(dir, `${ditem.key}${idx}`)

            files.push(file)

            // log('info', `downloading the ${(idx + 1 + '').padEnd(maxPiecesL)} / ${ranges.length} piece from ${(item.start + '').padEnd(maxBytesL)} to ${(item.end + '').padEnd(maxBytesL)} ...`)

            // log('debug', `checking ${file}`)
            if (fs.existsSync(transferBadSymbolOnPathName(file))) {
              const tmpStat = fs.statSync(transferBadSymbolOnPathName(file))
              if (tmpStat.size = maxChunkBytes) {
                log('warn', `detect file ${file} already downloaded, skip.`)
                idx += 1
                continue
              }
            }

            // ----- request for file frag -----
            let oneFile = null
            while (!oneFile) {
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

                  request.get(copyOpts)
                    .pipe(pgStm)
                    .on('error', err => {
                      reject(err)
                    })
                    .pipe(
                      fse.createWriteStream(
                        transferBadSymbolOnPathName(file),
                        {
                          encoding: 'binary'
                        }
                      )
                    )
                    .on('close', () => {
                      resolve(`file${idx} has been downloaded!`)
                    })
                }))
                idx += 1
              } catch (error) {
                oneFile = null
                log('err', error, true)
                log('warn', 'download chunk failed, retry')
              }
            }
            // ----- end of request for file frag -----
          }

          log('info', 'all pieces have been downloaded, now concat pieces...')

          const ws = fse.createWriteStream(transferedDstWithRank, { flags: 'a', highWaterMark: 33554432 })
          for (const file of files) {
            const tmpRead = fse.createReadStream(transferBadSymbolOnPathName(file), { flags: 'r', highWaterMark: 2097152 })
            await new Promise((__res, __rej) => {
              tmpRead.pipe(ws, { end: false })
              tmpRead.on('end', () => {
                __res()
              })
              tmpRead.on('error', e => {
                __rej(e)
              })
            })
            await fsp.unlink(transferBadSymbolOnPathName(file))
          }
          ws.end()

          fse.writeFileSync('./dlist.txt', transferedTitle + '\n', { flag: 'a+', encoding: 'utf-8' })
          return resolve([`${dst} downloaded!`, contentTotalLength, transferedFilenameWithRank])
        }
        else {
          return resolve(['skip file less than [httpChunkSizeKB].', 0])
        }
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
