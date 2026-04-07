#!/usr/bin/env python3
"""
涨停板追踪 - 检查并准备推送报告
每天16:05执行，由crontab触发
生成简报内容供推送使用
"""

import json
import os
from datetime import datetime

REPORT_DIR = "/home/openclaw/.openclaw/workspace/stocks/zt_tracker"
TODAY = datetime.now().strftime('%Y%m%d')
REPORT_FILE = f"{REPORT_DIR}/report_{TODAY}.md"
PUSH_FILE = f"{REPORT_DIR}/push_{TODAY}.txt"

def main():
    # 检查今日报告是否存在
    if not os.path.exists(REPORT_FILE):
        print(f"[{datetime.now()}] 今日报告不存在，跳过推送")
        exit(0)
    
    # 读取完整报告
    with open(REPORT_FILE, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 写入推送文件（供HEARTBEAT检测）
    with open(PUSH_FILE, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f"[{datetime.now()}] 推送内容已准备: {PUSH_FILE}")
    print(f"报告长度: {len(content)} 字符")

if __name__ == "__main__":
    main()
