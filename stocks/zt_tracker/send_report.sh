#!/bin/bash
# 涨停板追踪报告发送脚本
# 每天下午4:05执行（等待收盘数据）

REPORT_DIR="/home/openclaw/.openclaw/workspace/stocks/zt_tracker"
LOG_FILE="$REPORT_DIR/cron.log"
TODAY=$(date +%Y%m%d)
REPORT_FILE="$REPORT_DIR/report_$TODAY.md"

echo "[$(date)] 开始执行涨停板追踪..." >> $LOG_FILE

# 运行分析脚本
cd /home/openclaw/.openclaw/workspace
python3 stocks/zt_tracker/zt_analysis.py >> $LOG_FILE 2>&1

# 检查报告是否生成
if [ -f "$REPORT_FILE" ]; then
    echo "[$(date)] 报告已生成: $REPORT_FILE" >> $LOG_FILE
    # 输出报告内容供捕获
    cat $REPORT_FILE
else
    echo "[$(date)] 报告生成失败" >> $LOG_FILE
fi
