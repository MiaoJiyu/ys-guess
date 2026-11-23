# server.py
# -*- coding: utf-8 -*-
"""
提瓦特 · 元素猜谜 · 多人对战服务器 2.0
用法：python server.py [端口，默认8000]

本版本在原有「局域网多人猜角色」的基础上新增：
- 地脉异变：每小局随机元素规则，改变猜测次数/积分
- 元素视野：消耗星辉揭示答案属性，有分数代价
- 限时挑战、决胜局双倍、题库地区、连击奖励、一击必杀
- 房间快捷表情、离开房间、再来一场
- 玩家战绩统计（胜场、最高连击、一击必杀、Rating）
- 完整的角色图鉴数据下发

局域网联机方式保持不变：python server.py，然后浏览器访问 http://<本机IP>:8000
"""
import base64
import hashlib
import json
import os
import random
import socket
import string
import struct
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# ============================================================
# 配置常量
# ============================================================
STARTING_RATING = 1500
K_FACTOR = 32
ADMIN_PASSWORD = "admin123"   # 管理密码，可自行修改
PLAYERS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "players.json")
MIN_RATING = 100              # Rating 下限
MAX_MATCH_ROUNDS = 20         # 单大场最多局数
MAX_PLAYERS = 8               # 房间最多人数
HINT_SCORE_COST = 20          # 每次元素视野的分数代价
SERVER_VERSION = "2.0"
MAX_TIME_LIMIT = 600
MAX_HINTS_PER_MATCH = 5

# ============================================================
# 角色数据
# ============================================================
def C(name, letter, gender, region, element, weapon, birthday, version, rarity):
    return {"name": name, "letter": letter, "gender": gender, "region": region,
            "element": element, "weapon": weapon, "birthday": birthday,
            "version": version, "rarity": rarity}

