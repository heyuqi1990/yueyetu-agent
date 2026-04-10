#!/usr/bin/env python3
"""
解析涨停复盘图OCR数据，存入数据库
"""

import sqlite3
import re
from datetime import datetime

DB_PATH = "/home/openclaw/.openclaw/workspace/stocks/pullback_tracker/pullback.db"
OCR_FILE = "/home/openclaw/.openclaw/media/inbound/29236893-48fe-4848-9f98-3258171439ed.jpg"

def get_db_conn():
    return sqlite3.connect(DB_PATH)

def init_zt_detail_table():
    """初始化涨停详细数据表"""
    conn = get_db_conn()
    c = conn.cursor()
    
    c.execute('''
        CREATE TABLE IF NOT EXISTS zt_daily_detail (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT,
            board_type TEXT,  -- 板块名称
            board_count INTEGER,  -- 板块内涨停数
            stock_code TEXT,
            stock_name TEXT,
            limit_up_time TEXT,
            flow_market_cap REAL,  -- 流通市值(亿元)
            turnover_amount REAL,  -- 成交额(亿元)
            keywords TEXT,  -- 涨停关键词
            board_days TEXT,  -- 连板情况如"2天2板"
            source TEXT DEFAULT '韭研公社'
        )
    ''')
    
    conn.commit()
    conn.close()

def parse_ocr_and_save(ocr_text, date="20260410"):
    """解析OCR文本并保存到数据库"""
    conn = get_db_conn()
    c = conn.cursor()
    
    # 按行分割
    lines = ocr_text.strip().split('\n')
    
    current_board = None
    current_board_count = 0
    stock_count = 0
    
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        
        # 跳过标题和统计行
        if '韭研公社' in line or '涨停' not in line or '不含st' in line:
            i += 1
            continue
        
        # 识别板块标题（如"液冷服务器*6"）
        board_match = re.match(r'([^\*\*]+)\*(\d+)', line)
        if board_match and '亿' not in line and '板' not in line[:5]:
            current_board = board_match.group(1)
            current_board_count = int(board_match.group(2))
            i += 1
            continue
        
        # 识别连板信息行（如"2天2板"）
        days_match = re.match(r'(\d+天\d+板)', line)
        if days_match and current_board:
            board_days = days_match.group(1)
            
            # 下一行应该是股票详情
            i += 1
            if i < len(lines):
                detail_line = lines[i].strip()
                
                # 解析：代码 个股名 涨停时间 流通市值 成交额 关键词
                # 格式: 002328.52 新朋股份 9:34:12 57.7 7.2 液冷+签订电池储能项目投资协议+特斯拉+机电零部件
                parts = detail_line.split()
                if len(parts) >= 5:
                    code_with_sh = parts[0]
                    name = parts[1]
                    limit_time = parts[2]
                    
                    # 代码处理
                    if '.SH' in code_with_sh or '.SZ' in code_with_sh:
                        code = code_with_sh.replace('.SZ', '.SZ').replace('.SH', '.SH')
                    else:
                        code = code_with_sh
                    
                    # 流通市值和成交额
                    flow_cap = float(parts[3]) if parts[3].replace('.', '').isdigit() else 0
                    turnover = float(parts[4]) if parts[4].replace('.', '').isdigit() else 0
                    
                    # 关键词（后续所有部分合并）
                    keywords = ' '.join(parts[5:]) if len(parts) > 5 else ''
                    
                    try:
                        c.execute('''
                            INSERT INTO zt_daily_detail 
                            (date, board_type, stock_code, stock_name, limit_up_time, 
                             flow_market_cap, turnover_amount, keywords, board_days)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ''', (date, current_board, code, name, limit_time, 
                              flow_cap, turnover, keywords, board_days))
                        stock_count += 1
                    except Exception as e:
                        print(f"插入失败: {e}")
        
        i += 1
    
    conn.commit()
    conn.close()
    print(f"成功存入 {stock_count} 只股票的详细数据")
    return stock_count

if __name__ == "__main__":
    print(f"[{datetime.now()}] 开始解析涨停复盘图...")
    init_zt_detail_table()
    
    # 读取OCR结果（已在之前获取）
    # 这里提供独立运行接口
    print(f"[{datetime.now()}] 解析完成")

