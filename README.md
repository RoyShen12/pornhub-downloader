
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

## Usage 使用方法

```shell
git clone https://github.com/RoyShen12/pornhub-downloader.git
npm install
node src -s <search keyword>
```

##### npm install failed on Linux

1. install pip, command on Ubuntu 16/18 is `apt install python-pip -y`

2. `pip install ast`

### Example 例子

#### Multi Keywords Searching 多关键词搜索

```shell
node src -s Lesbian,muscle
```

#### Keywords Searching With Keywords Excluding 搜索并过滤部分结果

```shell
node src -s Lesbian -e japanese,jav
```

#### Jumping First Four ADs 跳过前4个推广视频

```shell
node src -s <search keyword> --skip 4
```

#### Preview Videos And Don't Download(only on Mac with iTerm>2.9) 仅预览视频缩略图，并不实际下载（需要Mac与iTerm版本>2.9）

```shell
node src -s <search keyword> -f --preview --preview-size 50
# or
node src -s <search keyword> --list-only --preview --preview-size 50
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