CHARACTERS = [
    # 蒙德
    C("迪卢克","D","男","蒙德","火","双手剑","4/30","1.0",5),
    C("琴","Q","女","蒙德","风","单手剑","3/14","1.0",5),
    C("安柏","A","女","蒙德","火","弓","8/10","1.0",4),
    C("丽莎","L","女","蒙德","雷","法器","6/9","1.0",4),
    C("凯亚","K","男","蒙德","冰","单手剑","11/30","1.0",4),
    C("芭芭拉","B","女","蒙德","水","法器","7/5","1.0",4),
    C("雷泽","L","男","蒙德","雷","双手剑","9/9","1.0",4),
    C("菲谢尔","F","女","蒙德","雷","弓","5/27","1.0",4),
    C("班尼特","B","男","蒙德","火","单手剑","2/29","1.0",4),
    C("诺艾尔","N","女","蒙德","岩","双手剑","3/21","1.0",4),
    C("莫娜","M","女","蒙德","水","法器","8/31","1.0",5),
    C("可莉","K","女","蒙德","火","法器","7/27","1.0",5),
    C("迪奥娜","D","女","蒙德","冰","弓","1/18","1.1",4),
    C("阿贝多","A","男","蒙德","岩","单手剑","9/13","1.2",5),
    C("优菈","Y","女","蒙德","冰","双手剑","10/25","1.5",5),
    C("温迪","W","男","蒙德","风","弓","6/16","1.0",5),
    C("砂糖","S","女","蒙德","风","法器","11/26","1.0",4),
    C("罗莎莉亚","L","女","蒙德","冰","长柄武器","1/24","1.4",4),
    C("米卡","M","男","蒙德","冰","长柄武器","8/11","3.5",4),
    C("法尔伽","F","男","蒙德","风","双手剑","2/17","6.4",5),
    C("杜林","D","男","蒙德","火","单手剑","3/14","6.2",5),
    C("塔利雅","T","男","蒙德","水","单手剑","5/25","5.7",4),
    C("布伦妮","B","女","蒙德","风","法器","11/20","6.6",4),
    C("洛恩","L","男","蒙德","冰","长柄武器","4/3","6.6",5),
    # 璃月
    C("刻晴","K","女","璃月","雷","单手剑","11/20","1.0",5),
    C("七七","Q","女","璃月","冰","单手剑","3/3","1.0",5),
    C("凝光","N","女","璃月","岩","法器","8/26","1.0",4),
    C("香菱","X","女","璃月","火","长柄武器","11/2","1.0",4),
    C("行秋","X","男","璃月","水","单手剑","10/9","1.0",4),
    C("北斗","B","女","璃月","雷","双手剑","2/14","1.0",4),
    C("重云","C","男","璃月","冰","双手剑","9/7","1.0",4),
    C("钟离","Z","男","璃月","岩","长柄武器","12/31","1.1",5),
    C("甘雨","G","女","璃月","冰","弓","12/2","1.2",5),
    C("魈","X","男","璃月","风","长柄武器","4/17","1.3",5),
    C("胡桃","H","女","璃月","火","长柄武器","7/15","1.3",5),
    C("烟绯","Y","女","璃月","火","法器","7/28","1.5",4),
    C("申鹤","S","女","璃月","冰","长柄武器","3/10","2.4",5),
    C("云堇","Y","女","璃月","岩","长柄武器","5/21","2.4",4),
    C("夜兰","Y","女","璃月","水","弓","4/20","2.7",5),
    C("辛焱","X","女","璃月","火","双手剑","10/16","1.1",4),
    C("白术","B","男","璃月","草","法器","4/25","3.6",5),
    C("瑶瑶","Y","女","璃月","草","长柄武器","3/6","3.4",4),
    C("嘉明","J","男","璃月","火","双手剑","12/22","4.4",4),
    C("闲云","X","女","璃月","风","法器","4/11","4.4",5),
    C("蓝砚","L","女","璃月","风","法器","1/6","5.3",4),
    C("兹白","Z","女","璃月","岩","单手剑","5/15","6.3",5),
    # 稻妻
    C("神里绫华","S","女","稻妻","冰","单手剑","9/28","1.6",5),
    C("枫原万叶","F","男","稻妻","风","单手剑","10/29","1.6",5),
    C("宵宫","X","女","稻妻","火","弓","6/21","2.0",5),
    C("雷电将军","L","女","稻妻","雷","长柄武器","6/26","2.1",5),
    C("珊瑚宫心海","S","女","稻妻","水","法器","2/22","2.1",5),
    C("九条裟罗","J","女","稻妻","雷","弓","7/14","2.1",4),
    C("早柚","Z","女","稻妻","风","双手剑","10/19","2.2",4),
    C("托马","T","男","稻妻","火","长柄武器","1/9","2.2",4),
    C("荒泷一斗","H","男","稻妻","岩","双手剑","6/1","2.3",5),
    C("五郎","W","男","稻妻","岩","弓","5/18","2.3",4),
    C("八重神子","B","女","稻妻","雷","法器","6/27","2.5",5),
    C("神里绫人","S","男","稻妻","水","单手剑","3/26","2.6",5),
    C("鹿野院平藏","L","男","稻妻","风","法器","7/24","2.8",4),
    C("久岐忍","J","女","稻妻","雷","单手剑","7/27","2.7",4),
    C("绮良良","Q","女","稻妻","草","单手剑","1/22","3.7",4),
    C("千织","Q","女","稻妻","岩","单手剑","8/17","4.5",5),
    C("梦见月瑞希","M","女","稻妻","风","法器","3/16","5.4",5),
    # 须弥
    C("提纳里","T","男","须弥","草","弓","12/29","3.0",5),
    C("柯莱","K","女","须弥","草","弓","5/8","3.0",4),
    C("赛诺","S","男","须弥","雷","长柄武器","6/23","3.1",5),
    C("妮露","N","女","须弥","水","单手剑","12/3","3.1",5),
    C("纳西妲","N","女","须弥","草","法器","10/27","3.2",5),
    C("流浪者","L","男","须弥","风","法器","1/3","3.3",5),
    C("艾尔海森","A","男","须弥","草","单手剑","2/11","3.4",5),
    C("迪希雅","D","女","须弥","火","双手剑","4/7","3.5",5),
    C("珐露珊","F","女","须弥","风","弓","8/20","3.0",4),
    C("莱依拉","L","女","须弥","冰","单手剑","12/19","3.2",4),
    C("坎蒂丝","K","女","须弥","水","长柄武器","5/3","3.1",4),
    C("多莉","D","女","须弥","雷","双手剑","12/21","3.0",4),
    C("卡维","K","男","须弥","草","双手剑","7/9","3.6",4),
    C("赛索斯","S","男","须弥","雷","弓","5/31","4.7",4),
    # 枫丹
    C("林尼","L","男","枫丹","火","弓","2/2","4.0",5),
    C("琳妮特","L","女","枫丹","风","单手剑","2/2","4.0",4),
    C("菲米尼","F","男","枫丹","冰","双手剑","9/24","4.0",4),
    C("那维莱特","N","男","枫丹","水","法器","12/18","4.1",5),
    C("莱欧斯利","L","男","枫丹","冰","法器","11/23","4.1",5),
    C("芙宁娜","F","女","枫丹","水","单手剑","10/13","4.2",5),
    C("夏洛蒂","X","女","枫丹","冰","法器","4/10","4.2",4),
    C("娜维娅","N","女","枫丹","岩","双手剑","8/16","4.3",5),
    C("夏沃蕾","X","女","枫丹","火","长柄武器","1/10","4.3",4),
    C("克洛琳德","K","女","枫丹","雷","单手剑","9/20","4.7",5),
    C("希格雯","X","女","枫丹","水","弓","3/30","4.7",5),
    C("艾梅莉埃","A","女","枫丹","草","长柄武器","9/22","4.8",5),
    C("爱可菲","A","女","枫丹","冰","长柄武器","6/8","5.6",5),
    # 纳塔
    C("玛拉妮","M","女","纳塔","水","法器","8/3","5.0",5),
    C("基尼奇","J","男","纳塔","草","双手剑","11/11","5.0",5),
    C("卡齐娜","K","女","纳塔","岩","长柄武器","4/22","5.0",4),
    C("希诺宁","X","女","纳塔","岩","单手剑","3/13","5.1",5),
    C("恰斯卡","Q","女","纳塔","风","弓","12/10","5.2",5),
    C("欧洛伦","O","男","纳塔","雷","弓","10/14","5.2",4),
    C("玛薇卡","M","女","纳塔","火","双手剑","8/28","5.3",5),
    C("茜特菈莉","X","女","纳塔","冰","法器","1/20","5.3",5),
    C("伊安珊","Y","女","纳塔","雷","长柄武器","8/8","5.5",4),
    C("瓦雷莎","W","女","纳塔","雷","法器","11/15","5.5",5),
    C("伊法","Y","男","纳塔","风","法器","3/23","5.6",4),
    # 挪德卡莱
    C("莉奈娅","L","女","挪德卡莱","岩","弓","5/23","6.5",5),
    C("叶洛亚","Y","男","挪德卡莱","岩","长柄武器","12/23","6.3",4),
    C("哥伦比娅","G","女","挪德卡莱","水","法器","1/14","6.3",5),
    C("雅珂达","Y","女","挪德卡莱","风","弓","1/5","6.2",4),
    C("奈芙尔","N","女","挪德卡莱","草","法器","5/9","6.1",5),
    C("菲林斯","F","男","挪德卡莱","雷","长柄武器","10/31","6.0",5),
    C("菈乌玛","L","女","挪德卡莱","草","法器","3/1","6.0",5),
    C("爱诺","A","女","挪德卡莱","水","双手剑","9/21","6.0",4),
    C("伊涅芙","Y","女","挪德卡莱","雷","长柄武器","4/2","5.8",5),
    # 至冬
    C("达达利亚","D","男","至冬","水","弓","7/20","1.1",5),
    C("阿蕾奇诺","A","女","至冬","火","长柄武器","8/22","4.6",5),
    C("薇斯纳","W","女","至冬","风","单手剑","2/4","7.1",5),
    C("沃雅妮莎","W","女","至冬","水","法器","3/29","7.1",5),
    C("奥黛塔","A","女","至冬","冰","单手剑","2/20","7.0",5),
    C("阿罗夏","A","男","至冬","雷","长柄武器","2/9","7.0",4),
    C("桑多涅","S","女","至冬","冰","双手剑","1/13","6.7",5),
    C("米提亚","M","男","至冬","雷","法器","91/78","7.2",5),
    C("瓦列里","W","男","至冬","雷","单手剑","91/78","7.2",4),
    C("安娜丝塔夏","A","女","至冬","冰","弓","91/78","7.3",5),
    C("达妮卡","D","女","至冬","雷","双手剑","91/78","7.3",5),
    # 其他
    C("尼可","N","女","其他","火","法器","9/29","6.6",5),
    C("丝柯克","S","女","其他","冰","单手剑","11/5","5.7",5),
]

REGION_ORDER = ["蒙德","璃月","稻妻","须弥","枫丹","纳塔","挪德卡莱","至冬"]
DAYS_IN_MONTH = [31,28,31,30,31,30,31,31,30,31,30,31]
CHAR_COUNT = len(CHARACTERS)
MAX_GUESSES_LIMIT = CHAR_COUNT
ALL_COLS = ['gender', 'region', 'element', 'weapon', 'birthday', 'version', 'rarity']
COL_LABELS = {
    'gender': '性别', 'region': '地区', 'element': '元素', 'weapon': '武器',
    'birthday': '生日', 'version': '版本', 'rarity': '星级',
}
HINT_FIELDS = [
    ('element', '元素'), ('region', '地区'), ('weapon', '武器'),
    ('gender', '性别'), ('birthday', '生日'), ('version', '版本'), ('rarity', '星级'),
]
POOLS = ["全部", "蒙德", "璃月", "稻妻", "须弥", "枫丹", "纳塔", "挪德卡莱", "至冬", "其他"]

EMOTES = {
    "gg":     {"icon": "✋", "text": "GG！"},
    "wow":    {"icon": "✨", "text": "太强了！"},
    "cry":    {"icon": "💧", "text": "就差一点…"},
    "paimon": {"icon": "🍗", "text": "派蒙饿了！"},
    "again":  {"icon": "🔁", "text": "再来一局！"},
    "lucky":  {"icon": "🌟", "text": "十连出金！"},
    "think":  {"icon": "🤔", "text": "让我想想…"},
    "clap":   {"icon": "👏", "text": "漂亮！"},
}

