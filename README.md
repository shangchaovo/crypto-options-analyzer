# BTC / ETH 期权持仓分布

想知道本周到期的 BTC 期权集中在哪些行权价，可以先选 BTC 和到期日，再把鼠标移到柱子上，对照绿色 Call、红色 Put 的未平仓量（OI）、现货指数和 Max Pain。柱子表示尚未平仓的合约，单凭高度无法识别持有人、开仓方向或最后的结算价。

**在线查看**可打开统一加密终端的 [期权 Wall](https://crypto-funding-arbitrage.pages.dev/#/options)。本仓保留可在本地运行的独立页面。独立页从 Deribit 取数，失败后读取本地快照。统一终端的期权模块还可回退到 OKX。[统一终端源码](https://github.com/shangchaovo/crypto-funding-arbitrage)

## 运行独立页

在仓库根目录运行以下命令。需要 Node.js，服务器访问 Deribit 时会调用系统 `curl`。无需安装 npm 依赖，也无需交易所密钥。

```sh
node server.js
```

打开 [本机期权页](http://127.0.0.1:8766/)。未指定端口且 `8766` 已占用时，服务会再试 `8767`；以终端打印的地址为准。也可以在 POSIX shell 用 `PORT=8767 node server.js` 指定端口。

## 切换到期日后，看哪些数字

| 页面内容 | 如何读取 |
| --- | --- |
| 持仓分布与集中区 | 柱图按行权价分别汇总 Call、Put 的持仓。悬停看数值，再看同一到期日 OI 排名前列的行权价和期权类型。 |
| Max Pain | 在已有行权价中逐一试算结算，选择按现有持仓计算的合计内在价值最低点。页面给出该点相对现货的偏离，实际到期结算可能在别处。 |
| 结算日历与 PCR | 日历列各到期日的持仓、到期倒计时和 PCR，顶部显示币种整体 PCR。公式为 `Put OI / Call OI`。如 PCR 为 1.2，表示 Put 持仓为 Call 的 1.2 倍，无法据此推断净看空头寸。 |
| 波动率偏度 | 页面标作「25Δ Skew」。实现从 45 天内到期的合约中，分别选最接近现货 88% 的 Put 和 112% 的 Call，以两者 IV 差除以平均 IV 表示相对偏度。它按行权价近似，未按实际 Delta 或同一到期日配对。 |

[指标计算](js/analytics.js) · [Deribit 数据与偏度计算](js/api.js)

## 刷新和快照

页面启动后读取 Deribit 的公开期权摘要、合约规格和指数价，每 5 分钟重新请求，也可手动刷新。请求失败时，右上角显示「缓存」和快照时间，偏度显示 `--`。缓存也无法读取时会显示加载错误。

在仓库根目录运行以下命令可手动更新独立版快照。

```sh
node scripts/fetch-options.js
```

脚本加锁后抓取 BTC、ETH，校验两组数据，再原子替换 `data/options-data.json`。抓取失败会保留上一份有效快照。如需定时更新，可用自己的调度器运行同一条命令，页面刷新本身不会把新快照写回文件。[快照脚本](scripts/fetch-options.js)

需要代理时可通过 `DERIBIT_PROXY` 指定地址。`DERIBIT_PROXY=direct` 跳过脚本的本机代理探测；`curl` 仍会读取自身的代理环境变量。前端图表使用原生 Canvas，无打包步骤。[代理实现](lib/curl-fetch.js)
