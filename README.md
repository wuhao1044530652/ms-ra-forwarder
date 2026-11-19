## 部署

请参考下列部署方式。

### 部署到 Vercel

部署时请删除原项目重新部署。

项目同时支持 Docker 自托管和 Vercel：`next.config.mjs` 会在 Vercel 构建环境（`VERCEL=1`）下自动关闭 `output: "standalone"`，避免出现「构建成功、状态 READY，但访问任何页面都是 404 NOT_FOUND」。如果你自己的 Vercel 项目是在本仓库还是老架构时创建的，请到 Settings → Build & Development Settings 里确认 **Framework Preset 为 Next.js**（若显示 Other，改成 Next.js 后重新部署）。

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fwxxxcxx%2Fms-ra-forwarder&env=TOKEN&envDescription=%E8%AE%BF%E9%97%AE%E4%BB%A4%E7%89%8C&project-name=ms-ra-forwarder&repository-name=ms-ra-forwarder)


### 部署到 Railway

Railway 增加了每个月500小时的限制，而且不会自动停机，所以每个月会有一段时间无法是使用。有条件的还是使用docker部署吧。

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template/p8RU3T?referralCode=-hqLZp)

### 部署到 Heroku


[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy)


### Docker（推荐）

需要安装 docker。

``` bash
# 拉取镜像
docker pull wxxxcxx/ms-ra-forwarder:latest
# 运行
docker run --name ms-ra-forwarder -d -p 3000:3000 wxxxcxx/ms-ra-forwarder
# or
docker run --name ms-ra-forwarder -d -p 3000:3000 -e TOKEN:自定义TOKEN wxxxcxx/ms-ra-forwarder

# 浏览器访问 http://localhost:3000
```

### Docker Compose

创建 `docker-compose.yml` 写入以下内容并保存。

``` yaml
version: '3'

services:
  ms-ra-forwarder:
    container_name: ms-ra-forwarder
    image: wxxxcxx/ms-ra-forwarder:latest
    restart: unless-stopped
    ports:
      - 3000:3000
    environment:
      # 不需要可以不用设置环境变量
      - TOKEN=自定义TOKEN
```

在 `docker-compose.yml` 目录下执行 `docker compose up -d`。



### 手动运行

手动运行需要事先安装好 git 和 nodejs。

```bash
# 获取代码
git clone https://github.com/wxxxcxx/ms-ra-forwarder.git

cd ms-ra-forwarder
# 安装依赖
npm install 
# 构建
npm run build
# 运行
npm run start
```

## 使用

### 导入到阅读（legado）

请访问你部署好的网站，在页面中测试没有问题后点击“直接导入”，然后在阅读（legado）中导入。

### 手动调用

接口地址为`/api/text-to-speech`。格式为：
```
GET /api/text-to-speech?voice=Microsoft+Server+Speech+Text+to+Speech+Voice+(zh-CN,+XiaoxiaoNeural)&volume=0&rate=0&pitch=0&text=你好
```

### 翻译语音

页面地址为 `/translator`（首页右上角的语言图标可进入）。

这条链路和 Edge 语音不同：它用微软翻译 App 接口换取临时凭据，再当作 Azure TTS 的授权使用，所以不需要自己的 Azure 密钥，并且支持讲话风格（`mstts:express-as`）。

相关环境变量：

| 变量 | 说明 |
| --- | --- |
| `SERVER` / `TRANSLATOR_SERVER` | 指定合成区域，例如 `eastasia`、`japaneast`、`eastus`；设置为 `auto`（推荐）或留空则使用凭据自带的区域。**填错区域会返回 401**，让请求发往与凭据不匹配的区域端点 |
| `TRANSLATOR_FORWARDED_FOR` | 请求时伪装的 `x-forwarded-for`，默认 `13.104.54.77` |

接口：

- `POST /api/translator`：请求体为完整 SSML，`Format` 头指定音频格式，返回音频二进制（设置了 `TOKEN` 时需要 `Authorization: Bearer <TOKEN>`）。

  ```bash
  curl -X POST 'http://localhost:3000/api/translator' \
    -H 'Format: audio-24khz-48kbitrate-mono-mp3' \
    -H 'Content-Type: text/plain' \
    --data '<speak xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" version="1.0" xml:lang="zh-CN"><voice name="zh-CN-XiaoxiaoNeural"><mstts:express-as style="cheerful" styledegree="1"><prosody rate="0%" pitch="0%">你好，世界。</prosody></mstts:express-as></voice></speak>' \
    -o test.mp3
  ```