# 地脉异变：每小局随机出现，改变这一局的规则
MODIFIERS = [
    {"id": "none", "name": "风平浪静", "element": None, "weight": 2,
     "desc": "地脉平稳，本局没有额外变化。"},
    {"id": "geo_shield", "name": "岩之庇护", "element": "岩", "weight": 2,
     "guess_delta": 1,
     "desc": "本局所有玩家额外获得 1 次猜测机会。"},
    {"id": "electro_rush", "name": "雷光疾驰", "element": "雷", "weight": 2,
     "guess_delta": -1, "flat_bonus": 30,
     "desc": "本局猜测次数 -1，但猜中额外 +30 分。"},
    {"id": "cryo_grace", "name": "冰霜恩泽", "element": "冰", "weight": 2,
     "remain_extra": 12,
     "desc": "本局剩余次数每点额外 +12 分。"},
    {"id": "pyro_trial", "name": "火之试炼", "element": "火", "weight": 1,
     "score_mult": 1.25,
     "desc": "本局猜中得分 ×1.25。"},
    {"id": "hydro_echo", "name": "水之回响", "element": "水", "weight": 1,
     "flat_bonus": 15, "free_hint": True,
     "desc": "本局猜中额外 +15 分，且元素视野不扣分。"},
    {"id": "dendro_bloom", "name": "草叶新生", "element": "草", "weight": 1,
     "hint_refund": True,
     "desc": "本局首次使用元素视野会返还 1 点星辉。"},
    {"id": "anemo_blessing", "name": "风行祝福", "element": "风", "weight": 1,
     "remain_extra": 8, "flat_bonus": 10,
     "desc": "本局剩余次数奖励 +8，猜中额外 +10。"},
]


def choose_modifier():
    weights = [m.get("weight", 1) for m in MODIFIERS]
    return random.choices(MODIFIERS, weights=weights, k=1)[0].copy()


def pool_characters(pool):
    if pool == "全部" or pool not in POOLS:
        return CHARACTERS
    return [c for c in CHARACTERS if c["region"] == pool]


# ============================================================
# 玩家数据持久化
# ============================================================
players_data = {}   # {name: {"rating", "games", "wins", ...}}
data_lock = threading.RLock()


def default_player_data():
    return {
        "rating": STARTING_RATING,
        "games": 0,
        "wins": 0,
        "best_streak": 0,
        "perfects": 0,
        "hints_used": 0,
    }


def load_players_data():
    global players_data
    with data_lock:
        try:
            if os.path.exists(PLAYERS_FILE):
                with open(PLAYERS_FILE, 'r', encoding='utf-8') as f:
                    raw = json.load(f)
                cleaned = {}
                if isinstance(raw, dict):
                    for name, value in raw.items():
                        if not isinstance(name, str) or not isinstance(value, dict):
                            continue
                        p = default_player_data()
                        p.update(value)
                        cleaned[name] = p
                players_data = cleaned
            else:
                players_data = {}
        except Exception as e:
            print(f"[warn] 加载玩家数据失败: {e}")
            players_data = {}


def save_players_data():
    with data_lock:
        try:
            tmp = PLAYERS_FILE + ".tmp"
            with open(tmp, 'w', encoding='utf-8') as f:
                json.dump(players_data, f, ensure_ascii=False, indent=2)
            os.replace(tmp, PLAYERS_FILE)
        except Exception as e:
            print(f"[error] 保存玩家数据失败: {e}")


def get_player_rating(name):
    with data_lock:
        p = players_data.get(name)
        if p:
            return int(p.get('rating', STARTING_RATING))
        return STARTING_RATING


def ensure_player(name):
    with data_lock:
        if name not in players_data:
            players_data[name] = default_player_data()
        else:
            for k, v in default_player_data().items():
                players_data[name].setdefault(k, v)
        return players_data[name]


def apply_rating_change(name, delta):
    """应用 rating 变化，返回 (old_rating, new_rating)"""
    with data_lock:
        p = ensure_player(name)
        old = int(p['rating'])
        new = max(MIN_RATING, old + int(delta))
        p['rating'] = new
        p['games'] = int(p.get('games', 0)) + 1
        return old, new


def record_match_stats(name, wins, best_streak, perfects, hints_used):
    with data_lock:
        p = ensure_player(name)
        p['wins'] = int(p.get('wins', 0)) + int(wins)
        p['best_streak'] = max(int(p.get('best_streak', 0)), int(best_streak))
        p['perfects'] = int(p.get('perfects', 0)) + int(perfects)
        p['hints_used'] = int(p.get('hints_used', 0)) + int(hints_used)


def title_for(rating, wins=0):
    if rating >= 1900:
        return "爱上雷神isolation"
    if rating >= 1750:
        return "深渊满星旅人"
    if rating >= 1600:
        return "元素共鸣者"
    if rating >= 1450 or wins >= 10:
        return "风之翼冒险家"
    if wins >= 3:
        return "初露锋芒"
    return "初来乍到的旅行者"


def get_leaderboard_list(limit=50):
    with data_lock:
        lst = []
        for name, data in players_data.items():
            rating = int(data.get('rating', STARTING_RATING))
            games = int(data.get('games', 0))
            wins = int(data.get('wins', 0))
            lst.append({
                'name': name,
                'rating': rating,
                'games': games,
                'wins': wins,
                'bestStreak': int(data.get('best_streak', 0)),
                'perfects': int(data.get('perfects', 0)),
                'hintsUsed': int(data.get('hints_used', 0)),
                'title': title_for(rating, wins),
            })
        lst.sort(key=lambda x: (-x['rating'], -x['wins'], x['name']))
        return lst[:limit]


# ============================================================
# Rating 计算（ELO 变体，Codeforces 风格）
# ============================================================
def calculate_rating_deltas(players_in_match):
    """
    players_in_match: [{name, rating, wins, total_score}]
    返回: {name: delta}

    排名规则：wins 降序，total_score 降序。
    每个玩家与其他所有人做 ELO 配对计算，胜率差 = actual - expected。
    """
    n = len(players_in_match)
    if n < 2:
        return {p['name']: 0 for p in players_in_match}

    ranked = sorted(players_in_match,
                    key=lambda x: (-x['wins'], -x['total_score']))
    rank_map = {p['name']: i for i, p in enumerate(ranked)}

    deltas = {}
    for p1 in players_in_match:
        name1 = p1['name']
        r1 = p1['rating']
        delta_sum = 0.0
        for p2 in players_in_match:
            if p2['name'] == name1:
                continue
            r2 = p2['rating']
            expected = 1.0 / (1.0 + 10.0 ** ((r2 - r1) / 400.0))

            rank1 = rank_map[name1]
            rank2 = rank_map[p2['name']]
            if rank1 < rank2:
                actual = 1.0
            elif rank1 > rank2:
                actual = 0.0
            else:
                actual = 0.5

            delta_sum += (actual - expected)

        delta_sum /= (n - 1)
        deltas[name1] = K_FACTOR * delta_sum

    return {name: round(d) for name, d in deltas.items()}


