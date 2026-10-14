# 秋招画像系统 × givemeoc 数据管道 —— 集成改进方案

| 项目 | 内容 |
|------|------|
| 文档版本 | v1.0 |
| 编写日期 | 2026-10-12 |
| 依赖 | E:\小玩意儿\givemeoc校招汇总.xlsx（8918 条，每日 21:00 自动更新）、update_givemeoc.py |
| 改造目标 | 把手工维护的 JD 库升级为「每日自动更新的真实在招岗位库」，零部署成本、不破坏纯前端架构 |

---

## 一、现状与问题

| 现状 | 问题 |
|------|------|
| `jobs/jd-library.json` 手工维护，约 10 余条 JD | 岗位池太小，匹配页无实际使用价值 |
| JD 只有 3 个 track（数据分析/商业分析/产品经理） | 与用户「互联网+央国企双赛道」定位的岗位供给量不匹配 |
| JD 库无截止日期、无投递入口排序 | 用户看到匹配岗位后无法判断投递优先级 |
| 岗位更新依赖手动追加（jobs/README.md 的流程） | 秋招信息时效性强，手工模式必然滞后 |

givemeoc 管道已解决"供给"问题：8918 条记录、每日自动增量、含官方投递入口补充列、投递截止日期。本方案解决"接入"问题。

## 二、设计原则

1. **零侵入**：不改动 `match-engine.js` 评分逻辑、不改变 `jd-library.json` schema 必填约定（README 已声明：除 id/company/title/track 外其余字段缺失走中性评分，未知字段不报错）
2. **合规红线**：givemeoc 派生数据文件**仅本地使用**，加入 `.gitignore`，公开站点（GitHub Pages/CNAME）不部署该文件
3. **渐进增强**：数据文件不存在时，match.html 行为与现在完全一致；文件存在时自动增强
4. **幂等可重建**：所有生成物可由源数据一键重建，无手工沉淀

## 三、架构

```
givemeoc.com
    │ (每晚21:00 定时任务, 已运行)
    ▼
givemeoc校招汇总.xlsx (8918条, 含官方投递入口/截止日期)
    │
    ├──→ [P0] oc2jd.py ──→ jobs/jd-library-givemeoc.json (gitignored)
    │         映射: 名称→company, 岗位串→title+description,
    │         招聘类型→employmentType, 地点→locations,
    │         官方投递入口→url, 投递截止→deadline,
    │         关键词推断→track(仅3方向, 其余丢弃)
    │
    ▼
match.html (改造: fetch 双库容错合并)
    │
    ├── 内置库 jobs/jd-library.json (手工精选JD, 公开部署)
    └── 增强库 jd-library-givemeoc.json (本地增强, 404时静默跳过)
```

## 四、实施分期

### P0 — 数据接入（半天，核心闭环）

**1. 新增 `jobs/oc2jd.py`**（放项目 `jobs/` 目录，或独立放 E:\小玩意儿 由脚本引用路径）

- 输入：`E:\小玩意儿\givemeoc校招汇总.xlsx`
- 过滤：仅保留「截止日期 ≥ 今天 或 招满为止」且 track 可推断的记录
- track 推断规则（关键词匹配，只输出引擎支持的 3 个 track）：
  - `数据分析`：数据分析、数据挖掘、数据科学、BI、经营分析、数据运营
  - `商业分析`：商业分析、战略、咨询、投资分析、市场研究
  - `产品经理`：产品经理、产品运营、用户研究、产品策划
  - 其余 track 落空的记录**整条丢弃**（引擎对未知 track 走中性评分，放进库只会污染列表）
- 字段映射细节（对应已知数据质量问题的处理）：
  - `title`：从岗位长串中提取第一个职位名（如"管培生（市场方向）"）；提取失败则用"XX类岗位"
  - `responsibilities` / 新增 `description`：完整岗位串原文（站点原文无分隔符，保留原文不猜测切分）
  - `locations`：用内置城市词典做子串匹配切分（"北京上海深圳"→["北京","上海","深圳"]；词典需覆盖全国主要城市+常见地域词）
  - `employmentType`：秋招/秋招提前批/秋招补录→"正式"；实习→"实习"；春招→"正式"
  - `program`：招聘对象 + 招聘类型（如"2027届校园招聘"）
  - `url`：官方投递入口列（约 35 家已核实，其余为空——引擎对空 url 宽容）
  - `deadline`：投递截止（新增字段，不参与评分）
  - `crawlDate`：更新时间列
  - `id`：`"OC" + md5(company|track|title)[:8]`，幂等，重复运行不产生重复记录
