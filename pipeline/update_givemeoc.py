# -*- coding: utf-8 -*-
"""
givemeoc 校招汇总自动更新脚本（礼貌抓取版）
- 抓取 givemeoc.com 表格（服务端渲染，urllib 即可）
- 反爬友好：单线程、请求间随机延迟（默认 2+2s，全量建议 --delay 3 --jitter 3）、失败指数退避重试
- 断点续跑：抓取结果缓存至 JSON，中断后重跑自动跳过已抓页
- 空页自动停止（自动探测真实总页数）
- 剔除站方蜜罐水印假行（crt-honeypot-row 标记 + 笔试情况=内部校验 双重过滤）
- 默认使用本脚本目录下的工作簿、缓存和入口补充表；可通过参数指定路径
- 在线抓取结果会原位更新工作簿，请运行前确认目标文件
用法:
  python update_givemeoc.py --pages 5
  python update_givemeoc.py --pages 309 --delay 3 --jitter 3            # 全量礼貌抓取
  python update_givemeoc.py --pages 309 --delay 3 --jitter 3 --resume --xlsx /path/to/source.xlsx
"""
import argparse
import html as ihtml
import json
import os
import random
import re
import time
import urllib.request
from datetime import date
from pathlib import Path

from openpyxl import load_workbook
from openpyxl.styles import Alignment, Font
from openpyxl.utils import get_column_letter

PIPELINE_DIR = Path(__file__).resolve().parent
XLSX = PIPELINE_DIR / "givemeoc校招汇总.xlsx"
CACHE = PIPELINE_DIR / "givemeoc_cache.json"
BASE = "https://www.givemeoc.com/?paged={}"
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}

# 官方投递入口补充表（默认位于脚本目录）
ENRICH_FILE = PIPELINE_DIR / "enrichment.json"


def _load_entries(enrich_file=None):
    """只从本地补充表读取入口和备注；公开仓库不包含这类招聘数据。"""
    try:
        with open(enrich_file or ENRICH_FILE, encoding="utf-8") as f:
            data = json.load(f)
        entries = data.get("entries") or {}
        return entries if isinstance(entries, dict) else {}
    except Exception:
        return {}


WIDTHS = [5, 26, 9, 14, 9, 16, 24, 55, 11, 11, 13, 30, 45]
FAKE_NAMES = {"澜舟数字科技", "云帆测试研究院", "松果智能研究院", "星河未来科技", "启明星辰实验室"}


def clean(s):
    s = re.sub(r"<[^>]+>", " ", s)
    s = ihtml.unescape(s)
    return re.sub(r"\s+", " ", s).strip()


def fetch(url, tries=4):
    """失败按 5s/15s/45s 指数退避重试"""
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            return urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "ignore")
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(5 * (3 ** i))


def parse_page(html):
    m = re.search(r'<tbody id="crt-companies-tbody">(.*?)</tbody>', html, re.S)
    if not m:
        return []
    out = []
    for tr in re.findall(r"(<tr\b[^>]*>.*?</tr>)", m.group(1), re.S):
        if "crt-honeypot-row" in tr:
            continue
        tds = re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)
        if len(tds) < 15:
            continue
        r = [clean(t) for t in tds]
        rec = {
            "name": r[0], "type": r[1], "industry": r[2], "rectype": r[3], "target": r[4],
            "loc": r[5], "pos": r[6], "upd": r[8], "ddl": r[9],
            "note": "" if r[14] == "-" else r[14],
        }
        # 双保险：蜜罐行漏标时按特征过滤
        if rec["name"] in FAKE_NAMES or "内部校验" in r[12]:
            continue
        if not rec["name"]:
            continue
        out.append(rec)
    return out


def crawl(pages, delay, jitter, use_cache=True, cache_path=None):
    """抓取 pages 页，返回 {公司名|招聘类型: rec}；空页自动停止；断点续跑"""
    cache = {}
    cache_path = Path(cache_path or CACHE)
    if use_cache and cache_path.exists():
        try:
            with open(cache_path, encoding="utf-8") as f:
                cache = json.load(f)
            # 缓存有效期：仅当天有效，隔天自动失效（防止旧缓存跳过新抓取）
            if cache.get("_date") != date.today().isoformat():
                print("缓存已过期（非当日），忽略并重新抓取")
                cache = {}
            else:
                cache.pop("_date", None)
        except Exception:
            cache = {}
    fetched_pages = 0
    stopped_at = None
    for p in range(1, pages + 1):
        key = str(p)
        if key in cache:
            recs = cache[key]
        else:
            recs = parse_page(fetch(BASE.format(p)))
            fetched_pages += 1
            if recs:
                out = {k: v for k, v in cache.items() if not str(k).startswith("_")}
                out[key] = recs
                out["_date"] = date.today().isoformat()
                cache_path.parent.mkdir(parents=True, exist_ok=True)
                with open(cache_path, "w", encoding="utf-8") as f:
                    json.dump(out, f, ensure_ascii=False)
                cache[key] = recs
        if not recs and p > 1:
            stopped_at = p - 1
            break
        if fetched_pages and p < pages:
            time.sleep(delay + random.random() * jitter)
    fresh = {}
    for recs in cache.values():
        for rec in recs:
            k = rec["name"] + "|" + rec["rectype"]
            old = fresh.get(k)
            if old is None or rec["upd"] >= old["upd"]:
                fresh[k] = rec
    real_pages = stopped_at if stopped_at else pages
    return fresh, real_pages, fetched_pages