# ============================================================
# 判定逻辑
# ============================================================
def region_status(g, t):
    if g == t:
        return "correct"
    if g == "其他" or t == "其他":
        return "wrong"
    try:
        gi = REGION_ORDER.index(g)
        ti = REGION_ORDER.index(t)
    except ValueError:
        return "wrong"
    return "similar" if abs(gi - ti) == 1 else "wrong"


def day_of_year(s):
    m, d = map(int, s.split("/"))
    return sum(DAYS_IN_MONTH[:m - 1]) + d


def bday_diff(a, b):
    da, db = day_of_year(a), day_of_year(b)
    diff = abs(da - db)
    return min(diff, 365 - diff)


def bday_arrow(g, t):
    dg, dt = day_of_year(g), day_of_year(t)
    raw = dt - dg
    if raw > 182:
        raw -= 365
    if raw < -182:
        raw += 365
    return " ↑" if raw > 0 else " ↓"


def birthday_cell(g, t):
    if g == "/" or t == "/":
        return {"text": g, "status": "wrong"}
    if g == t:
        return {"text": g, "status": "correct"}
    status = "similar" if bday_diff(g, t) <= 30 else "wrong"
    return {"text": g + bday_arrow(g, t), "status": status}


def ver_num(s):
    if s == "/":
        return -1
    maj, minor = map(int, s.split("."))
    return maj * 100 + minor


def ver_major(s):
    if s == "/":
        return -1
    return int(s.split(".")[0])


def version_cell(g, t):
    if g == "/" or t == "/":
        return {"text": g, "status": "wrong"}
    if g == t:
        return {"text": g, "status": "correct"}
    status = "similar" if abs(ver_major(g) - ver_major(t)) <= 1 else "wrong"
    arrow = " ↑" if ver_num(t) > ver_num(g) else " ↓"
    return {"text": g + arrow, "status": status}


def judge(guess, target, enabled_cols=None):
    if enabled_cols is None:
        enabled_cols = ALL_COLS
    result = [{"key": "name", "text": guess["name"],
               "status": "correct" if guess["name"] == target["name"] else "wrong"}]
    for col in enabled_cols:
        if col == 'gender':
            result.append({"key": "gender", "text": guess["gender"],
                           "status": "correct" if guess["gender"] == target["gender"] else "wrong"})
        elif col == 'region':
            result.append({"key": "region", "text": guess["region"],
                           "status": region_status(guess["region"], target["region"])})
        elif col == 'element':
            result.append({"key": "element", "text": guess["element"],
                           "status": "correct" if guess["element"] == target["element"] else "wrong"})
        elif col == 'weapon':
            result.append({"key": "weapon", "text": guess["weapon"],
                           "status": "correct" if guess["weapon"] == target["weapon"] else "wrong"})
        elif col == 'birthday':
            cell = birthday_cell(guess["birthday"], target["birthday"])
            result.append({"key": "birthday", "text": cell["text"], "status": cell["status"]})
        elif col == 'version':
            cell = version_cell(guess["version"], target["version"])
            result.append({"key": "version", "text": cell["text"], "status": cell["status"]})
        elif col == 'rarity':
            result.append({"key": "rarity", "text": str(guess["rarity"]) + "星",
                           "status": "correct" if guess["rarity"] == target["rarity"] else "wrong"})
    return result


# ============================================================
# 全局状态
# ============================================================
rooms = {}
rooms_lock = threading.RLock()


def gen_code():
    with rooms_lock:
        while True:
            code = str(random.randint(100000, 999999))
            if code not in rooms:
                return code


# ============================================================
# WebSocket 帧工具
# ============================================================
def recv_exact(sock, n):
    if n <= 0:
        return b''
    buf = b''
    while len(buf) < n:
        try:
            chunk = sock.recv(n - len(buf))
        except OSError:
            return b''
        if not chunk:
            return b''
        buf += chunk
    return buf


def ws_recv_frame(sock):
    header = recv_exact(sock, 2)
    if len(header) < 2:
        return None
    b1, b2 = header[0], header[1]
    opcode = b1 & 0x0F
    masked = (b2 & 0x80) != 0
    length = b2 & 0x7F
    if length == 126:
        lb = recv_exact(sock, 2)
        if len(lb) < 2:
            return None
        length = struct.unpack('!H', lb)[0]
    elif length == 127:
        lb = recv_exact(sock, 8)
        if len(lb) < 8:
            return None
        length = struct.unpack('!Q', lb)[0]
    mask_key = b''
    if masked:
        mask_key = recv_exact(sock, 4)
        if len(mask_key) < 4:
            return None
    payload = recv_exact(sock, length) if length > 0 else b''
    if length > 0 and len(payload) < length:
        return None
    if masked:
        payload = bytes(b ^ mask_key[i % 4] for i, b in enumerate(payload))
    return opcode, payload


def ws_send_json(sock, obj):
    data = json.dumps(obj, ensure_ascii=False).encode('utf-8')
    length = len(data)
    if length < 126:
        header = struct.pack('!BB', 0x81, length)
    elif length < 65536:
        header = struct.pack('!BBH', 0x81, 126, length)
    else:
        header = struct.pack('!BBQ', 0x81, 127, length)
    try:
        sock.sendall(header + data)
    except Exception:
        pass


def ws_send_pong(sock, data):
    length = len(data)
    if length < 126:
        header = struct.pack('!BB', 0x8A, length)
    elif length < 65536:
        header = struct.pack('!BBH', 0x8A, 126, length)
    else:
        header = struct.pack('!BBQ', 0x8A, 127, length)
    try:
        sock.sendall(header + data)
    except Exception:
        pass


# ============================================================
# 客户端/房间逻辑
# ============================================================
class Client:
    def __init__(self, cid, sock):
        self.id = cid
        self.sock = sock
        self.room_code = None
        self.last_emote_at = 0.0


def send(client, obj):
    ws_send_json(client.sock, obj)


def broadcast(room, obj):
    with rooms_lock:
        for p in room['players'].values():
            ws_send_json(p['sock'], obj)


def public_player(p):
    return {
        'id': p['id'],
        'name': p['name'],
        'guessesCount': len(p['guesses']),
        'done': p['done'],
        'winOrder': p['win_order'],
        'roundScore': p['round_score'],
        'totalScore': p['total_score'],
        'guessedNames': [g['name'] for g in p['guesses']],
        'wins': p['wins'],
        'rating': p['rating'],
        'hintsLeft': p['hints_left'],
        'roundHints': p['round_hints'],
        'streak': p['streak'],
        'bestStreak': p['best_streak'],
        'perfects': p['perfects'],
        'roundBreakdown': p.get('round_breakdown'),
    }


