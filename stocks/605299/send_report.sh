#!/bin/bash
# 舒华体育每日追踪报告发送脚本
# 每天下午4点执行

LOG_FILE="/home/openclaw/.openclaw/workspace/stocks/605299/cron.log"
REPORT_FILE="/home/openclaw/.openclaw/workspace/stocks/605299/daily_report.md"

echo "[$(date)] 开始执行舒华体育追踪..." >> $LOG_FILE

# 运行Python脚本获取数据
cd /home/openclaw/.openclaw/workspace
python3 stocks/605299/track.py >> $LOG_FILE 2>&1

if [ -f "$REPORT_FILE" ]; then
    echo "[$(date)] 报告已生成" >> $LOG_FILE
    # 输出报告内容（后续通过openclaw消息接口发送）
    cat $REPORT_FILE
else
    echo "[$(date)] 报告生成失败" >> $LOG_FILE
fi
