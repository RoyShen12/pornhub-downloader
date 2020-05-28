
# pornhub-DL

Download highest quality videos from [pornhub](https://pornhub.com).  
下载 [pornhub](https://pornhub.com) 上的高清视频。

## statement

**This repo is just for studying, not for other purpose.**  
**本项目仅供学习交流，如作他用所承受的法律风险概与作者无关**

## Features

* Support http or socks5 proxy.  支持 http 和 socks5 代理

* Always select highest quality video.  永远选择最高清的画质选项

* Support keyword searching.  关键词搜索下载

* Show progress.  显示下载进度条

* Skip repeat & previously downloaded file.  跳过重复/已下载过的文件

* Support Keyword filtering.  支持关键词过滤

* Support direct downloading from PH viewkey.  支持根据ph代码直接下载视频

## Requirement

* Node.js 8.3.0+.

* Internet that can access [pornhub.com](https://www.pornhub.com).

## Usage

```shell
git clone https://github.com/RoyShen12/pornhub-downloader.git
npm install
node src -s <search keyword>
```

## More Options

see with `--help` argument.  
更多功能和选项见 --help 帮助内容。

## Configuration

Configuration is available from `config.json`.  
配置文件 `config.json` 存放一些不常改动的设置。

- `proxyUrl`: set up the proxy with port. For example `http://127.0.0.1:1087` or `socks5://127.0.0.1:1080`.  
If you don't need it, just keep it empty.

- `timeout`: request timeout (second).

- `downloadDir`: the directory for saving videos.

- `httpChunkSizeKB`: splitting size of each video while downloading, the default value is 2048.

## LICENCE

MIT
