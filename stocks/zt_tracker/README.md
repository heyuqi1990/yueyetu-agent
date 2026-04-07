# 涨停板自动追踪系统

## 功能说明
每日收盘后（16:05）自动获取涨停板数据，分析市场环境和热点板块，并与舒华体育进行横向对比。

## 文件结构
```
stocks/zt_tracker/
├── zt_analysis.py     # 核心分析脚本
├── send_report.sh     # 推送脚本
├── push_report.py     # 推送准备脚本
├── report_YYYYMMDD.md # 每日报告
├── data_YYYYMMDD.json # 每日数据(JSON)
└── history.json       # 历史记录
```

## 定时任务
- **舒华体育追踪**: 每天 16:00
- **涨停板分析**: 每天 16:05
- **执行方式**: crontab

## 使用方式
每天下午4点后，直接对我说：
- "今天的涨停板分析"
- "舒华体育今天怎么样"

我会自动读取今日报告并展示给你。

## 报告内容
1. 市场整体环境（上证指数、涨停股数量）
2. 涨停板特征（成交额、市值、连板数、炸板率）
3. 热点板块TOP10
4. 舒华体育横向对比
5. 操作建议

## 手动触发
```bash
cd /home/openclaw/.openclaw/workspace
python3 stocks/zt_tracker/zt_analysis.py
```
