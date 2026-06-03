# CLAUDE.md

## Project Overview

Crypto Options Concentration Analyzer — 一个纯前端（HTML/CSS/JS）的 BTC/ETH 期权分析 Dashboard。

核心功能：
- **持仓分布热力图**：按行权价展示 Call（绿）/ Put（红）的持仓量分布
- **Max Pain 分析**：计算各到期日的最大痛点（卖方最优结算价）
- **大押注区域**：持仓最集中的行权价排名
- **结算日历**：所有到期日的总持仓量与 PCR 比率
- **Call/Put 比率**：市场情绪指标
- **波动率偏度**：25 Delta Skew

数据来源：Deribit（公开 API，无需认证）

## Architecture

```
index.html      # 单页应用
server.js       # Node.js 静态服务器 + Deribit API 代理
css/styles.css  # Dark theme 样式
js/
  api.js        # Deribit API 封装（含 proxy 路由判断）
  analytics.js  # Max Pain / PCR / 集中度计算引擎
  chart.js      # Canvas 持仓分布图
  app.js        # 主控制器
scripts/
  fetch-options.js  # Node.js 数据抓取脚本（可配 cron）
data/           # 本地缓存 JSON
```

## Development

```bash
cd ~/crypto-options-analyzer
node server.js    # http://localhost:8766
```

大陆网络环境下，Deribit API 通过 `server.js` 代理访问（`/api/deribit/{endpoint}`）。

## Key API Endpoints

| Endpoint | Purpose |
|---------|---------|
| `get_book_summary_by_currency` | 所有期权的 OI、mark price、IV |
| `get_instruments` | 合约规格（contract_size） |
| `get_index_price` | BTC/ETH 现货指数价格 |

## Max Pain 计算逻辑

对每个候选行权价 S：
- Call 总内在价值 = Σ max(0, S - Kᵢ) × Call_OIᵢ
- Put 总内在价值 = Σ max(0, Kᵢ - S) × Put_OIᵢ
- **Max Pain** = 使总内在价值最小的行权价

## Notes

- 自动刷新：每 5 分钟
- BTC 合约面值：0.1 BTC/张
- ETH 合约面值：1 ETH/张
- 到期时间：UTC 08:00