def broadcast_room(room):
    with rooms_lock:
        if room['code'] not in rooms:
            return
        for p in room['players'].values():
            ws_send_json(p['sock'], {
                'type': 'room_update',
                'code': room['code'],
                'hostId': room['host'],
                'maxGuesses': room['max_guesses'],
                'maxGuessesLimit': MAX_GUESSES_LIMIT,
                'matchRounds': room['match_rounds'],
                'currentMatchRound': room['current_match_round'],
                'state': room['state'],
                'enabledCols': room['enabled_cols'],
                'players': [public_player(x) for x in room['players'].values()],
                'you': p['id'],
                'hintsEnabled': room['hints_enabled'],
                'hintsPerMatch': room['hints_per_match'],
                'hintCost': HINT_SCORE_COST,
                'timeLimit': room['time_limit'],
                'roundDeadline': room['round_deadline'],
                'doubleFinal': room['double_final'],
                'pool': room['pool'],
                'poolSize': len(pool_characters(room['pool'])),
                'roundMaxGuesses': room.get('round_max_guesses', room['max_guesses']),
                'modifier': room.get('modifier'),
                'maxPlayers': MAX_PLAYERS,
                'serverTime': time.time(),
                'version': SERVER_VERSION,
            })


def make_player_state(cid, name, sock, hints_per_match):
    return {
        'id': cid, 'name': name, 'sock': sock,
        'guesses': [], 'guess_cells': [],
        'done': False, 'win_order': None,
        'round_score': 0, 'total_score': 0,
        'wins': 0,
        'rating': get_player_rating(name),
        'streak': 0, 'best_streak': 0, 'perfects': 0,
        'hints_left': hints_per_match, 'round_hints': 0,
        'hint_log': [], 'hints_used_total': 0,
        'round_breakdown': None,
    }


def reset_player_for_match(p, hints_per_match):
    p['guesses'] = []
    p['guess_cells'] = []
    p['done'] = False
    p['win_order'] = None
    p['round_score'] = 0
    p['total_score'] = 0
    p['wins'] = 0
    p['streak'] = 0
    p['best_streak'] = 0
    p['perfects'] = 0
    p['hints_left'] = hints_per_match
    p['round_hints'] = 0
    p['hint_log'] = []
    p['hints_used_total'] = 0
    p['round_breakdown'] = None


def check_all_done(room):
    if room['state'] != 'playing':
        return
    players = list(room['players'].values())
    if not players:
        return
    if all(p['done'] for p in players):
        end_round(room, reason='all_done')


def cancel_room_timer(room):
    timer = room.get('timer')
    if timer is not None:
        try:
            timer.cancel()
        except Exception:
            pass
        room['timer'] = None


def _round_timeout(code, token):
    with rooms_lock:
        room = rooms.get(code)
        if not room or room.get('state') != 'playing' or room.get('round_token') != token:
            return
        for p in room['players'].values():
            if not p['done']:
                p['done'] = True
                p['round_score'] = 0
        broadcast(room, {'type': 'time_up', 'message': '地脉时限已到，本局结束！'})
        end_round(room, reason='timeout')


def start_new_small_round(room):
    """开始一个新的小局"""
    with rooms_lock:
        cancel_room_timer(room)
        room['round_token'] = room.get('round_token', 0) + 1
        token = room['round_token']

        modifier = choose_modifier()
        room['modifier'] = modifier
        base_guesses = int(room['max_guesses'])
        eff = base_guesses + int(modifier.get('guess_delta', 0))
        room['round_max_guesses'] = max(1, min(MAX_GUESSES_LIMIT, eff))

        pool = pool_characters(room['pool'])
        recent = set(room.get('recent_targets', [])[-3:])
        candidates = [c for c in pool if c['name'] not in recent] or pool
        target = random.choice(candidates)
        room['target'] = target
        room['recent_targets'] = (room.get('recent_targets', []) + [target['name']])[-8:]

        room['state'] = 'playing'
        room['win_counter'] = 0
        room['round_deadline'] = 0
        for p in room['players'].values():
            p['guesses'] = []
            p['guess_cells'] = []
            p['done'] = False
            p['win_order'] = None
            p['round_score'] = 0
            p['round_hints'] = 0
            p['hint_log'] = []
            p['round_breakdown'] = None

        if room['time_limit'] > 0:
            deadline = time.time() + room['time_limit']
            room['round_deadline'] = deadline
            timer = threading.Timer(room['time_limit'], _round_timeout, args=(room['code'], token))
            timer.daemon = True
            room['timer'] = timer
            timer.start()

        broadcast(room, {
            'type': 'game_start',
            'enabledCols': room['enabled_cols'],
            'modifier': modifier,
            'roundMaxGuesses': room['round_max_guesses'],
            'timeLimit': room['time_limit'],
            'roundDeadline': room['round_deadline'],
            'serverTime': time.time(),
            'pool': room['pool'],
            'currentMatchRound': room['current_match_round'],
            'matchRounds': room['match_rounds'],
            'doubleFinal': room['double_final'],
        })
        broadcast_room(room)


def format_hint_value(target, key):
    if key == 'rarity':
        return f"{target['rarity']}星"
    if key == 'version':
        return f"v{target['version']}"
    return str(target[key])


def calculate_round_score(p, room):
    modifier = room.get('modifier') or {}
    eff = int(room.get('round_max_guesses', room['max_guesses']))
    used = len(p['guesses'])
    remain = max(0, eff - used)

    base = 100
    remain_bonus = remain * 15
    extra_remain = remain * int(modifier.get('remain_extra', 0))
    flat_bonus = int(modifier.get('flat_bonus', 0))
    perfect_bonus = 25 if used == 1 else 0
    streak_bonus = min(30, max(0, p['streak']) * 10)

    subtotal = base + remain_bonus + extra_remain + flat_bonus + perfect_bonus + streak_bonus
    multiplier = float(modifier.get('score_mult', 1.0))
    if room.get('double_final') and room['current_match_round'] + 1 == room['match_rounds']:
        multiplier *= 2

    before_hint = int(round(subtotal * multiplier))
    penalty = 0 if modifier.get('free_hint') else p['round_hints'] * HINT_SCORE_COST
    total = max(0, before_hint - penalty)

    return {
        'base': base,
        'remainBonus': remain_bonus,
        'extraRemain': extra_remain,
        'flatBonus': flat_bonus,
        'perfectBonus': perfect_bonus,
        'streakBonus': streak_bonus,
        'multiplier': multiplier,
        'beforeHint': before_hint,
        'hintPenalty': penalty,
        'total': total,
    }


