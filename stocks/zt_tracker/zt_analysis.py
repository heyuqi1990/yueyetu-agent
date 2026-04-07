#!/usr/bin/env python3
"""
涨停板自动追踪系统 v1.0
每日收盘后自动获取涨停数据，分析市场环境和热点板块
"""

import akshare as ak
import efinance as ef
import pandas as pd
from datetime import datetime, timedelta
import json
import os

# ============== 配置 ==============
STOCK_CODE = "605299"  # 舒华体育
STOCK_NAME = "舒华体育"
REPORT_DIR = "/home/openclaw/.openclaw/workspace/stocks/zt_tracker"
TODAY = datetime.now().strftime('%Y%m%d')
REPORT_FILE = f"{REPORT_DIR}/report_{TODAY}.md"
DATA_FILE = f"{REPORT_DIR}/data_{TODAY}.json"
HISTORY_FILE = f"{REPORT_DIR}/history.json"

def get_date_str():
    """获取日期字符串，格式20261007"""
    return datetime.now().strftime('%Y%m%d')

def get_zt_pool(date):
    """获取涨停股池"""
    try:
        df = ak.stock_zt_pool_em(date=date)
        return df
    except Exception as e:
        print(f"获取涨停池失败: {e}")
        return None

def get_zt_strong_pool(date):
    """获取强势股池（连续涨停）"""
    try:
        df = ak.stock_zt_pool_strong_em(date=date)
        return df
    except Exception as e:
        print(f"获取强势池失败: {e}")
        return None

def get_market_summary():
    """获取大盘概况"""
    try:
        # 上证指数
        sh_df = ef.stock.get_quote_history('000001', kline='日K')
        if sh_df is not None and len(sh_df) > 0:
            latest = sh_df.iloc[-1]
            return {
                'index': '上证指数',
                'close': float(latest['收盘']),
                'change_pct': float(latest['涨跌幅']),
                'date': latest['日期']
            }
    except Exception as e:
        print(f"获取大盘数据失败: {e}")
    return None

def analyze_zt_pool(zt_df, target_code):
    """分析涨停板数据"""
    if zt_df is None or len(zt_df) == 0:
        return None
    
    # 基础统计
    total_count = len(zt_df)
    
    # 行业分布
    industry_stats = zt_df['所属行业'].value_counts().head(10)
    
    # 成交额分布
    avg_amount = zt_df['成交额'].mean()
    median_amount = zt_df['成交额'].median()
    
    # 流通市值分布
    avg_cap = zt_df['流通市值'].mean()
    median_cap = zt_df['流通市值'].median()
    
    # 连板情况
    continuous_count = (zt_df['连板数'] > 1).sum()
    continuous_pct = continuous_count / total_count * 100
    
    # 首次封板时间分布
    morning_count = 0  # 早盘涨停(9:30-10:00)
    for t in zt_df['首次封板时间']:
        try:
            if int(t[:2]) < 10:
                morning_count += 1
        except:
            pass
    
    # 炸板率
    zhaban_rate = zt_df['炸板次数'].sum() / total_count * 100
    
    # 目标股票分析
    target_info = None
    if target_code in zt_df['代码'].values:
        row = zt_df[zt_df['代码'] == target_code].iloc[0]
        target_info = {
            'name': row['名称'],
            'code': row['代码'],
            'close': float(row['最新价']),
            'change_pct': float(row['涨跌幅']),
            'turnover': float(row['换手率']),
            'amount': float(row['成交额']),
            'cap': float(row['流通市值']),
            'first_time': row['首次封板时间'],
            'continuous': int(row['连板数']),
            'industry': row['所属行业']
        }
    
    return {
        'total_count': total_count,
        'industry_top10': industry_stats.to_dict(),
        'avg_amount': float(avg_amount),
        'median_amount': float(median_amount),
        'avg_cap': float(avg_cap),
        'median_cap': float(median_cap),
        'continuous_count': int(continuous_count),
        'continuous_pct': float(continuous_pct),
        'morning_count': morning_count,
        'zhaban_rate': float(zhaban_rate),
        'target_stock': target_info
    }

