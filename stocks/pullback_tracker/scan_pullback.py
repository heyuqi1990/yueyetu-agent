#!/usr/bin/env python3
"""
超跌反弹候选股扫描脚本
每天收盘后运行，识别强势股超跌情况，推送候选股池
"""

import akshare as ak
import efinance as ef
import pandas as pd
from datetime import datetime, timedelta
import json
import os
import sqlite3

# ============== 配置 ==============
DB_PATH = "/home/openclaw/.openclaw/workspace/stocks/pullback_tracker/pullback.db"
REPORT_DIR = "/home/openclaw/.openclaw/workspace/stocks/pullback_tracker"
PUSH_FILE = f"{REPORT_DIR}/push_candidates.txt"
TODAY = datetime.now().strftime('%Y%m%d')
YESTERDAY = (datetime.now() - timedelta(days=1)).strftime('%Y%m%d')

def get_db_conn():
    return sqlite3.connect(DB_PATH)

def get_recent_strong_stocks(date):
    """获取近期强势股（涨停板数据）"""
    try:
        # 获取涨停股池
        zt_df = ak.stock_zt_pool_em(date=date)
        if zt_df is None or len(zt_df) == 0:
            return []
        
        # 筛选连板股（连续涨停）
        strong = zt_df[zt_df['连板数'] > 0].copy()
        
        result = []
        for _, row in strong.iterrows():
            result.append({
                'code': str(row['代码']).zfill(6),
                'name': row['名称'],
                'industry': row['所属行业'],
                'continuous_days': int(row['连板数']),
                'close': float(row['最新价']),
                'change_pct': float(row['涨跌幅']) if '涨跌幅' in row else 0
            })
        return result
    except Exception as e:
        print(f"获取强势股失败: {e}")
        return []

def get_stock_daily(stock_code, days=30):
    """获取个股日线数据"""
    try:
        df = ef.stock.get_quote_history(stock_code, kline='日K')
        if df is not None and len(df) >= 2:
            return df.tail(days)
        return None
    except Exception as e:
        print(f"获取股票日线失败 {stock_code}: {e}")
        return None

def detect_pullback(stock_code, stock_name, continuous_days):
    """
    检测超跌信号
    返回: (是否超跌, 跌幅, 峰值日期, 峰值价格, 是否有跌停, 跌停日列表)
    """
    try:
        df = get_stock_daily(stock_code, days=20)
        if df is None or len(df) < 5:
            return False, 0, None, 0, False, []
        
        df = df.sort_values('日期')
        
        # 检查最近是否有跌停（下跌中有跌停日）
        has_limit_down = False
        drop_days = []
        
        for i in range(len(df) - 1, max(0, len(df) - 6), -1):
            # 跌停判断：跌幅接近-10%或-20%（科创板/创业板）
            change = float(df.iloc[i]['涨跌幅'])
            prev_change = float(df.iloc[i-1]['涨跌幅']) if i > 0 else 0
            
            # 今日跌幅大
            if change <= -9.5:
                has_limit_down = True
                drop_days.append({
                    'date': df.iloc[i]['日期'],
                    'change': change
                })
        
        if not has_limit_down:
            return False, 0, None, 0, False, []
        
        # 计算从峰值的跌幅
        peak_idx = df['收盘'].idxmax()
        peak_price = float(df.loc[peak_idx, '收盘'])
        peak_date = df.loc[peak_idx, '日期']
        
        current_price = float(df.iloc[-1]['收盘'])
        drop_rate = (current_price - peak_price) / peak_price * 100
        
        return True, drop_rate, peak_date, peak_price, has_limit_down, drop_days
    except Exception as e:
        print(f"检测超跌失败 {stock_code}: {e}")
        return False, 0, None, 0, False, []

def add_to_candidate_pool(code, name, industry, pullback_date, drop_rate, peak_price, current_price, continuous_days):
    """添加候选股到池子"""
    conn = get_db_conn()
    c = conn.cursor()
    
    today = datetime.now().strftime('%Y%m%d')
    
    try:
        # 检查是否已存在
        c.execute("SELECT code FROM candidate_pool WHERE code = ?", (code,))
        exists = c.fetchone()
        
        if exists:
            # 更新状态
            c.execute('''
                UPDATE candidate_pool 
                SET status = 'watching',
                    drop_rate = ?,
                    current_price = ?,
                    last_updated = ?
                WHERE code = ?
            ''', (drop_rate, current_price, today, code))
        else:
            # 新增
            c.execute('''
                INSERT INTO candidate_pool 
                (code, name, industry, added_date, pullback_date, drop_rate, peak_price, current_price, status, last_updated)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'watching', ?)
            ''', (code, name, industry, today, pullback_date, drop_rate, peak_price, current_price, today))
        
        conn.commit()
    except Exception as e:
        print(f"添加候选股失败 {code}: {e}")
    finally:
        conn.close()

