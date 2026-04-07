#!/usr/bin/env python3
"""
舒华体育 605299 走势追踪脚本
每日下午4点自动获取数据并生成对比报告
"""

import efinance as ef
import pandas as pd
from datetime import datetime, timedelta
import json
import os

STOCK_CODE = "605299"
DATA_FILE = "/home/openclaw/.openclaw/workspace/stocks/605299/history.json"
REPORT_FILE = "/home/openclaw/.openclaw/workspace/stocks/605299/daily_report.md"

def get_baseline_data():
    """获取4月3日(上次分析)的数据"""
    try:
        df = ef.stock.get_quote_history(STOCK_CODE, kline='日K')
        if df is not None:
            # 找4月3日的数据
            mask = df['日期'] == '2026-04-03'
            if mask.any():
                row = df[mask].iloc[0]
                return {
                    'date': '2026-04-03',
                    'close': float(row['收盘']),
                    'change_pct': float(row['涨跌幅']),
                    'volume': float(row['成交量']),
                    'turnover': float(row['换手率']),
                    'high': float(row['最高']),
                    'low': float(row['最低'])
                }
        return None
    except Exception as e:
        print(f"获取基线数据失败: {e}")
        return None

def get_today_data():
    """获取今日数据"""
    try:
        snapshot = ef.stock.get_quote_snapshot(STOCK_CODE)
        return {
            'time': snapshot['时间'],
            'close': float(snapshot['最新价']),
            'change_pct': float(snapshot['涨跌幅']),
            'open': float(snapshot['今开']),
            'high': float(snapshot['最高']),
            'low': float(snapshot['最低']),
            'volume': float(snapshot['成交量']),
            'turnover': float(snapshot['换手率']),
            'amount': float(snapshot['成交额'])
        }
    except Exception as e:
        print(f"获取今日数据失败: {e}")
        return None

def get_recent_kline(days=10):
    """获取近期K线数据"""
    try:
        df = ef.stock.get_quote_history(STOCK_CODE, kline='日K')
        if df is not None:
            return df.tail(days).to_dict('records')
        return []
    except Exception as e:
        print(f"获取K线失败: {e}")
        return []

def generate_report(today_data, baseline_data, recent_kline):
    """生成对比报告"""
    today = datetime.now().strftime('%Y-%m-%d')
    
    report = f"""# 舒华体育 605299 每日追踪报告
**生成时间**: {today} 16:00

---

## 今日行情 ({today})

| 指标 | 数值 |
|------|------|
| 收盘价 | **{today_data['close']}元** |
| 涨跌幅 | **{today_data['change_pct']}%** |
| 开盘价 | {today_data['open']}元 |
| 最高价 | {today_data['high']}元 |
| 最低价 | {today_data['low']}元 |
| 成交量 | {today_data['volume']/10000:.1f}万手 |
| 成交额 | {today_data['amount']/100000000:.2f}亿元 |
| 换手率 | {today_data['turnover']}% |

---

## 与上次分析对比 (4月3日 → {today})

| 指标 | 4月3日(基准) | 今日 | 变化 |
|------|-------------|------|------|
| 收盘价 | {baseline_data['close']}元 | {today_data['close']}元 | {((today_data['close']-baseline_data['close'])/baseline_data['close']*100):+.2f}% |
| 换手率 | {baseline_data['turnover']}% | {today_data['turnover']}% | {today_data['turnover']-baseline_data['turnover']:+.2f}% |

**相对4月3日涨跌**: {((today_data['close']-baseline_data['close'])/baseline_data['close']*100):+.2f}%

---

## 近期走势

| 日期 | 收盘 | 涨跌幅 | 换手率 |
|------|------|--------|--------|
"""
    
    for row in recent_kline[-10:]:
        date = row['日期']
        close = row['收盘']
        chg = row['涨跌幅']
        vol = row['换手率']
        report += f"| {date} | {close} | {chg}% | {vol}% |\n"
    
    report += f"""

---

## 趋势判断

"""
    # 简单趋势判断
    if today_data['change_pct'] > 5:
        verdict = "**强势上涨**"
    elif today_data['change_pct'] > 0:
        verdict = "小幅上涨"
    elif today_data['change_pct'] > -5:
        verdict = "小幅下跌"
    else:
        verdict = "**大幅下跌**"
    
    report += f"- 今日走势: {verdict}\n"
    
    if len(recent_kline) >= 5:
        ma5 = sum([r['收盘'] for r in recent_kline[-5:]])/5
        report += f"- 5日均线: {ma5:.2f}元\n"
        if today_data['close'] > ma5:
            report += "- **站在5日线上方**\n"
        else:
            report += "- **跌破5日均线**\n"
    
    report += "\n---\n*由月野兔V3.5自动生成*\n"
    
    return report

def main():
    print(f"[{datetime.now()}] 开始获取舒华体育数据...")
    
    # 获取数据
    today_data = get_today_data()
    baseline_data = get_baseline_data()
    recent_kline = get_recent_kline()
    
    if today_data is None:
        print("获取今日数据失败")
        return
    
    if baseline_data is None:
        # 如果没有4月3日数据，用近期最低点做基准
        baseline_data = {
            'date': '近期低点',
            'close': min([r['收盘'] for r in recent_kline]) if recent_kline else today_data['close'],
            'turnover': 0
        }
    
    # 生成报告
    report = generate_report(today_data, baseline_data, recent_kline)
    
    # 保存报告
    with open(REPORT_FILE, 'w', encoding='utf-8') as f:
        f.write(report)
    
    print(f"报告已生成: {REPORT_FILE}")
    print(report)
    
    # 输出JSON格式方便后续处理
    result = {
        'date': datetime.now().strftime('%Y-%m-%d'),
        'today': today_data,
        'baseline': baseline_data,
        'change_from_baseline': ((today_data['close']-baseline_data['close'])/baseline_data['close']*100) if baseline_data else 0
    }
    print(f"\nJSON数据: {json.dumps(result, ensure_ascii=False, indent=2)}")

if __name__ == "__main__":
    main()
