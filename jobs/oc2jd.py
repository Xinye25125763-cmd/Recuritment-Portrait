# -*- coding: utf-8 -*-
"""
oc2jd.py — 把 givemeoc校招汇总.xlsx 转换为 Recuritment-Portrait 的 JD 增强库
- 只保留 track 可推断（数据分析/商业分析/产品经理）且未截止的记录
- track 落空的记录整条丢弃（引擎不认识多余 track，入库只会污染匹配列表）
- id 幂等: "OC"+md5(company|track|title)[:8]，重复运行不产生重复
- 输出 jobs/jd-library-givemeoc.json（gitignored，仅本地使用）
"""
import hashlib
import json
import re
import sys
from datetime import date

import openpyxl

XLSX = r"E:\小玩意儿\givemeoc校招汇总.xlsx"
OUT = r"E:\小玩意儿\Recuritment-Portrait\jobs\jd-library-givemeoc.json"

# track 关键词（推断规则来自 oc-integration-design.md §P0）
TRACK_KW = [
    ("数据分析", ["数据分析", "数据挖掘", "数据科学", "BI", "经营分析", "数据运营", "数据工程", "数据开发", "商业数据分析"]),
    ("商业分析", ["商业分析", "战略", "咨询", "投资分析", "市场研究", "行业研究", "战略分析"]),
    ("产品经理", ["产品经理", "产品运营", "用户研究", "产品策划", "产品岗", "产品类"]),
]

# 城市词典（地点切分用，站点原文无分隔符，靠子串匹配）
CITIES = [
    "哈尔滨", "齐齐哈尔", "牡丹江", "大庆", "长春", "吉林", "沈阳", "大连", "鞍山", "锦州",
    "呼和浩特", "包头", "乌鲁木齐", "克拉玛依", "兰州", "酒泉", "天水", "银川", "西宁",
    "西安", "宝鸡", "咸阳", "汉中", "延安", "太原", "大同", "临汾", "石家庄", "唐山", "秦皇岛",
    "保定", "邯郸", "张家口", "承德", "沧州", "廊坊", "衡水", "北京", "上海", "天津", "重庆",
    "广州", "深圳", "珠海", "汕头", "佛山", "韶关", "湛江", "中山", "江门", "东莞", "惠州",
    "肇庆", "阳江", "茂名", "清远", "揭阳", "潮州", "云浮", "河源", "梅州", "汕尾", "梧州",
    "南宁", "桂林", "柳州", "北海", "钦州", "防城港", "贵港", "玉林", "海口", "三亚",
    "武汉", "宜昌", "襄阳", "十堰", "荆州", "荆门", "孝感", "黄冈", "鄂州", "黄石", "咸宁",
    "恩施", "天门", "潜江", "仙桃", "随州", "长沙", "株洲", "湘潭", "衡阳", "岳阳", "常德",
    "郑州", "开封", "洛阳", "新乡", "安阳", "焦作", "许昌", "漯河", "南阳", "信阳", "周口",
    "驻马店", "平顶山", "濮阳", "三门峡", "商丘", "鹤壁", "济源",
    "济南", "青岛", "淄博", "枣庄", "东营", "烟台", "潍坊", "济宁", "泰安", "威海", "日照",
    "临沂", "德州", "聊城", "滨州", "菏泽", "潍坊",
    "南京", "苏州", "无锡", "常州", "镇江", "扬州", "泰州", "南通", "盐城", "徐州",
    "连云港", "淮安", "宿迁", "杭州", "宁波", "温州", "嘉兴", "湖州", "绍兴", "金华",
    "衢州", "舟山", "台州", "丽水", "合肥", "芜湖", "蚌埠", "淮南", "马鞍山", "淮北",
    "铜陵", "安庆", "黄山", "滁州", "阜阳", "宿州", "六安", "亳州", "池州", "宣城",
    "福州", "厦门", "泉州", "漳州", "莆田", "三明", "南平", "龙岩", "宁德",
    "南昌", "九江", "景德镇", "萍乡", "新余", "鹰潭", "赣州", "吉安", "宜春", "抚州", "上饶",
    "成都", "绵阳", "德阳", "宜宾", "自贡", "攀枝花", "泸州", "遂宁", "内江", "乐山",
    "南充", "眉山", "广安", "达州", "雅安", "巴中", "资阳", "凉山", "阿坝", "西昌",
    "贵阳", "遵义", "六盘水", "安顺", "铜仁", "毕节", "昆明", "曲靖", "玉溪", "丽江",
    "大理", "红河", "楚雄", "临沧", "普洱", "西双版纳", "迪庆", "怒江", "德宏",
    "拉萨", "日喀则", "昌都", "林芝", "山南", "那曲", "阿里",
    "香港", "澳门", "台北",
    "神木", "准格尔", "库尔勒", "库车", "伊犁", "喀什", "和田", "阿克苏", "吐鲁番", "哈密",
    "昌吉", "石河子", "塔城", "阿勒泰", "博州", "克州", "海东", "格尔木", "德令哈",
]
PROVINCES = ["新疆", "西藏", "内蒙古", "广西", "宁夏", "青海", "海南", "全国", "海外"]
REGION_WORDS = ["华北", "华东", "华南", "华中", "西南", "西北", "东北", "省内", "省内地市", "各地市", "各区县", "全国各地", "工作地", "多地"]