def update_strong_stock_pool(stocks):
    """更新强势股池"""
    conn = get_db_conn()
    c = conn.cursor()
    
    today = datetime.now().strftime('%Y%m%d')
    
    for stock in stocks:
        try:
            c.execute('''
                INSERT OR REPLACE INTO strong_stocks 
                (code, name, date_added, source, continuous_days, industry, last_zt_date, status)
                VALUES (?, ?, ?, 'continuous_zt', ?, ?, ?, 'active')
            ''', (stock['code'], stock['name'], today, stock['continuous_days'], stock['industry'], today))
        except:
            pass
    
    conn.commit()
    conn.close()

def generate_push_report(candidates):
    """生成候选股池推送报告"""
    if not candidates:
        return None
    
    today = datetime.now().strftime('%Y-%m-%d')
    
    report = f"""# 超跌反弹候选股池 {today}

## 今日超跌候选股 ({len(candidates)}只)

### 筛选条件
- 前期强势股（连板龙头）
- 下跌中有跌停（强势股补跌）
- 进入超跌观察区

| 代码 | 名称 | 板块 | 连板天数 | 跌幅 | 峰值日期 | 状态 |
|------|------|------|----------|------|----------|------|
"""
    for c in candidates:
        report += f"| {c['code']} | {c['name']} | {c['industry']} | {c['continuous_days']}连板 | {c['drop_rate']:.1f}% | {c['peak_date']} | 🔴观察 |\n"
    
    report += f"""
## 操作逻辑回顾

**买入条件**（三者共振）：
1. ✅ 个股出现止跌/企稳信号
2. ✅ 所属板块整体强势
3. ✅ 板块有资金流入
4. → 买入

**持续跟踪**：以上候选股将每日跟踪，等待买入信号出现时推送

---
*由月野兔V3.5自动生成 | {datetime.now().strftime('%H:%M:%S')}*
"""
    
    # 保存推送文件
    with open(PUSH_FILE, 'w', encoding='utf-8') as f:
        f.write(report)
    
    return report

def main():
    print(f"[{datetime.now()}] 超跌反弹扫描开始...")
    
    # 1. 获取近期强势股
    print(f"[{datetime.now()}] 获取今日涨停强势股...")
    strong_stocks = get_recent_strong_stocks(YESTERDAY)  # 用昨天确保有数据
    
    if not strong_stocks:
        print(f"[{datetime.now()}] 今日无强势股数据，尝试其他日期...")
        for i in range(1, 5):
            d = (datetime.now() - timedelta(days=i)).strftime('%Y%m%d')
            strong_stocks = get_recent_strong_stocks(d)
            if strong_stocks:
                break
    
    print(f"[{datetime.now()}] 获取到 {len(strong_stocks)} 只强势股")
    
    # 2. 更新强势股池
    update_strong_stock_pool(strong_stocks)
    
    # 3. 检测超跌
    pullback_candidates = []
    
    print(f"[{datetime.now()}] 开始检测超跌信号...")
    for stock in strong_stocks:
        is_pullback, drop_rate, peak_date, peak_price, has_limit_down, drop_days = detect_pullback(
            stock['code'], stock['name'], stock['continuous_days']
        )
        
        if is_pullback and abs(drop_rate) > 5:  # 跌幅超过5%才收录
            stock['drop_rate'] = drop_rate
            stock['peak_date'] = peak_date
            stock['peak_price'] = peak_price
            stock['has_limit_down'] = has_limit_down
            
            pullback_candidates.append(stock)
            
            # 添加到候选池
            add_to_candidate_pool(
                stock['code'], stock['name'], stock['industry'],
                YESTERDAY, drop_rate, peak_price,
                stock.get('close', 0), stock['continuous_days']
            )
    
    print(f"[{datetime.now()}] 检测到 {len(pullback_candidates)} 只超跌候选股")
    
    # 4. 生成推送报告
    if pullback_candidates:
        report = generate_push_report(pullback_candidates)
        print(f"[{datetime.now()}] 推送报告已生成")
        print(report)
    else:
        print(f"[{datetime.now()}] 今日无超跌候选股")
    
    print(f"[{datetime.now()}] 超跌反弹扫描完成")

if __name__ == "__main__":
    main()