def end_round(room, reason='solved'):
    """小局结束"""
    with rooms_lock:
        if room['state'] != 'playing':
            return
        cancel_room_timer(room)
        room['state'] = 'round_ended'
        room['current_match_round'] += 1
        room['round_deadline'] = 0

        target = room['target']
        ranking = []
        for p in room['players'].values():
            p['total_score'] += p['round_score']
            is_winner = (p['win_order'] == 1)
            if is_winner:
                p['wins'] += 1
                p['streak'] += 1
                p['best_streak'] = max(p['best_streak'], p['streak'])
                if len(p['guesses']) == 1:
                    p['perfects'] += 1
            else:
                p['streak'] = 0

            ranking.append({
                'name': p['name'],
                'guesses': len(p['guesses']),
                'winOrder': p['win_order'],
                'roundScore': p['round_score'],
                'guessLog': p['guess_cells'],
                'wins': p['wins'],
                'totalScore': p['total_score'],
                'rating': p['rating'],
                'streak': p['streak'],
                'hintsUsed': p['round_hints'],
                'breakdown': p.get('round_breakdown'),
                'perfect': is_winner and len(p['guesses']) == 1,
            })

        ranking.sort(key=lambda x: (
            x['winOrder'] if x['winOrder'] is not None else 10 ** 9,
            x['guesses'],
        ))

        room['history'].append({
            'round': room['current_match_round'],
            'target': target['name'],
            'element': target['element'],
            'winner': next((p['name'] for p in room['players'].values() if p['win_order'] == 1), None),
            'reason': reason,
        })
        room['history'] = room['history'][-MAX_MATCH_ROUNDS:]

        broadcast(room, {
            'type': 'game_end',
            'target': target,
            'ranking': ranking,
            'enabledCols': room['enabled_cols'],
            'currentMatchRound': room['current_match_round'],
            'matchRounds': room['match_rounds'],
            'reason': reason,
            'modifier': room.get('modifier'),
            'doubleFinal': room['double_final'],
            'serverTime': time.time(),
        })
        broadcast_room(room)


def end_match(room):
    """大场结束：计算 rating 与战绩"""
    with rooms_lock:
        if room['state'] != 'round_ended':
            return

        players_in_match = []
        for p in room['players'].values():
            players_in_match.append({
                'name': p['name'],
                'rating': p['rating'],
                'wins': p['wins'],
                'total_score': p['total_score'],
            })

        deltas = calculate_rating_deltas(players_in_match)

        rating_results = []
        for p in room['players'].values():
            delta = deltas.get(p['name'], 0)
            old, new = apply_rating_change(p['name'], delta)
            p['rating'] = new
            record_match_stats(p['name'], p['wins'], p['best_streak'],
                               p['perfects'], p['hints_used_total'])
            rating_results.append({
                'name': p['name'],
                'oldRating': old,
                'newRating': new,
                'delta': new - old,
            })
        save_players_data()

        rating_map = {r['name']: r for r in rating_results}
        final_ranking = []
        for p in room['players'].values():
            rr = rating_map.get(p['name'], {})
            final_ranking.append({
                'name': p['name'],
                'wins': p['wins'],
                'totalScore': p['total_score'],
                'bestStreak': p['best_streak'],
                'perfects': p['perfects'],
                'hintsUsed': p['hints_used_total'],
                'oldRating': rr.get('oldRating', p['rating']),
                'newRating': rr.get('newRating', p['rating']),
                'delta': rr.get('delta', 0),
            })
        final_ranking.sort(key=lambda x: (-x['wins'], -x['totalScore']))

        room['state'] = 'match_ended'
        room['round_deadline'] = 0

        broadcast(room, {
            'type': 'match_end',
            'finalRanking': final_ranking,
            'matchRounds': room['match_rounds'],
            'history': room['history'],
            'mvp': final_ranking[0]['name'] if final_ranking else None,
        })
        broadcast_room(room)
        broadcast_leaderboard()


def broadcast_leaderboard():
    """广播排行榜给所有连接的客户端"""
    lb = get_leaderboard_list()
    msg = {'type': 'leaderboard', 'list': lb}
    with rooms_lock:
        for room in rooms.values():
            for p in room['players'].values():
                ws_send_json(p['sock'], msg)


# ============================================================
# 房间操作
# ============================================================
def handle_create(client, name, max_guesses):
    if client.room_code:
        return
    name = name.strip()[:8]
    if not name:
        send(client, {'type': 'error', 'message': '请输入昵称'})
        return
    try:
        max_guesses = int(max_guesses or 8)
    except Exception:
        max_guesses = 8
    max_guesses = max(1, min(MAX_GUESSES_LIMIT, max_guesses))
    code = gen_code()
    with rooms_lock:
        room = {
            'code': code,
            'host': client.id,
            'max_guesses': max_guesses,
            'match_rounds': 3,
            'current_match_round': 0,
            'target': None,
            'state': 'waiting',
            'win_counter': 0,
            'enabled_cols': list(ALL_COLS),
            'players': {},
            'hints_enabled': True,
            'hints_per_match': 2,
            'time_limit': 0,
            'double_final': False,
            'pool': '全部',
            'modifier': None,
            'round_max_guesses': max_guesses,
            'round_deadline': 0,
            'round_token': 0,
            'timer': None,
            'history': [],
            'recent_targets': [],
        }
        room['players'][client.id] = make_player_state(
            client.id, name, client.sock, room['hints_per_match'])
        rooms[code] = room
        client.room_code = code
    broadcast_room(room)


def handle_join(client, name, code):
    if client.room_code:
        return
    name = name.strip()[:8]
    if not name:
        send(client, {'type': 'error', 'message': '请输入昵称'})
        return
    with rooms_lock:
        room = rooms.get(code)
        if not room:
            send(client, {'type': 'error', 'message': '房间不存在或已解散'})
            return
        if room['state'] != 'waiting':
            send(client, {'type': 'error', 'message': '对局已开始，无法加入'})
            return
        if len(room['players']) >= MAX_PLAYERS:
            send(client, {'type': 'error', 'message': f'房间已满（最多 {MAX_PLAYERS} 人）'})
            return
        if any(p['name'] == name for p in room['players'].values()):
            send(client, {'type': 'error', 'message': '这个昵称已被房间里的旅行者使用'})
            return
        room['players'][client.id] = make_player_state(
            client.id, name, client.sock, room['hints_per_match'])
        client.room_code = code
    broadcast_room(room)


def update_room_settings(client, changes):
    with rooms_lock:
        room = rooms.get(client.room_code)
        if not room or room['host'] != client.id:
            return
        if room['state'] != 'waiting':
            return

        if 'maxGuesses' in changes:
            try:
                n = int(changes['maxGuesses'])
            except Exception:
                n = None
            if n is not None:
                room['max_guesses'] = max(1, min(MAX_GUESSES_LIMIT, n))
                room['round_max_guesses'] = room['max_guesses']

        if 'matchRounds' in changes:
            try:
                n = int(changes['matchRounds'])
            except Exception:
                n = None
            if n is not None:
                room['match_rounds'] = max(1, min(MAX_MATCH_ROUNDS, n))

        if 'cols' in changes:
            try:
                cols_set = set(changes['cols'] or [])
            except Exception:
                cols_set = set(room['enabled_cols'])
            room['enabled_cols'] = [c for c in ALL_COLS if c in cols_set]

        if 'hintsEnabled' in changes:
            room['hints_enabled'] = bool(changes['hintsEnabled'])

        if 'hintsPerMatch' in changes:
            try:
                n = int(changes['hintsPerMatch'])
            except Exception:
                n = None
            if n is not None:
                room['hints_per_match'] = max(0, min(MAX_HINTS_PER_MATCH, n))
                for p in room['players'].values():
                    p['hints_left'] = room['hints_per_match']

        if 'timeLimit' in changes:
            try:
                n = int(changes['timeLimit'])
            except Exception:
                n = None
            if n is not None:
                room['time_limit'] = max(0, min(MAX_TIME_LIMIT, n))

        if 'doubleFinal' in changes:
            room['double_final'] = bool(changes['doubleFinal'])

        if 'pool' in changes and changes['pool'] in POOLS:
            room['pool'] = changes['pool']

        broadcast_room(room)