- 输出：`jobs/jd-library-givemeoc.json`，结构与 jd-library.json 一致（version/lastUpdate/jobs）

**2. 改造 `match.html`（~10 行）**

651 行附近，单 fetch 改双 fetch 容错合并：

```js
const resp = await fetch('./jobs/jd-library.json');
if (!resp.ok) throw new Error(`JD 库加载失败 (HTTP ${resp.status})`);
const lib = await resp.json();
this.allJobs = lib.jobs || [];
// ↓ 新增：本地增强库，文件不存在时静默跳过
try {
  const resp2 = await fetch('./jobs/jd-library-givemeoc.json');
  if (resp2.ok) {
    const lib2 = await resp2.json();
    this.allJobs = [...(lib2.jobs || []), ...this.allJobs];  // 增强库在前
  }
} catch (e) { /* 本地增强库不存在，走纯内置库 */ }
```

**3. `.gitignore` 追加**：`jobs/jd-library-givemeoc.json`

公开部署后远端没有该文件 → fetch 404 → 静默跳过 → 公开站点保持纯内置库，红线自动成立。

**4. 验证**：本地 `python -m http.server 8765` 打开 match.html，确认：合并后岗位数、双库同 id 不冲突、评分正常。

### P1 — 自动化编排（1 小时）

- **每日任务升级**（现有「givemeoc校招汇总更新」任务 prompt 追加一步）：update_givemeoc.py 成功后追加执行 oc2jd.py，汇报口径增加"JD 库本次条数"。
- **每周日全量校准任务**（新增 automation）：`RRULE:FREQ=WEEKLY;BYDAY=SU;BYHOUR=21;BYMINUTE=30`，跑 `update_givemeoc.py --pages 400 --delay 3 --jitter 3` + oc2jd.py 重建，修复增量盲区（站点把旧企业重新入库后排到后页、前 5 页看不到的情况）。

### P2 — 分层补齐 enrichment（按需，替换硬编码）

- 新建 `E:\小玩意儿\enrichment.json`：`{公司名: {url, scale, exam, note, updated}}`，替代 update_givemeoc.py 里硬编码的 ENTRIES 字典（脚本改为读缓存，缓存优先）。
- 每日任务 prompt 增加判断：当日新增企业中命中 3 方向关键词的，由 agent 用 web_search 核实官方投递入口，写入 enrichment.json（每天实际 5~20 家，成本可控）。
- 只补「命中方向 + 未截止」的，不做全量补齐（此前复核已否决全量方案）。

### P3 — 体验增强（可选，纯前端）

- match.html 岗位卡片显示 `deadline` 徽标（3 天内截止标红），排序支持"截止临近优先"
- 方向扩展：如需支持技术/金融岗（数据源里分别有 3300+/2000+ 条），按 jobs/README.md 的「新增方向三步」扩 TRACK_REGISTRY——此为独立决策，不阻塞 P0~P2

## 五、风险与对策

| 风险 | 对策 |
|------|------|
| givemeoc 改版/蜜罐标记变化导致解析失效 | update_givemeoc.py 已有空数据熔断（"未解析到任何数据，停止写入"）；连续 3 天任务失败视为告警信号 |
| 地点切分词典漏城市 | 词典未命中的地点整串放入 locations 首位，不做有损切分 |
| 增强库与内置库公司重复 | 展示层不去重（同一公司秋招/实习本就是多条），如需去重按 id 前缀（内置无 OC 前缀）区分来源 |
| 派生数据被误 push | .gitignore + 文件名含 givemeoc 字样双重防线；公开部署 fetch 404 天然兜底 |
| JD 数据滞后于真实截止 | deadline 取自站点数据，页脚注明"以官方公告为准"（沿用主 Excel 说明页口径） |

## 六、不做的事（明确排除）

- 不做全站数据公开部署（侵权红线）
- 不自建公众号/高校就业网采集管道（上游不可批量监控，givemeoc 已做发现工作，自建性价比为负——此前调查已验证其数据源即公开渠道）
- 不改 match-engine.js 评分逻辑（引擎对额外字段天然宽容，无需动核心）
