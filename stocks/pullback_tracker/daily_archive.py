#!/usr/bin/env python3
"""
每日涨停板数据存档
每个交易日15:00运行，保存当日涨停数据用于后续超跌分析
"""

import akshare as ak
import sqlite3
import json
import os
from datetime import datetime

DB_PATH = "/home/openclaw/.openclaw/workspace/stocks/pullback_tracker/pullback.db"
DATA_DIR = "/home/openclaw/.openclaw/workspace/stocks/pullback_tracker"
TODAY = datetime.now().strftime('%Y%m%d')

def get_db_conn():
    return sqlite3.connect(DB_PATH)

def save_daily_zt_pool(date):
    """保存当日涨停股池到数据库"""
    try:
        df = ak.stock_zt_pool_em(date=date)
        if df is None or len(df) == 0:
            print(f"[{datetime.now()}] {date} 无涨停数据")
            return 0
        
        conn = get_db_conn()
        c = conn.cursor()
        
        count = 0
        for _, row in df.iterrows():
            code = str(row['代码']).zfill(6)
            name = row['名称']
            industry = row['所属行业']
            continuous_days = int(row['连板数']) if row['连板数'] > 0 else 0
            change_pct = float(row['涨跌幅'])
            close_price = float(row['最新价'])
            turnover = float(row['换手率'])
            first_limit_time = row['首次封板时间']
            zhuban_count = int(row['炸板次数']) if '炸板次数' in row else 0
            
            try:
                c.execute('''
                    INSERT OR REPLACE INTO zt_daily_archive 
                    (code, name, date, industry, continuous_days, change_pct, 
                     close_price, turnover, first_limit_time, zhuban_count)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (code, name, date, industry, continuous_days, change_pct,
                      close_price, turnover, first_limit_time, zhuban_count))
                count += 1
            except Exception as e:
                print(f"插入失败 {code}: {e}")
        
        conn.commit()
        conn.close()
        print(f"[{datetime.now()}] {date} 存档 {count} 只涨停股")
        return count
    except Exception as e:
        print(f"[{datetime.now()}] 存档失败: {e}")
        return 0

def init_archive_table():
    """初始化存档表"""
    conn = get_db_conn()
    c = conn.cursor()
    
    c.execute('''
        CREATE TABLE IF NOT EXISTS zt_daily_archive (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT,
            name TEXT,
            date TEXT,
            industry TEXT,
            continuous_days INTEGER,
            change_pct REAL,
            close_price REAL,
            turnover REAL,
            first_limit_time TEXT,
            zhuban_count INTEGER,
            UNIQUE(code, date)
        )
    ''')
    
    conn.commit()
    conn.close()

def analyze_pullback_candidates(date):
    """
    分析超跌候选股
    基于历史存档数据，识别从高点明显下跌的强势股
    """
    conn = get_db_conn()
    c = conn.cursor()
    
    # 获取近期（5天内）有连续涨停历史的股票
    # 看它们最近一次涨停到现在是否跌幅超过阈值
    c.execute('''
        SELECT DISTINCT code, name, industry FROM zt_daily_archive
        WHERE date >= ? AND continuous_days >= 2
    ''', (date,))
    
    strong_stocks = c.fetchall()
    print(f"[{datetime.now()}] 近期强势股: {len(strong_stocks)} 只")
    
    conn.close()
    return strong_stocks

def main():
    print(f"[{datetime.now()}] 每日涨停板存档开始...")
    
    # 初始化表
    init_archive_table()
    
    # 获取最近有数据的交易日
    # 尝试获取今天或昨天的数据
    today = datetime.now().strftime('%Y%m%d')
    yesterday = (datetime.now() - __import__('datetime').timedelta(days=1)).strftime('%Y%m%d')
    
    # 优先存今天的数据
    count = save_daily_zt_pool(today)
    
    # 如果今天没有数据，存昨天
    if count == 0:
        count = save_daily_zt_pool(yesterday)
    
    print(f"[{datetime.now()}] 存档完成: {count} 只")

if __name__ == "__main__":
    main()
