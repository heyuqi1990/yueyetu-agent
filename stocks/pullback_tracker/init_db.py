#!/usr/bin/env python3
"""
超跌反弹候选股追踪系统
每天自动从涨停板数据中识别强势股超跌情况，建立候选股池并跟踪
"""

import sqlite3
import json
import os
from datetime import datetime

DB_PATH = "/home/openclaw/.openclaw/workspace/stocks/pullback_tracker/pullback.db"
DATA_DIR = "/home/openclaw/.openclaw/workspace/stocks/zt_tracker"
REPORT_DIR = "/home/openclaw/.openclaw/workspace/stocks/pullback_tracker"

def init_db():
    """初始化数据库"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # 强势股池：从涨停板数据中提取的连板股、强趋势股
    c.execute('''
        CREATE TABLE IF NOT EXISTS strong_stocks (
            code TEXT PRIMARY KEY,
            name TEXT,
            date_added TEXT,
            source TEXT,  -- 来源：连板/强趋势/用户添加
            continuous_days INTEGER,  -- 连板天数
            avg_strength REAL,  -- 强势程度评分
            industry TEXT,  -- 所属行业
            last_zt_date TEXT,  -- 最后涨停日期
            status TEXT DEFAULT 'active'  -- active/inactive/pullback
        )
    ''')
    
    # 超跌记录：记录每只股发生的A杀/狠杀
    c.execute('''
        CREATE TABLE IF NOT EXISTS pullback_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT,
            name TEXT,
            pullback_date TEXT,  -- 发生超跌的日期
            pullback_type TEXT,  -- A杀/狠杀
            drop_rate REAL,  -- 跌幅
            has_limit_down INTEGER,  -- 是否有跌停
            peak_date TEXT,  -- 峰值日期
            peak_price REAL,  -- 峰值价格
            note TEXT,
            FOREIGN KEY (code) REFERENCES strong_stocks(code)
        )
    ''')
    
    # 候选股池：进入观察的股票
    c.execute('''
        CREATE TABLE IF NOT EXISTS candidate_pool (
            code TEXT PRIMARY KEY,
            name TEXT,
            industry TEXT,
            added_date TEXT,  -- 进入候选池日期
            pullback_date TEXT,  -- 发生超跌日期
            drop_rate REAL,  -- 从峰值跌了多少
            peak_price REAL,  -- 峰值价格
            current_price REAL,  -- 最新价格
            status TEXT DEFAULT 'watching',  -- watching/stable/bought/exit
            last_updated TEXT,
            FOREIGN KEY (code) REFERENCES strong_stocks(code)
        )
    ''')
    
    # 每日跟踪数据
    c.execute('''
        CREATE TABLE IF NOT EXISTS daily_tracking (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT,
            date TEXT,
            open_price REAL,
            close_price REAL,
            high_price REAL,
            low_price REAL,
            change_pct REAL,
            volume REAL,
            amount REAL,
            industry_change REAL,  -- 板块涨跌幅
            capital_flow TEXT,  -- 资金流向：inflow/outflow/neutral
            limit_up_count INTEGER,  -- 板块涨停数
            note TEXT,
            FOREIGN KEY (code) REFERENCES candidate_pool(code)
        )
    ''')
    
    # 信号记录：企稳信号、买入信号
    c.execute('''
        CREATE TABLE IF NOT EXISTS signals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT,
            name TEXT,
            signal_type TEXT,  -- stable/bottom/inflow/momentum
            signal_date TEXT,
            price REAL,
            industry TEXT,
            industry_strength REAL,  -- 板块强势程度
            capital_inflow REAL,  -- 资金流入量
            trigger_condition TEXT,  -- 触发条件描述
            status TEXT DEFAULT 'pending',  -- pending/triggered/expired
            FOREIGN KEY (code) REFERENCES candidate_pool(code)
        )
    ''')
    
    # 操作记录
    c.execute('''
        CREATE TABLE IF NOT EXISTS trade_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT,
            name TEXT,
            action TEXT,  -- buy/sell/watch
            action_date TEXT,
            price REAL,
            amount INTEGER,
            profit_loss REAL,
            note TEXT
        )
    ''')
    
    conn.commit()
    conn.close()
    print(f"[{datetime.now()}] 数据库初始化完成: {DB_PATH}")

def get_zt_data(date):
    """读取指定日期的涨停板数据"""
    file_path = f"{DATA_DIR}/data_{date}.json"
    if not os.path.exists(file_path):
        return None
    with open(file_path, 'r', encoding='utf-8') as f:
        return json.load(f)

def get_recent_zt_codes(days=5):
    """获取最近几天的涨停股代码（强势股来源）"""
    codes = {}
    today = datetime.now()
    
    for i in range(days):
        date_str = (today - datetime.timedelta(days=i)).strftime('%Y%m%d')
        data = get_zt_data(date_str)
        if data and data.get('analysis', {}).get('zt_pool'):
            for item in data['analysis']['zt_pool']:
                code = item.get('code')
                if code:
                    codes[code] = {
                        'name': item.get('name', ''),
                        'continuous_days': item.get('continuous_days', 1),
                        'industry': item.get('industry', ''),
                        'last_date': date_str
                    }
    return codes

def detect_pullback_from_zt(codes):
    """
    从涨停板数据中识别超跌候选股
    强势股特征：连板 > 1 或者 强势股标记
    超跌信号：有跌停的下跌
    """
    candidates = []
    today = datetime.now().strftime('%Y%m%d')
    
    for code, info in codes.items():
        # 连板股加入候选池（需要跟踪是否超跌）
        if info.get('continuous_days', 1) > 1:
            candidates.append({
                'code': code,
                'name': info['name'],
                'industry': info['industry'],
                'source': 'continuous_zt',
                'continuous_days': info['continuous_days'],
                'last_zt_date': info['last_date']
            })
    
    return candidates

def generate_watchlist_report():
    """生成候选股池报告"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # 获取所有观察中的候选股
    c.execute('''
        SELECT code, name, industry, pullback_date, drop_rate, peak_price, current_price, status
        FROM candidate_pool
        WHERE status IN ('watching', 'stable')
        ORDER BY drop_rate DESC
    ''')
    
    candidates = c.fetchall()
    conn.close()
    
    if not candidates:
        return None
    
    report = f"""# 超跌反弹候选股池 {datetime.now().strftime('%Y-%m-%d')}

## 观察中候选股 ({len(candidates)}只)

| 代码 | 名称 | 板块 | 超跌日期 | 跌幅 | 峰值 | 现价 | 状态 |
|------|------|------|----------|------|------|------|------|
"""
    for row in candidates:
        code, name, industry, pullback_date, drop_rate, peak_price, current_price, status = row
        status_emoji = '🔴' if status == 'watching' else '🟡'
        report += f"| {code} | {name} | {industry} | {pullback_date} | {drop_rate:.1f}% | {peak_price:.2f} | {current_price:.2f} | {status_emoji} |\n"
    
    report += f"""
---
*由月野兔V3.5自动生成*
"""
    
    return report

if __name__ == "__main__":
    print(f"[{datetime.now()}] 超跌反弹追踪系统启动...")
    init_db()
    print(f"[{datetime.now()}] 数据库检查完成")
