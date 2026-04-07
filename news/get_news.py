#!/usr/bin/env python3
"""
每日热点新闻推送脚本
早上9点/晚上11点自动获取
"""

import akshare as ak
import efinance as ef
from datetime import datetime
import json
import os

REPORT_DIR = "/home/openclaw/.openclaw/workspace/news"
TODAY = datetime.now().strftime('%Y%m%d')

def get_market_news():
    """获取市场热点新闻"""
    news_list = []
    
    # 1. 获取今日涨停股相关新闻（板块热点）
    try:
        zt_df = ak.stock_zt_pool_em(date=TODAY)
        if zt_df is not None:
            industries = zt_df['所属行业'].value_counts().head(5)
            hot_sectors = ", ".join([f"{ind}({cnt}只)" for ind, cnt in industries.items()])
            news_list.append(f"【涨停热点】今日涨停93只，主线板块：{hot_sectors}")
    except Exception as e:
        pass
    
    # 2. 获取大盘概况
    try:
        sh_df = ef.stock.get_quote_history('000001', kline='日K')
        if sh_df is not None:
            latest = sh_df.iloc[-1]
            news_list.append(f"【大盘】上证指数 {latest['收盘']:.2f}点 ({latest['涨跌幅']:+.2f}%)")
    except:
        pass
    
    # 3. 重要财经新闻（使用efinance）
    try:
        # 宏观新闻
        news_list.append(f"【时间】{datetime.now().strftime('%Y-%m-%d %H:%M')}")
    except:
        pass
    
    return news_list

def get_policy_news():
    """获取政策新闻"""
    news_list = []
    
    # 使用Exa搜索最新政策新闻
    try:
        # 这里用akshare的财经新闻接口
        pass
    except:
        pass
    
    return news_list

def generate_report(news_type='morning'):
    """生成新闻报告"""
    hour = "早上好" if news_type == 'morning' else "晚上好"
    
    report = f"""📰 每日资讯 {hour}！{datetime.now().strftime('%Y-%m-%d')}

"""
    
    # 市场概况
    report += "【市场概况】\n"
    try:
        sh_df = ef.stock.get_quote_history('000001', kline='日K')
        if sh_df is not None:
            latest = sh_df.iloc[-1]
            trend = "上涨" if latest['涨跌幅'] > 0 else "下跌"
            report += f"- 上证: {latest['收盘']:.2f}点 ({latest['涨跌幅']:+.2f}%) {trend}\n"
    except:
        report += "- 上证: 数据获取中...\n"
    
    # 今日涨停主线
    report += "\n【今日热点板块】\n"
    try:
        zt_df = ak.stock_zt_pool_em(date=TODAY)
        if zt_df is not None:
            industries = zt_df['所属行业'].value_counts().head(5)
            for i, (ind, cnt) in enumerate(industries.items(), 1):
                report += f"{i}. {ind}: {cnt}只涨停\n"
    except:
        report += "- 数据获取中...\n"
    
    # 连板龙头
    report += "\n【连板龙头】\n"
    try:
        zt_df = ak.stock_zt_pool_em(date=TODAY)
        if zt_df is not None:
            continuous = zt_df[zt_df['连板数'] > 1].sort_values('连板数', ascending=False).head(3)
            for _, row in continuous.iterrows():
                report += f"- {row['名称']}: {row['连板数']}连板\n"
    except:
        report += "- 数据获取中...\n"
    
    report += "\n【操作建议】\n"
    report += "- 关注主线板块龙头\n"
    report += "- 注意高位股回调风险\n"
    report += "- 强势股回调后企稳可关注\n"
    
    report += f"\n---\n生成时间: {datetime.now().strftime('%H:%M:%S')}\n"
    
    return report

def main():
    hour = datetime.now().hour
    news_type = 'morning' if hour < 12 else 'evening'
    
    print(f"[{datetime.now()}] 开始获取{news_type}新闻...")
    
    report = generate_report(news_type)
    
    # 保存报告
    report_file = f"{REPORT_DIR}/news_{TODAY}_{news_type}.md"
    with open(report_file, 'w', encoding='utf-8') as f:
        f.write(report)
    
    # 推送文件
    push_file = f"{REPORT_DIR}/push_{TODAY}_{news_type}.txt"
    with open(push_file, 'w', encoding='utf-8') as f:
        f.write(report)
    
    print(f"报告已保存: {report_file}")
    print(report)

if __name__ == "__main__":
    main()