def generate_report(date_str, market, analysis, zt_df):
    """生成分析报告"""
    today_display = f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:]}"
    
    report = f"""# 涨停板分析报告 {today_display}

---

## 一、市场整体环境

"""
    if market:
        report += f"| 指标 | 数值 |\n|------|------|\n"
        report += f"| 上证指数 | {market['close']:.2f} ({market['change_pct']:+.2f}%) |\n"
        report += f"| 收盘日期 | {market['date']} |\n"
    else:
        report += "暂无大盘数据\n"
    
    report += f"\n今日涨停股数量: **{analysis['total_count']}只**\n"
    
    report += f"""
---

## 二、涨停板特征分析

### 基本统计
| 指标 | 数值 |
|------|------|
| 涨停股数量 | {analysis['total_count']}只 |
| 平均成交额 | {analysis['avg_amount']/100000000:.2f}亿 |
| 中位数成交额 | {analysis['median_amount']/100000000:.2f}亿 |
| 平均流通市值 | {analysis['avg_cap']/100000000:.2f}亿 |
| 中位数流通市值 | {analysis['median_cap']/100000000:.2f}亿 |
| 连板股数量 | {analysis['continuous_count']}只 ({analysis['continuous_pct']:.1f}%) |
| 早盘涨停(9:30-10:00) | {analysis['morning_count']}只 |
| 炸板率 | {analysis['zhaban_rate']:.1f}% |

### 行业分布 TOP10
| 行业 | 涨停数量 |
|------|----------|
"""
    for industry, count in list(analysis['industry_top10'].items())[:10]:
        report += f"| {industry} | {count} |\n"
    
    report += f"""

---

## 三、热点板块解读

"""
    # 找出热点行业
    top_industries = list(analysis['industry_top10'].items())[:5]
    report += "**今日热点板块：**\n"
    for i, (ind, cnt) in enumerate(top_industries, 1):
        report += f"{i}. **{ind}** - {cnt}只涨停\n"
    
    report += "\n**板块特征分析：**\n"
    if analysis['total_count'] >= 80:
        report += "- 涨停数量较多（≥80只），市场情绪活跃\n"
    elif analysis['total_count'] >= 50:
        report += "- 涨停数量适中，市场情绪温和\n"
    else:
        report += "- 涨停数量偏少，市场情绪较弱\n"
    
    if analysis['continuous_pct'] > 20:
        report += "- 连板股较多，短线赚钱效应强\n"
    elif analysis['continuous_pct'] > 10:
        report += "- 连板股占比适中，短线氛围尚可\n"
    else:
        report += "- 连板股较少，短线轮动较快\n"
    
    if analysis['morning_count'] > analysis['total_count'] * 0.3:
        report += "- 早盘涨停较多，主力强势\n"
    else:
        report += "- 午盘涨停较多，个股独立行情为主\n"
    
    # 舒华体育分析
    report += f"""

---

## 四、舒华体育({STOCK_CODE})横向对比

"""
    if analysis['target_stock']:
        ts = analysis['target_stock']
        report += f"| 指标 | 舒华体育 | 市场平均 | 对比 |\n"
        report += f"|------|----------|----------|------|\n"
        report += f"| 最新价 | {ts['close']}元 | - | - |\n"
        report += f"| 换手率 | {ts['turnover']:.2f}% | {analysis['avg_amount']/100000000*100/analysis['total_count']:.2f}% | "
        if ts['turnover'] > 10:
            report += "**高换手** |\n"
        else:
            report += "正常 |\n"
        report += f"| 成交额 | {ts['amount']/100000000:.2f}亿 | {analysis['median_amount']/100000000:.2f}亿 | "
        if ts['amount'] > analysis['median_amount'] * 3:
            report += "**超大** |\n"
        elif ts['amount'] > analysis['median_amount']:
            report += "较大 |\n"
        else:
            report += "正常 |\n"
        report += f"| 流通市值 | {ts['cap']/100000000:.2f}亿 | {analysis['median_cap']/100000000:.2f}亿 | "
        if ts['cap'] > analysis['median_cap']:
            report += "偏大 |\n"
        else:
            report += "适中 |\n"
        report += f"| 首次封板 | {ts['first_time']} | - | - |\n"
        report += f"| 连板数 | {ts['continuous']} | - | - |\n"
        report += f"| 所属行业 | {ts['industry']} | - | - |\n"
        
        # 相对位置
        if ts['continuous'] > 1:
            report += f"\n**舒华体育连续{ts['continuous']}板，属于强势股**\n"
        
        if ts['first_time'] and int(ts['first_time'][:2]) < 10:
            report += "早盘封板，主力强势\n"
        
        # 在行业内的对比
        industry_total = analysis['industry_top10'].get(ts['industry'], 0)
        if industry_total > 1:
            report += f"在{ts['industry']}板块内涨停{industry_total}只，舒华体育是板块成员之一\n"
    else:
        report += "今日舒华体育未涨停\n"
        # 查询今日收盘情况
        try:
            snap = ef.stock.get_quote_snapshot(STOCK_CODE)
            report += f"\n今日收盘数据：\n"
            report += f"- 收盘价: {snap['最新价']}元\n"
            report += f"- 涨跌幅: {snap['涨跌幅']:.2f}%\n"
            report += f"- 换手率: {snap['换手率']:.2f}%\n"
        except:
            pass
    
    # 总结
    report += f"""

---

## 五、操作建议

根据今日涨停板环境分析：

"""
    if analysis['total_count'] >= 80:
        report += "**市场情绪高涨**，涨停股数量多，短线机会较多\n"
    elif analysis['total_count'] >= 50:
        report += "**市场情绪温和**，涨停股数量适中，可精选个股\n"
    else:
        report += "**市场情绪偏弱**，涨停股数量少，谨慎操作\n"
    
    if analysis['target_stock']:
        ts = analysis['target_stock']
        if ts['continuous'] >= 3:
            report += f"\n**舒华体育连续{ts['continuous']}板**，属于高位强势股：\n"
            report += "- 风险较大，不建议追高\n"
            report += "- 可关注明日开盘情绪，若低开可考虑快进快出\n"
        elif ts['continuous'] >= 2:
            report += f"\n**舒华体育连续{ts['continuous']}板**，强势：\n"
            report += "- 明日溢价预期较强\n"
            report += "- 关注开盘承接情况\n"
        else:
            report += f"\n**舒华体育首板**，可关注板块联动效应\n"
    
    report += f"""
---

*报告生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}*
*由月野兔V3.5自动生成*
"""
    
    return report