def handle_set_cols(client, cols):
    update_room_settings(client, {'cols': cols})


def handle_set_max_guesses(client, n):
    update_room_settings(client, {'maxGuesses': n})


def handle_set_match_rounds(client, n):
    update_room_settings(client, {'matchRounds': n})


def handle_set_options(client, msg):
    changes = {}
    if 'maxGuesses' in msg:
        changes['maxGuesses'] = msg.get('maxGuesses')
    if 'matchRounds' in msg:
        changes['matchRounds'] = msg.get('matchRounds')
    if 'cols' in msg:
        changes['cols'] = msg.get('cols')
    if 'hintsEnabled' in msg:
        changes['hintsEnabled'] = msg.get('hintsEnabled')
    if 'hintsPerMatch' in msg:
        changes['hintsPerMatch'] = msg.get('hintsPerMatch')
    if 'timeLimit' in msg:
        changes['timeLimit'] = msg.get('timeLimit')
    if 'doubleFinal' in msg:
        changes['doubleFinal'] = msg.get('doubleFinal')
    if 'pool' in msg:
        changes['pool'] = msg.get('pool')
    update_room_settings(client, changes)


def reset_match(room):
    room['current_match_round'] = 0
    room['history'] = []
    room['win_counter'] = 0
    cancel_room_timer(room)
    room['round_deadline'] = 0
    for p in room['players'].values():
        reset_player_for_match(p, room['hints_per_match'])


def handle_start(client):
    with rooms_lock:
        room = rooms.get(client.room_code)
        if not room or room['host'] != client.id:
            return

        room['max_guesses'] = max(1, min(MAX_GUESSES_LIMIT, room['max_guesses']))
        room['match_rounds'] = max(1, min(MAX_MATCH_ROUNDS, room['match_rounds']))

        if room['state'] == 'waiting':
            reset_match(room)
            start_new_small_round(room)
        elif room['state'] == 'round_ended':
            if room['current_match_round'] < room['match_rounds']:
                start_new_small_round(room)
            else:
                end_match(room)
        elif room['state'] == 'match_ended':
            room['state'] = 'waiting'
            reset_match(room)
            room['state'] = 'waiting'
            broadcast_room(room)


def handle_rematch(client):
    with rooms_lock:
        room = rooms.get(client.room_code)
        if not room or room['host'] != client.id:
            return
        if room['state'] != 'match_ended':
            return
        reset_match(room)
        start_new_small_round(room)


def handle_guess(client, name):
    with rooms_lock:
        room = rooms.get(client.room_code)
        if not room or room['state'] != 'playing':
            return
        p = room['players'].get(client.id)
        if not p or p['done']:
            return
        if any(g['name'] == name for g in p['guesses']):
            return
        guess = next((c for c in CHARACTERS if c['name'] == name), None)
        if not guess:
            return

        p['guesses'].append(guess)
        cells = judge(guess, room['target'], room['enabled_cols'])
        p['guess_cells'].append({'name': name, 'cells': cells})
        correct = guess['name'] == room['target']['name']

        result_payload = {
            'type': 'guess_result',
            'cells': cells,
            'correct': correct,
            'guessCount': len(p['guesses']),
            'roundMaxGuesses': room.get('round_max_guesses', room['max_guesses']),
        }

        if correct:
            p['done'] = True
            room['win_counter'] += 1
            p['win_order'] = room['win_counter']
            breakdown = calculate_round_score(p, room)
            p['round_breakdown'] = breakdown
            p['round_score'] = breakdown['total']
            result_payload['roundScore'] = p['round_score']
            result_payload['breakdown'] = breakdown
            ws_send_json(p['sock'], result_payload)
            broadcast_room(room)
            end_round(room, reason='solved')
            return

        if len(p['guesses']) >= int(room.get('round_max_guesses', room['max_guesses'])):
            p['done'] = True
            p['round_score'] = 0
            p['round_breakdown'] = None

        ws_send_json(p['sock'], result_payload)
        broadcast_room(room)
        check_all_done(room)


def handle_hint(client):
    with rooms_lock:
        room = rooms.get(client.room_code)
        if not room or room['state'] != 'playing':
            return
        if not room['hints_enabled']:
            send(client, {'type': 'error', 'message': '本房间已关闭元素视野'})
            return
        p = room['players'].get(client.id)
        if not p or p['done']:
            return
        if p['hints_left'] <= 0:
            send(client, {'type': 'error', 'message': '星辉已耗尽，无法再使用元素视野'})
            return

        revealed = set(p['hint_log'])
        fields = [f for f in HINT_FIELDS if f[0] not in revealed]
        if not fields:
            send(client, {'type': 'error', 'message': '答案的所有属性都已经被揭示了'})
            return
        key, label = random.choice(fields)
        value = format_hint_value(room['target'], key)

        p['hints_left'] -= 1
        p['round_hints'] += 1
        p['hints_used_total'] += 1
        p['hint_log'].append(key)

        modifier = room.get('modifier') or {}
        refunded = False
        if modifier.get('hint_refund') and p['round_hints'] == 1:
            p['hints_left'] += 1
            refunded = True

        send(client, {
            'type': 'hint_result',
            'key': key,
            'label': label,
            'value': value,
            'hintsLeft': p['hints_left'],
            'roundHints': p['round_hints'],
            'cost': 0 if modifier.get('free_hint') else HINT_SCORE_COST,
            'freeHint': bool(modifier.get('free_hint')),
            'refunded': refunded,
        })
        broadcast_room(room)


def handle_emote(client, emote_id):
    with rooms_lock:
        room = rooms.get(client.room_code)
        if not room:
            return
        p = room['players'].get(client.id)
        if not p:
            return
        now = time.time()
        if now - client.last_emote_at < 1.0:
            return
        client.last_emote_at = now
        emote = EMOTES.get(emote_id)
        if not emote:
            return
        broadcast(room, {
            'type': 'emote',
            'playerId': client.id,
            'name': p['name'],
            'emoteId': emote_id,
            'icon': emote['icon'],
            'text': emote['text'],
        })


def remove_client_from_room(client):
    """把客户端从房间移除；返回被影响的房间 code。"""
    with rooms_lock:
        code = client.room_code
        if not code:
            return None
        room = rooms.get(code)
        client.room_code = None
        if not room:
            return code
        room['players'].pop(client.id, None)
        if not room['players']:
            cancel_room_timer(room)
            rooms.pop(code, None)
            return code
        if room['host'] == client.id:
            room['host'] = next(iter(room['players']))
        broadcast_room(room)
        check_all_done(room)
        return code


def handle_leave(client):
    code = remove_client_from_room(client)
    if code:
        send(client, {'type': 'left'})
        broadcast_leaderboard()


def handle_get_leaderboard(client):
    send(client, {'type': 'leaderboard', 'list': get_leaderboard_list()})