- `GET /api/legado?api=<翻译合成接口>&name=&voiceName=&styleName=&styleDegree=&voiceFormat=&token=`：返回阅读（legado）语音引擎导入数据，`url` 里带着带讲话风格的 SSML 模板。

### Azure 订阅语音（自有密钥）

页面地址为 `/azure`（首页右上角的云图标可进入）。

这条链路直连你自己的 Azure 语音服务（`https://<区域>.tts.speech.microsoft.com`），用订阅密钥授权。相比前两条链路：

- 声音与讲话风格以你订阅的资源为准，页面上的声音列表就是从 Azure 实时拉取的
- 支持 `lexicon` 词典文件（改善多音字发音），这是另外两条链路没有的
- 费用计入你自己的订阅，可在 Azure 门户查看用量

#### 配置

| 变量 | 说明 |
| --- | --- |
| `AZURE_TTS_KEYS` | 多密钥，形如 `eastasia:密钥1,southeastasia:密钥2`；也支持换行分隔（便于粘贴到 Railway/Vercel 的多行变量框） |
| `AZURE_TTS_KEY` | 单密钥简写，等价于 `AZURE_TTS_KEYS` 里只有一项 |
| `AZURE_TTS_REGION` | 默认区域，供没有写区域的条目使用，默认 `eastasia` |

每个条目可以写成 `区域:密钥`、`区域@密钥` 或直接写 `密钥`（此时用 `AZURE_TTS_REGION`）。区域就是 Azure 语音资源所在的区域，例如 `eastasia`、`southeastasia`、`eastus`。**区域必须和密钥所属资源一致**，否则 Azure 会返回 401。

```bash
# 单个密钥
AZURE_TTS_KEYS="eastasia:你的密钥"

# 多个密钥：逗号或换行分隔，自动负载均衡
AZURE_TTS_KEYS="eastasia:密钥A,southeastasia:密钥B,japaneast:密钥C"
```

#### 多密钥与负载均衡

配置多个密钥后，请求会在它们之间分摊：

- 优先选**在途请求最少**的密钥，数量相同时按轮询分摊，所以单个慢请求不会把后续请求都堵在同一个密钥上
- 某个密钥返回 401/403（密钥失效、区域不符）时，该密钥冷却 10 分钟
- 返回 429（配额/限流）时按 `Retry-After` 冷却，默认 60 秒
- 网络错误或 5xx 时短暂冷却（5 秒起，按连续失败次数翻倍，最长 60 秒）
- 失败会**自动换下一个密钥重试**，最多尝试 4 个，因此某个密钥挂掉时用户基本无感
- 单密钥时也至少重试一次，避免偶发抖动直接失败

想确认分摊是否符合预期，可以访问状态接口（设置了 `TOKEN` 时需要带凭据）：

```bash
curl http://localhost:3000/api/azure/status
```

返回每个密钥的区域、打码后的密钥、成功/失败次数、剩余冷却时间与最后一次错误。密钥只显示前 4 位和后 4 位，不会泄露完整值。

#### 接口

- `GET /api/azure`：声音列表（含每个声音支持的 `StyleList`），响应头 `X-Azure-Keys` 是当前配置的密钥数量
- `POST /api/azure`：合成。请求体是完整 SSML，`Format` 头指定格式，设置了 `TOKEN` 时需要 `Authorization: Bearer <TOKEN>`

  ```bash
  curl -X POST 'http://localhost:3000/api/azure' \
    -H 'Format: audio-24khz-48kbitrate-mono-mp3' \
    -H 'Content-Type: text/plain' \
    --data '<speak xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" version="1.0" xml:lang="zh-CN"><voice name="zh-CN-XiaoxiaoNeural"><mstts:express-as style="cheerful" styledegree="1"><prosody rate="0%" pitch="0%">你好，世界。</prosody></mstts:express-as></voice></speak>' \
    -o test.mp3
  ```

  注意：调用本站接口时不需要、也不应该带 `Ocp-Apim-Subscription-Key`，Azure 密钥只在服务端使用，客户端只需要 `TOKEN`。

