# Crypto Options Concentration Analyzer

期权集中押注分析工具 — 追踪 BTC/ETH 大资金在行权价上的分布与结算日期。

## 核心功能

| 模块 | 说明 |
|------|------|
| **持仓分布热力图** | Canvas 绘制的 Call(绿)/Put(红) 持仓柱状图，支持鼠标悬停查看详情 |
| **最大痛点 (Max Pain)** | 计算每个到期日的卖方最优结算价，对比现货偏离度 |
| **大押注区域** | 按持仓量排序，展示最集中的行权价 + Call/Put 类型 |
| **结算日历** | 所有到期日的总持仓、PCR 比率、到期倒计时 |
| **波动率偏度** | 25 Delta Skew，判断市场情绪极端程度 |
| **Call/Put 比率** | 整体 PCR，>1 看跌偏，<0.7 看涨偏 |

## 快速开始

```bash
cd ~/crypto-options-analyzer
node server.js        # http://localhost:8766
```

大陆环境自动通过本地代理（Surge/Clash @ 127.0.0.1:1082）访问 Deribit。

## 数据更新

```bash
# 手动抓取
node scripts/fetch-options.js

# 或通过 GitHub Actions 自动每 15 分钟更新
```

## 技术栈

纯前端 HTML/CSS/JS + Node.js 静态服务器。无构建工具、无外部依赖。

- **数据来源**: Deribit 公开 API（无需认证）
- **图表**: 原生 Canvas 2D
- **代理**: server.js 内置 curl-based 代理，兼容 Surge/Clash
- **Fallback**: API 失败时自动加载 `data/options-data.json`
