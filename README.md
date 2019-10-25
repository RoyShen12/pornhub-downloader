
# pornhub-DL

Download highest quality videos from [pornhub](https://pornhub.com).

## statement

**This repo is just for studying, not for other purpose.**

## Features

* Support proxy.

* Always select highest quality video.

* Support keyword searching.

* Show progress.

* Skip repeat & previously downloaded file.

## Requirement

* Node.js 8.3.0+.

* Network which can access to [pornhub.com](https://www.pornhub.com).

## Usage

```shell
npm install
node src -s <search key>
```

## More Options

see with `--help` argument.

## Configuration

Configuration is available from `config.json`.

- `proxyUrl`: set up the proxy with port. For example `http://127.0.0.1:1087` or `socks5://127.0.0.1:1080`.  
If you don't need it, just keep it empty.

- `timeout`: request timeout.

- `downloadDir`: the directory for saving videos.

- `httpChunkSizeKB`: splitting size of each video while downloading, the default value is 2048.

## LICENCE

MIT