INTERNSHIP_KW = ["实习"]
FORMAL_TYPE = {"秋招", "秋招提前批", "秋招补录", "春招", "春招补录", "夏招", "春招补录/秋招提前批", "春招，秋招提前批", "春招补录，秋招", "秋招，实习"}
INTERNSHIP_TYPE = {"实习", "实习，秋招", "实习,秋招", "秋招，实习", "秋招提前批，实习", "春招，实习", "实习,春招", "实习，春招补录"}

TITLE_SUFFIX = ("工程师", "分析师", "专员", "经理", "管培生", "策划", "岗", "师", "员", "运营", "开发")


def infer_track(pos):
    for track, kws in TRACK_KW:
        for kw in kws:
            i = pos.find(kw)
            if i >= 0:
                return track, kw, i
    return None, None, -1


def extract_title(pos, track, kw, i):
    """title 跟随 track 关键词：按分隔符切分岗位串，取含关键词的完整职位段"""
    for seg in re.split(r"[，,、；;。/（）()：:]", pos):
        seg = seg.strip()
        if kw in seg and 2 <= len(seg) <= 20:
            return seg
    after = pos[i + len(kw): i + len(kw) + 5]
    for suf in TITLE_SUFFIX:
        if after.startswith(suf):
            return kw + suf
    return track + "类岗位"


def split_locations(loc):
    if not loc:
        return []
    found, ordered = set(), []
    for w in CITIES + PROVINCES + REGION_WORDS:
        i = loc.find(w)
        if i >= 0 and w not in found:
            found.add(w)
            ordered.append((i, w))
    ordered.sort()
    return [w for _, w in ordered] or [loc]


def is_open(ddl, today):
    if not ddl:
        return True  # 无截止信息不丢弃（招满为止/长期有效同）
    s = str(ddl)[:10]
    if s == "招满为止" or s == "长期有效" or not re.match(r"\d{4}-\d{2}-\d{2}", s):
        return True
    return s >= today


def main():
    today = date.today().isoformat()
    wb = openpyxl.load_workbook(XLSX, read_only=True)
    ws = wb["校招汇总"]
    jobs, dropped_no_track, dropped_closed, seen_ids, stats = [], 0, 0, set(), {}
    for r in ws.iter_rows(min_row=2, values_only=True):
        (name, ctype, industry, rectype, target, loc, pos, upd, ddl, note, entry, desc) = r[1:13]
        if not name or not pos:
            continue
        pos_s = str(pos)
        track, kw, kw_idx = infer_track(pos_s)
        if not track:
            dropped_no_track += 1
            continue
        if not is_open(ddl, today):
            dropped_closed += 1
            continue
        title = extract_title(pos_s, track, kw, kw_idx)
        emp = "实习" if rectype in INTERNSHIP_TYPE or any(k in str(rectype) for k in INTERNSHIP_KW) else "正式"
        jid = "OC" + hashlib.md5(f"{name}|{track}|{title}|{rectype}".encode()).hexdigest()[:8]
        # 同键冲突时追加序号，保证 id 唯一
        base_jid, seq = jid, 2
        while jid in seen_ids:
            jid = f"{base_jid}-{seq}"
            seq += 1
        seen_ids.add(jid)
        job = {
            "id": jid,
            "company": name,
            "title": title,
            "track": track,
            "employmentType": emp,
            "program": f"{target or '2027届'}{rectype or ''}".strip(),
            "locations": split_locations(str(loc or "")),
            "description": pos_s,
            "url": entry or "",
            "deadline": str(ddl or ""),
            "crawlDate": str(upd or today),
            "source": "givemeoc",
        }
        jobs.append(job)
        stats[track] = stats.get(track, 0) + 1
    wb.close()

    lib = {
        "version": "1.0",
        "lastUpdate": today,
        "jobs": jobs,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(lib, f, ensure_ascii=False, indent=2)
    print(f"OK jobs={len(jobs)} by_track={stats} dropped_no_track={dropped_no_track} dropped_closed={dropped_closed}")
    # 幂等校验
    ids = [j["id"] for j in jobs]
    assert len(ids) == len(set(ids)), "id 冲突！"
    print("id 幂等校验通过")


if __name__ == "__main__":
    main()
