import { httpGet } from './request'
import pkg from '../../../package.json'

// TODO add Notice

const author = pkg.author.name
const name = pkg.name

// 本仓库是独立衍生产品：版本检查只面向自有仓库，不再查询上游（lyswhut）的发布源。
// 自有仓库需在 master 分支提供 publish/version.json 才会生效；未提供时检查失败，不影响使用。
const address = [
  [`https://raw.githubusercontent.com/${author}/${name}/master/publish/version.json`, 'direct'],
  [`https://cdn.jsdelivr.net/gh/${author}/${name}/publish/version.json`, 'direct'],
  [`https://fastly.jsdelivr.net/gh/${author}/${name}/publish/version.json`, 'direct'],
  [`https://gcore.jsdelivr.net/gh/${author}/${name}/publish/version.json`, 'direct'],
]

const request = async(url, retryNum = 0) => {
  return new Promise((resolve, reject) => {
    httpGet(url, {
      timeout: 10000,
    }, (err, resp, body) => {
      if (err || resp.statusCode != 200) {
        ++retryNum >= 3
          ? reject(err || new Error(resp.statusMessage || resp.statusCode))
          : request(url, retryNum).then(resolve).catch(reject)
      } else resolve(body)
    })
  })
}

const getDirectInfo = async(url) => {
  return request(url).then(info => {
    if (info.version == null) throw new Error('failed')
    return info
  })
}

const getNpmPkgInfo = async(url) => {
  return request(url).then(json => {
    if (!json.versionInfo) throw new Error('failed')
    const info = JSON.parse(json.versionInfo)
    if (info.version == null) throw new Error('failed')
    return info
  })
}

export const getVersionInfo = async(index = 0) => {
  const [url, source] = address[index]
  let promise
  switch (source) {
    case 'direct':
      promise = getDirectInfo(url)
      break
    case 'npm':
      promise = getNpmPkgInfo(url)
      break
  }

  return promise.catch(async(err) => {
    index++
    if (index >= address.length) throw err
    return getVersionInfo(index)
  })
}

// getVersionInfo().then(info => {
//   console.log(info)
// })
