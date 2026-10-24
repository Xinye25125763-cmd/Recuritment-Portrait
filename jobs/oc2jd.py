# -*- coding: utf-8 -*-
"""
oc2jd.py — 把公司级职位列表转换为本地职位线索库
- 每个职位片段独立推断方向；不推测逐岗职责或关键词
- 只输出支持方向且尚未截止的线索
- 相同公司、岗位、方向、批次、投递入口和截止日期合并地点
- 稳定 ID 由职位身份字段哈希产生，输出 jobs/jd-library-givemeoc.json
- 默认路径相对于脚本，可通过 --input 和 --output 覆盖
"""
import argparse
import hashlib
import json
import re
from datetime import date
from pathlib import Path

import openpyxl

SCRIPT_DIR = Path(__file__).resolve().parent
PIPELINE_DIRS = (SCRIPT_DIR.parent / "pipeline", SCRIPT_DIR.parent.parent / "pipeline")
DEFAULT_XLSX = next(
    (directory / "givemeoc校招汇总.xlsx" for directory in PIPELINE_DIRS
     if (directory / "givemeoc校招汇总.xlsx").is_file()),
    PIPELINE_DIRS[0] / "givemeoc校招汇总.xlsx",
)
DEFAULT_OUT = SCRIPT_DIR / "jd-library-givemeoc.json"

# 支持方向的关键词词典
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


def split_positions(raw):
    """按源表中可靠的职位分隔符拆分；斜杠可能属于职位名，保留在片段内。"""
    return [part.strip() for part in re.split(r"[,，、;；\r\n]+", str(raw or "")) if part.strip()]


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
    return pos.strip()


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


def _text(value):
    return str(value).strip() if value is not None else ""


def convert_rows(rows, today=None):
    """把工作簿行转成可供职位线索展示的记录，不推测 JD 职责或关键词。"""
    today = today or date.today().isoformat()
    jobs_by_id = {}
    dropped_no_track = 0
    dropped_closed = 0
    stats = {}

    for row in rows:
        if len(row) < 13:
            continue
        (name, company_type, industry, rectype, target, location, positions,
         updated, deadline, _note, entry, _posting_note) = row[1:13]
        name = _text(name)
        if not name or not positions:
            continue

        deadline_text = _text(deadline)
        if not is_open(deadline_text, today):
            dropped_closed += 1
            continue

        for segment in split_positions(positions):
            track, keyword, keyword_index = infer_track(segment)
            if not track:
                dropped_no_track += 1
                continue

            title = extract_title(segment, track, keyword, keyword_index)
            rectype_text = _text(rectype)
            target_text = _text(target) or "2027届"
            program = (target_text + rectype_text).strip()
            employment_type = (
                "实习" if rectype_text in INTERNSHIP_TYPE
                or any(term in rectype_text for term in INTERNSHIP_KW)
                else "正式"
            )
            url = _text(entry)
            identity = [
                name, track, title.casefold(), program.casefold(),
                url, deadline_text.casefold(),
            ]
            identity_json = json.dumps(identity, ensure_ascii=False, separators=(",", ":"))
            job_id = "OC" + hashlib.md5(identity_json.encode("utf-8")).hexdigest()[:12]
            locations = split_locations(_text(location))

            job = {
                "id": job_id,
                "company": name,
                "companyType": _text(company_type),
                "industry": _text(industry),
                "title": title,
                "track": track,
                "employmentType": employment_type,
                "program": program,
                "locations": locations,
                "sourceListing": segment,
                "descriptionType": "position_listing",
                "sourceType": "company_listing",
                "url": url,
                "deadline": deadline_text,
                "crawlDate": _text(updated) or today,
                "source": "givemeoc",
            }

            existing = jobs_by_id.get(job_id)
            if existing:
                seen_locations = set(existing["locations"])
                for location_name in locations:
                    if location_name not in seen_locations:
                        existing["locations"].append(location_name)
                        seen_locations.add(location_name)
            else:
                jobs_by_id[job_id] = job
                stats[track] = stats.get(track, 0) + 1

    return {
        "version": "1.1",
        "lastUpdate": today,
        "jobs": list(jobs_by_id.values()),
        "stats": {
            "droppedNoTrack": dropped_no_track,
            "droppedClosed": dropped_closed,
        },
    }


def convert_workbook(input_path, output_path, today=None):
    workbook = openpyxl.load_workbook(input_path, read_only=True, data_only=True)
    try:
        sheet = workbook["校招汇总"]
        library = convert_rows(sheet.iter_rows(min_row=2, values_only=True), today=today)
    finally:
        workbook.close()

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(library, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    ids = [job["id"] for job in library["jobs"]]
    if len(ids) != len(set(ids)):
        raise ValueError("岗位 ID 冲突")
    return library


def build_parser():
    parser = argparse.ArgumentParser(description="将 GiveMeOC 校招职位列表转换为本地岗位线索库")
    parser.add_argument("--input", type=Path, default=DEFAULT_XLSX, help="源工作簿路径")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUT, help="生成 JSON 路径")
    parser.add_argument("--today", help="用于截止日期过滤的 YYYY-MM-DD 日期（主要用于重现和测试）")
    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    library = convert_workbook(args.input, args.output, today=args.today)
    stats = {}
    for job in library["jobs"]:
        stats[job["track"]] = stats.get(job["track"], 0) + 1
    print(
        "OK jobs={} by_track={} dropped_no_track={} dropped_closed={}".format(
            len(library["jobs"]),
            stats,
            library["stats"]["droppedNoTrack"],
            library["stats"]["droppedClosed"],
        )
    )
    print("id 稳定性校验通过")


if __name__ == "__main__":
    main()