def main():
    global REPORT_FILE, DATA_FILE
    
    date_str = get_date_str()
    REPORT_FILE = f"{REPORT_DIR}/report_{date_str}.md"
    DATA_FILE = f"{REPORT_DIR}/data_{date_str}.json"
    
    print(f"[{datetime.now()}] 开始分析涨停板数据...")
    
    # 获取数据
    zt_df = get_zt_pool(date_str)
    market = get_market_summary()
    
    # 分析
    analysis = analyze_zt_pool(zt_df, STOCK_CODE)
    
    if analysis is None:
        print("分析失败")
        return
    
    # 生成报告
    report = generate_report(date_str, market, analysis, zt_df)
    
    # 保存
    with open(REPORT_FILE, 'w', encoding='utf-8') as f:
        f.write(report)
    
    # 保存JSON数据
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump({
            'date': date_str,
            'market': market,
            'analysis': analysis,
            'zt_count': len(zt_df) if zt_df is not None else 0
        }, f, ensure_ascii=False, indent=2, default=str)
    
    # 更新历史记录
    history = []
    if os.path.exists(HISTORY_FILE):
        with open(HISTORY_FILE, 'r') as f:
            history = json.load(f)
    
    history.append({
        'date': date_str,
        'zt_count': analysis['total_count'],
        'target_info': analysis['target_stock']
    })
    
    # 只保留最近30条
    history = history[-30:]
    
    with open(HISTORY_FILE, 'w') as f:
        json.dump(history, f, ensure_ascii=False, indent=2)
    
    print(f"\n报告已保存: {REPORT_FILE}")
    print(f"数据已保存: {DATA_FILE}")
    print("\n" + "="*50)
    print(report)

if __name__ == "__main__":
    main()