def build_parser():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=int, default=5)
    ap.add_argument("--delay", type=float, default=2.0, help="请求间隔基数(秒)")
    ap.add_argument("--jitter", type=float, default=2.0, help="随机抖动上限(秒)")
    ap.add_argument("--resume", action="store_true", help="使用本地缓存续跑（仅全量抓取中断后重跑时用）")
    ap.add_argument("--xlsx", type=Path, default=XLSX, help="本地工作簿路径")
    ap.add_argument("--cache", type=Path, default=CACHE, help="抓取缓存路径")
    ap.add_argument("--enrichment", type=Path, default=ENRICH_FILE, help="官方入口补充信息路径")
    return ap


def main(argv=None):
    args = build_parser().parse_args(argv)
    entries = _load_entries(args.enrichment)

    fresh, real_pages, fetched = crawl(
        args.pages, args.delay, args.jitter, use_cache=args.resume, cache_path=args.cache
    )
    if not fresh:
        raise SystemExit("未解析到任何数据，站点结构可能已变化，停止写入以免破坏现有表格")

    wb = load_workbook(args.xlsx)
    ws = wb["校招汇总"]

    # 读现有企业（键：公司名|招聘类型，保留历史）
    existing = {}
    for row in ws.iter_rows(min_row=2, values_only=True):
        if row[1]:
            existing[(row[1] or "") + "|" + (row[4] or "")] = {
                "name": row[1], "type": row[2] or "", "industry": row[3] or "",
                "rectype": row[4] or "", "target": row[5] or "", "loc": row[6] or "",
                "pos": row[7] or "", "upd": row[8] or "", "ddl": row[9] or "",
                "note": row[10] or "",
            }

    new_keys, upd_keys = [], []
    for k, rec in fresh.items():
        if k not in existing:
            new_keys.append(rec["name"])
        else:
            old = existing[k]
            if any(rec[f] != old[f] for f in ("type", "industry", "rectype", "target", "loc", "pos", "ddl", "note")):
                upd_keys.append(rec["name"])
        existing[k] = rec

    # 重建数据区（更新时间倒序+名称，序号重排），样式与首次交付一致
    order = sorted(existing.values(), key=lambda r: (r["upd"], r["name"]), reverse=True)
    if ws.max_row > 1:
        ws.delete_rows(2, ws.max_row - 1)
    body_font = Font(name="微软雅黑", size=10)
    wrap = Alignment(vertical="top", wrap_text=True)
    for i, rec in enumerate(order, 1):
        entry, desc = entries.get(rec["name"], ("", ""))
        if not entry and not desc and rec["note"]:
            desc = "官方统一投递入口未检索到；可参考备注内推码及公司官网"
        ws.append([i, rec["name"], rec["type"], rec["industry"], rec["rectype"], rec["target"],
                   rec["loc"], rec["pos"], rec["upd"], rec["ddl"], rec["note"], entry, desc])
        for c in ws[ws.max_row]:
            c.font = body_font
            c.alignment = wrap
    for i, w in enumerate(WIDTHS, 1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:M{ws.max_row}"

    today = date.today().isoformat()
    info = wb["说明"]
    n = len(order)
    scope = "表格前5页最新更新记录" if real_pages <= 5 else f"全站{real_pages}页（共{real_pages}页，约{fetched}页为本次新抓取）"
    info["B3"] = f"givemeoc.com（来个OC）校招企业汇总表，最近抓取 {today}，范围为{scope}"
    info["B4"] = f"共 {n} 条企业记录（按公司名+招聘类型合并去重，累计保留历史并增量更新；已自动剔除站方水印假行）"

    tmp = str(args.xlsx) + ".tmp"
    wb.save(tmp)
    os.replace(tmp, args.xlsx)
    print(f"OK total={n} fetched_pages={fetched} real_pages={real_pages} new={len(new_keys)} updated={len(upd_keys)}")
    if new_keys:
        print("新增:", "、".join(new_keys))
    if upd_keys:
        print("有更新:", "、".join(upd_keys))


if __name__ == "__main__":
    main()
