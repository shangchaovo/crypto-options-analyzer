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
node server.js        # 默认 8766；占用时自动尝试 8767

# 也可以显式指定端口
PORT=8767 node server.js
```

大陆环境自动通过本地代理（Surge/Clash @ 127.0.0.1:1082）访问 Deribit。
可用 `DERIBIT_PROXY=http://host:port` 覆盖代理，或设置 `DERIBIT_PROXY=direct` 强制直连。

## 数据更新

```bash
# 手动抓取
node scripts/fetch-options.js
```

本机通过 OpenClaw command cron 每小时第 7 分钟更新一次本地 fallback 缓存，时区为 `Asia/Shanghai`。页面本身仍优先读取实时 Deribit API，并每 5 分钟刷新；只有实时 API 不可用时才读取 `data/options-data.json`。

```bash
# 查看任务和调度器状态
openclaw cron status
openclaw cron list

# 手动立即执行（将 <job-id> 替换为任务 ID）
openclaw cron run <job-id> --wait --wait-timeout 3m

# 查看最近运行记录
openclaw cron runs --id <job-id>
```

抓取脚本采用锁、数据校验和原子替换；网络失败时会保留上一份有效缓存，不会写入半截 JSON。

## 技术栈

纯前端 HTML/CSS/JS + Node.js 静态服务器。无构建工具、无外部依赖。

- **数据来源**: Deribit 公开 API（无需认证）
- **图表**: 原生 Canvas 2D
- **代理**: server.js 内置 curl-based 代理，兼容 Surge/Clash
- **Fallback**: API 失败时自动加载 `data/options-data.json`