def handle_admin(client, msg):
    pwd = msg.get('password', '')
    if pwd != ADMIN_PASSWORD:
        send(client, {'type': 'admin_result', 'success': False, 'message': '密码错误'})
        return

    action = msg.get('action')

    if action == 'list':
        send(client, {
            'type': 'admin_result',
            'success': True,
            'players': get_leaderboard_list(1000),
        })
    elif action == 'delete':
        name = msg.get('name', '')
        with rooms_lock:
            if name in players_data:
                del players_data[name]
                save_players_data()
                send(client, {'type': 'admin_result', 'success': True,
                              'message': f'已删除玩家 {name}',
                              'players': get_leaderboard_list(1000)})
                broadcast_leaderboard()
            else:
                send(client, {'type': 'admin_result', 'success': False,
                              'message': f'玩家 {name} 不存在'})


def cleanup_client(client):
    remove_client_from_room(client)


def handle_message(client, msg):
    t = msg.get('type')
    if t == 'create':
        handle_create(client, msg.get('name', ''), msg.get('maxGuesses', 8))
    elif t == 'join':
        handle_join(client, msg.get('name', ''), str(msg.get('roomCode', '')).strip())
    elif t == 'set_cols':
        handle_set_cols(client, msg.get('cols', []))
    elif t == 'set_max_guesses':
        handle_set_max_guesses(client, msg.get('n', 8))
    elif t == 'set_match_rounds':
        handle_set_match_rounds(client, msg.get('n', 3))
    elif t == 'set_options':
        handle_set_options(client, msg)
    elif t == 'start':
        handle_start(client)
    elif t == 'rematch':
        handle_rematch(client)
    elif t == 'guess':
        handle_guess(client, msg.get('name', ''))
    elif t == 'hint':
        handle_hint(client)
    elif t == 'emote':
        handle_emote(client, msg.get('id', ''))
    elif t == 'leave':
        handle_leave(client)
    elif t == 'get_leaderboard':
        handle_get_leaderboard(client)
    elif t == 'admin':
        handle_admin(client, msg)
    elif t == 'ping':
        send(client, {'type': 'pong', 'serverTime': time.time()})


# ============================================================
# HTTP + WebSocket 处理器
# ============================================================
WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, fmt, *args):
        pass

    def do_GET(self):
        path = self.path.split('?', 1)[0]
        if path == '/ws':
            self.handle_ws()
            return
        if path in ('/', '/index.html'):
            file_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'index.html')
            try:
                with open(file_path, 'rb') as f:
                    content = f.read()
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Content-Length', str(len(content)))
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                self.wfile.write(content)
            except FileNotFoundError:
                self.send_response(404)
                self.end_headers()
                self.wfile.write(b'index.html not found')
            return
        if path == '/api/health':
            body = json.dumps({
                'ok': True,
                'version': SERVER_VERSION,
                'characters': CHAR_COUNT,
                'rooms': len(rooms),
                'players': len(players_data),
                'time': time.time(),
            }, ensure_ascii=False).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(body)
            return
        if path == '/favicon.ico':
            self.send_response(204)
            self.end_headers()
            return
        self.send_response(404)
        self.end_headers()

    def handle_ws(self):
        key = self.headers.get('Sec-WebSocket-Key', '')
        if not key:
            self.send_response(400)
            self.end_headers()
            return
        accept = base64.b64encode(
            hashlib.sha1((key + WS_GUID).encode()).digest()
        ).decode()
        self.send_response(101, 'Switching Protocols')
        self.send_header('Upgrade', 'websocket')
        self.send_header('Connection', 'Upgrade')
        self.send_header('Sec-WebSocket-Accept', accept)
        self.end_headers()
        try:
            self.wfile.flush()
        except Exception:
            pass

        self.close_connection = True
        sock = self.connection
        client_id = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
        client = Client(client_id, sock)

        ws_send_json(sock, {
            'type': 'characters',
            'list': CHARACTERS,
            'total': CHAR_COUNT,
            'version': SERVER_VERSION,
            'columns': ALL_COLS,
            'columnLabels': COL_LABELS,
        })
        ws_send_json(sock, {'type': 'leaderboard', 'list': get_leaderboard_list()})
        ws_send_json(sock, {
            'type': 'welcome',
            'version': SERVER_VERSION,
            'emotes': EMOTES,
            'pools': POOLS,
            'columns': ALL_COLS,
            'hintCost': HINT_SCORE_COST,
            'maxPlayers': MAX_PLAYERS,
            'serverTime': time.time(),
        })

        try:
            while True:
                frame = ws_recv_frame(sock)
                if frame is None:
                    break
                opcode, data = frame
                if opcode == 0x8:
                    break
                elif opcode == 0x9:
                    ws_send_pong(sock, data)
                elif opcode == 0x1:
                    try:
                        msg = json.loads(data.decode('utf-8'))
                    except Exception:
                        continue
                    if not isinstance(msg, dict):
                        continue
                    try:
                        handle_message(client, msg)
                    except Exception as e:
                        print(f"[error] handle_message: {e}")
        except Exception as e:
            print(f"[ws] connection error: {e}")
        finally:
            cleanup_client(client)


def get_lan_addresses():
    """尽力获取本机的局域网 IPv4 地址，便于直接复制给同房间的朋友。"""
    addresses = []
    try:
        hostname = socket.gethostname()
        for ip in socket.gethostbyname_ex(hostname)[2]:
            if ip and not ip.startswith("127.") and ip not in addresses:
                addresses.append(ip)
    except Exception:
        pass
    if not addresses:
        try:
            probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            probe.settimeout(0.3)
            probe.connect(("8.8.8.8", 80))
            ip = probe.getsockname()[0]
            probe.close()
            if ip and not ip.startswith("127."):
                addresses.append(ip)
        except Exception:
            pass
    return addresses


def run(port=8000):
    load_players_data()
    lan = get_lan_addresses()
    print("=" * 66)
    print("提瓦特 · 元素猜谜 · 多人对战服务器 2.0 已启动")
    print(f"角色总数: {CHAR_COUNT}（猜测次数上限 = {MAX_GUESSES_LIMIT}）")
    print(f"玩家数据文件: {PLAYERS_FILE}（已加载 {len(players_data)} 位玩家）")
    print(f"管理密码: {ADMIN_PASSWORD}")
    print(f"本机访问: http://localhost:{port}")
    if lan:
        for ip in lan:
            print(f"局域网访问: http://{ip}:{port}")
    else:
        print(f"局域网访问: http://<本机IP>:{port}（用 ipconfig 查看 IPv4 地址）")
    print("新玩法: 地脉异变 / 元素视野 / 限时挑战 / 连击 / 决胜局双倍 / 快捷表情")
    print("按 Ctrl+C 停止")
    print("=" * 66)

    server = ThreadingHTTPServer(('0.0.0.0', port), Handler)
    server.daemon_threads = True
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n正在关闭服务器...")
        save_players_data()
        server.shutdown()


if __name__ == '__main__':
    import sys
    port = 8000
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except Exception:
            pass
    run(port)