- 阅读（legado）导入沿用 `GET /api/legado?api=<合成接口>&...`，`api` 填 `/api/azure` 即可，页面会自动生成链接与二维码。

### 限制访问

如果需要防止他人滥用你的部署的服务，可以在应用的环境变量中添加 `TOKEN`，然后在请求头中添加 `Authorization: Bearer <TOKEN>`访问。

## 其他说明

- 微软官方的 Azure TTS 服务目前拥有一定的免费额度，如果免费额度对你来说够用的话，请支持官方的服务。

- 如果只需要为固定的文本生成语音，可以使用[有声内容创作](https://speech.microsoft.com/audiocontentcreation)。它提供了更丰富的功能可以生成更自然的声音。

- 本项目默认使用 Edge 浏览器“大声朗读”的接口；`/translator` 使用微软翻译 App 的免密钥通道；`/azure` 则直连你自己的 Azure 语音服务。三者都不保证长期可用，其中只有 Azure 是官方正式接口。

- **本项目仅供学习和参考，请勿商用。**

## 重要更改

**2026-11-20：新增 Azure 订阅语音（`/azure` + `/api/azure` + `/api/azure/status`），支持多密钥与负载均衡；此前同步上游 Next.js 版本时移除的 Azure 链路，现在以"自有密钥直连"的形式回归，旧的免密钥演示通道不再使用。**

**2026-11-20：同步上游 Next.js 版本，翻译语音迁移到 Next.js（`/translator` + `/api/translator` + `/api/legado`）。旧版 Express 实现在 `legacy-express` 分支。**

**2025-08-20：使用NextJs重构项目，修复了无法合成的问题。部署时请删除原项目重新部署。**

2023-04-19：Azure 下线了演示页面的试用功能，导致 Azure 版接口无法使用了，请各位迁移到 Edge 浏览器的接口吧。

2022-11-18：添加词典文件支持，词典文件格式参考 https://github.com/wxxxcxx/azure-tts-lexicon-cn/blob/main/lexicon.xml 。

2022-09-10：修改 docker 仓库地址，后面构建的 docker 镜像会迁移到 wxxxcxx/ms-ra-forwarder（原仓库旧版本镜像依然有效）。

2022-09-01：Azure TTS API 好像又改了，旧版用户可能会无法正常使用，请更新到最新版。

2022-07-17：添加 Azure TTS API 支持（没怎么测试，不知道用起来稳不稳定）。因为调用 Azure TTS API 需要获取授权码。其它方式只需要或取一次就可以使用一段时间，而 Vercel 每次调用 API 都需要重新获取授权码。容易超时不说，也加剧了微软服务器的负担，所以不是很推荐部署在 Vercel 的用户使用（虽然也不是不能用～但是万一微软被薅痛了，又改接口就不好了😂）。

2022-07-02：Edge 版本的 API 目前测试还支持的格式有 `webm-24khz-16bit-mono-opu`、`audio-24khz-48kbitrate-mono-mp3`、`audio-24khz-96kbitrate-mono-mp3`。另外今天下午开始，使用不在下拉列表中声音会出现类似 “Unsupported voice zh-CN-YunyeNeural.” 错误，后续可能也会被砍掉。且用且珍惜吧！

2022-07-01：~~部署在中国大陆以外服务器上的服务目前只能选择 `webm-24khz-16bit-mono-opus` 格式的音频了！~~ 所以使用 Vercel 的用户需要重新部署一下。

2022-06-16：Edge 浏览器提供的接口现在已经不能设置讲话风格了，若发现不能正常使用，请参考 [#12](https://github.com/wxxxcxx/ms-ra-forwarder/issues/12#issuecomment-1157271193) 获取更新。


感谢以下组织/个人对本项目的支持

<img width="80" src="https://resources.jetbrains.com/storage/products/company/brand/logos/jb_beam.png" />

## Star History

<a href="https://www.star-history.com/?repos=wxxxcxx%2Fms-ra-forwarder&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=wxxxcxx/ms-ra-forwarder&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=wxxxcxx/ms-ra-forwarder&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=wxxxcxx/ms-ra-forwarder&type=date&legend=top-left" />
 </picture>
</a>