# OCR结果数据（从easyocr提取）
OCR_DATA = """韭研公社全天涨停复盘简图
(04.10)
流通市值
成交额
板数
代码
个股
涨停时间
涨停关键词
(亿元)
(亿元)
液冷服务器*6
2天2板
002328.52
新朋股份
9:34:12
57.7
7.2
液冷+签订电池储能项目投资协议+特斯拉+机电零部件
2天2板
002580.52
圣阳股份
13:51:36
85.9
34.6
液冷+数据中心电源 (UPS) +储能+算电协同+固态电池
2天2板
002824.52
和胜股份
14:51.24
55.6
液冷+消费电子+传机器人灵巧手+新能源汽车+固态电池
603088.SH
宁波精达
10:42:44
58.8
6.2
液冷+子公司合作维谛+人形机器人 +半导体芯片封装
600480.SH
凌云股份
14:23:23
130.9
6
液冷+人形机器人+特斯拉+飞行汽车+汽车热管理
002418.52
康盛股份
14:54:51
64.7
服务器液冷+千岛湖智造基地
国产芯片*5
000670.52
盈方微
9:34:03
67
6.4
存储芯片+拟重大资产重组+芯片分销+第一大客户小米
605255.SH
天普股份
13:42:44
141.2
2.5
中昊芯英 (TPU) +汽车零部件+车用橡胶软管
688478.SH
晶升股份
14:36:32
37.1
3.7
半导体长晶设备+碳化硅单晶炉 +并购为准智能+CVD设备
001309.52
德明利
14:47:39
719.5
101.9
存储芯片+业绩暴增+SSD +光芯片
002787.52
华源控股
14:54:39
34.6
5.3
半导体设备+业绩增长+回购+电池钢壳
光通信*4
7天3板
600105.SH
永鼎股份
13:28:54
557
84.2
光芯片+光棒扩产+高温超导
2天2板
600345.5H
长江通信
10:41:10
115
14
参股长飞光纤 +千帆星座+人工智能+智慧交通
600103.SH
青山纸业
9:25:00
86.5
3.6
光模块+合作博通+纸价上调+福建国资
300131.52
英唐智控
14:56:54
160.7
37.8
OCS光路交换机 +光刻机+芯片制造+AR眼镜
玻璃基板*4
2天2板
600707.SH
彩虹股份
9:33:05
251.9
6.5
玻璃基板+液晶面板+咸阳国资
2天2板
002962.52
五方光电
9:36:51
35.4
5.9
TGV + 手势识别+供货华为+机器人视觉
603773.SH
沃格光电
10:20:06
96.9
13
玻璃基板 (CPO) + Micro LED + 太空光伏+先进封装+TGV
600876.SH
凯盛新能
9:51.06
39.3
0.9
玻璃基板+光伏组件+光伏玻璃+央企
大消费*4
601010.SH
文峰股份
10:28:55
44.7
2.7
百货零售 (江苏) +微信小店+ '文峰'
000659.52
珠海中富
11:04:57
55.3
2.7
饮料包装+瓶装水+控制权变更+珠海 +低价股
001211.52
双枪科技
13:54:45
20.6
3.3
金钢瓷新品+食品 (福建) +日用餐厨具+跨境电商
603101.SH
汇嘉时代
14:14:20
41.5
1.8
胖东来调改 (新疆) +商超连锁+电子商务+预制菜
燃气轮机*3
7天3板
000534.52
万泽股份
9:44:57
228.4
9.9
燃气轮机(西门子) +发动机核心部件+高温合金+创新药
3天2板
605060.SH
联德股份
10:06:37
141
4
数据中心 (燃机) +天然气发动机零部件+卡特彼勒审厂
600482.SH
中国动力
9:30:44
917.3
18
燃气轮机+柴油发电机 +航母
算力*3
3天3板
000889.52
中嘉博创
10:32:12
37.8
7.8
算力+AI应用+字节+仲裁回款+移动通信
600156.SH
华升股份
10:37:24
32.8
1.4
拟收购易信科技+智算中心+合作阿里+折叠屏铰链+人形机器人
002263.52
大东南
13:05:18
92
20.2
算力协同+特高压电容膜+固态电池 (铝塑膜) +新能源车
固态电池*3
603200.SH
上海洗霸
10:02:46
108.3
5.1
固态电池+数据中心+硅碳负极
002074.5乙
国轩高科
13:15.36
673.8
40.4
固态电池+储能+锂资源
002733.52
雄韬股份
14:00:15
111.6
12.4
固态电池+数据中心备电+氢燃料电池+空气电池
机器人*2
3天2板
603272.5H
联翔股份
9:44:03
38.4
1.7
新增经营范围(机器人销售)+控股股东转让股份+墙布
002988.52
豪美新材
10:35:12
88.4
3.4
人形机器人+铝基新材料 +汽车轻量化+新能源电池壳体+建材门窗
内蒙古自贸区*2
000626.S乙
远大控股
9:25:00
43.4
0.8
贸易+棕榈油+跨境电商+东盟
001269.52
欧晶科技
9:37:09
44.6
光伏石英坩埚+半导体 +下修采购协议预估至2.7亿美元+电子级石英砂
电子布*2
003036.52
泰坦股份
9:56:51
57.3
2.3
电子布上游+机器人+纺织机械+固态电池+一带一路
605006.SH
山东玻纤
9:57:13
60.7
4.9
玻纤纱 (电子级玻纤布上游) +玻纤+山东国资
医疗医药*2
600713.SH
南京医药
11:11:36
78
6.3
医药批发+南京国资+互联网医疗+医疗服务
002950.S乙
奥美医疗
11:12:48
61.3
3.7
医疗耗材(PVC手套)+医用敷料+医用吸收垫+医美
公告*9
4天4板
600743.5H
华远控股
9:35:39
62.2
4.3
实控人筹划重组+房地产 +北京国资+转型城市运营服务商
3天3板
603950.5H
长源东谷
9:25:00
159.8
3.2
拟收购热交换企业+柴发缸体 +数据中心 (合作玉柴) +机器人+飞行汽车
3天3板
603777.SH
来伊份
9:48:39
56.8
6.7
拟转让10%股份+儿童系列零食+休闲食品+威士忌
2天2板
002364.52
中恒电气
9:25.00
196
1.2
宁德时代入股+算电协同+数据中心 (HVDC) +阿里/字节
2天2板
603933.SH
睿能科技
9:37:39
50.9
3.9
拟收购博泰智能+机器人 (福建) +拟H股上市+存储芯片分销
600983.SH
惠而浦
9:30:48
85.6
0.9
年报增长+家用电器+小家电
605117.SH
德业股份
9:33:10
1269.4
17.8
一季度业绩预增+光伏逆变器+储能+逆变器
603889.SH
新澳股份
10:11.09
63.4
2.5
年报增长+羊绒毛纺+出海
688690.SH
纳微科技
14:49:40
127.4
业绩增长+减肥药 +纳米微球材料研发
其他*10
000402.S乙
金融街
9:32:15
83
1.7
实控人筹划重组+房地产+北京国资+参股券商
603093.SH
南华期货
9:46:30
117.8
2
期货+证券+香港金融牌照
601999.SH
出版传媒
10:35:09
46.6
1.7
AI应用+文化传媒+知识产权保护
600537.SH
亿晶光电
10:37.21
48.2
8.4
预重整备案+钙钛矿电池+光伏电池+低价股
001299.52
美能能源
10:49:06
33.5
2.1
天然气+新能源+AI风险预测
605069.SH
正和生态
13:20:15
26.2
0.8
智谱AI+机器狗+战略合作无问芯穹+海洋生态
603026.SH
石大胜华
13:22:45
198.2
22.9
六氟磷酸锂 +固态电池+电解液溶剂供应商
002363.5乙
隆基机械
14:05:30
36
2.4
火箭运输车+汽车制动部件+飞行汽车+华为/特斯拉
002177.52
御银股份
14:51:51
55.1
12
稳定币+数字货币 +重组预期+国产操作系统
000762.52
西藏矿业
14:55:39
176.4
27.4
锂矿+铬铁矿
不含st和末开板新股。涨停59家
跌停8家。连板13家。破板率30.60%
统计数据根据市场信息综合统计  人工编写全网最诚意的涨停解析,午间和盘后可前往
juyangongshe.com查看详细版"""

if __name__ == "__main__":
    # 运行解析
    conn = get_db_conn()
    c = conn.cursor()
    c.execute("DELETE FROM zt_daily_detail WHERE date = '20260410'")  # 清除旧数据
    conn.commit()
    conn.close()
    
    parse_ocr_and_save(OCR_DATA, "20260410")
