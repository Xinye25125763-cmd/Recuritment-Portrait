/**
 * 秋招画像系统 · 岗位匹配引擎
 *
 * 输入：用户档案（localStorage 的 qiuzhao_profile_v4 结构）+ 画像（portrait-engine 产物）+ JD 库
 * 输出：带分数、等级、理由、缺口提示的排序结果列表
 *
 * 设计原则（与 portrait-engine 一致）：
 * 1. 纯函数：不修改入参，所有输出均为新对象
 * 2. 容忍缺失：用户偏好缺失时用中性分；岗位数据缺失的维度不参与评分
 * 3. 可解释：每个维度单独打分，理由从打分过程自动生成
 *
 * 评分模型：
 *   方向匹配 25% + 技能重叠 30% + 城市匹配 15% + 届次匹配 10%
 *   + 企业类型 10% + 经验相关 10%，另有画像强匹配加成 +5（总分封顶 100）
 *   未提供岗位证据的维度会被略过，其余维度按可用权重归一化。
 *   等级仍表示分数区间；confidence 单独表示岗位数据覆盖完整度。
 */

// ══════════════════════════════════════════════════════════
// 一、静态映射表
// ══════════════════════════════════════════════════════════

/**
 * ══════════════════════════════════════════════════════════
 * 轨道注册表（Track Registry）
 * ══════════════════════════════════════════════════════════
 *
 * 这是整个匹配引擎的「方向枢纽」。如果要支持新的 JD 方向，只需在这张表里
 * 添加一行映射，系统会自动完成方向匹配、画像加成和筛选器统计。
 *
 * 结构说明：
 *   - directionMap: 用户求职意向（schema.js 下拉选项）→ JD track
 *   - roleMap: 画像引擎输出的角色名 → JD track（强匹配 +5 分加成）
 *
 * 扩展指南：
 *   1. 在 jd-library.json 里新增岗位的 track 字段使用新方向名
 *   2. 在本表 directionMap 和 roleMap 中各加一行映射
 *   3. 在 schema.js 的求职意向下拉列表里追加新选项（如需用户可选）
 *   4. 在 portrait-engine.js 的 ROLE_TEMPLATES 里追加新角色模板（如需画像识别）
 *   5. 无需改动 match.html —— track 统计和筛选器会自动识别新方向
 */
export const TRACK_REGISTRY = {
  directionMap: {
    // ── 数据分析方向 ──
    '数据分析': '数据分析',
    // ── 商业分析方向 ──
    'BI/商业分析': '商业分析',
    '咨询': '商业分析',
    '战略投资': '商业分析',
    // ── 产品经理方向 ──
    '产品经理': '产品经理',
    '数据产品经理': '产品经理',
    '产品运营': '产品经理',
    '用户研究': '产品经理',
    // ── 以下方向暂无 JD 对应 track，映射为 null（方向分 0，不会误匹配） ──
    '数据开发': null,
    '后端开发': null,
    '前端开发': null,
    '算法工程师': null,
    '测试开发': null,
    '项目管理': null,
    '技术支持': null,
    '解决方案': null,
  },
  roleMap: {
    '商业分析师': '商业分析',
    'BI分析师': '商业分析',
    '战略投资分析师': '商业分析',
    '咨询分析师': '商业分析',
    '数据分析师': '数据分析',
    '产品经理': '产品经理',
    // 审计师在 JD 库三个 track 中无对应，不加成
  },
};

/** 兼容旧引用：保持 DIRECTION_TRACK_MAP 别名可用 */
export const DIRECTION_TRACK_MAP = TRACK_REGISTRY.directionMap;

/** 公司 → 企业类型（internet=互联网 / soe=央国企）。
 *  未知公司不推断企业类别，其企业类型维度不参与评分。 */
export const COMPANY_TYPE = {
  '字节跳动': 'internet',
  '美团': 'internet',
  '腾讯': 'internet',
  '京东': 'internet',
  '华为': 'internet',
  '中国电信': 'soe',
  '建设银行': 'soe',
};

/**
 * JD 库中出现的城市列表，用于地点脏数据清洗。
 *
 * 扩展方式：如果新增 JD 里出现了陌生城市（如"宁波"），把这个城市名追加到
 * 数组里即可。归一化逻辑会优先匹配这个列表，再兜底去掉省名前缀。
 * 不追加也能跑，只是"浙江宁波市"这种脏数据可能切不干净。
 */
const KNOWN_CITIES = [
  '北京', '上海', '深圳', '广州', '杭州', '成都', '武汉', '南京', '西安',
  '苏州', '天津', '重庆', '合肥', '长沙', '青岛', '大连', '厦门', '珠海',
  '香港', '宿迁', '韶关', '芜湖', '济南', '南宁', '哈密', '大同', '廊坊',
  '迪拜', '利雅得', '科威特城',
  // 新增城市请追加在这里
];

/** dealBreaker（schema.js 绝对不接受条件）→ 文本排除规则。
 *  仅收录 JD 文本中可靠出现的信号；"强制加班文化""需要垫资"等
 *  在公开招聘 JD 中无稳定文字信号的条件不做文本匹配（避免误杀）。 */
export const DEALBREAKER_RULES = {
  '销售性质': { patterns: ['销售', '商务拓展', '渠道', '行销', 'BD'], where: 'title' },
  '外包/驻场': { patterns: ['外包', '驻场', '外派'], where: 'both' },
  '长期出差': { patterns: ['长期出差', '常驻外地'], where: 'both' },
  '三班倒/夜班': { patterns: ['夜班', '三班倒', '轮班'], where: 'both' },
};

/** 技能别名 → JD 关键词词汇表的规范化（大小写 / 中英混写统一） */
const SKILL_ALIASES = {
  'sql': 'SQL', 'python': 'Python', 'tableau': 'Tableau', 'excel': 'Excel',
  'powerbi': 'PowerBI', 'power bi': 'PowerBI', 'hive': 'Hive', 'spark': 'Spark',
  'ab测试': 'A/B实验', 'ab实验': 'A/B实验', 'a/btest': 'A/B实验', 'ab test': 'A/B实验',
  '大语言模型': '大模型', 'llm': 'LLM', 'gpt': 'LLM', '大语言模型(llm)': 'LLM',
  'llm应用': 'LLM', 'rag': 'RAG', 'agent': 'Agent', '智能体': '智能体',
  '商业数据分析': '商业分析', 'biz analysis': '商业分析',
  '用户增长分析': '用户增长', 'growth': '用户增长',
  'dau预测': '预测建模', '时间序列': '预测建模', '预测模型': '预测建模',
  '经营监控': '经营分析', '财务分析': '商业分析', '审计': '审计合规',
  'etl': 'ETL', '数据仓库': '数据仓库', 'hadoop': 'Hadoop',
  '机器学习': '数据挖掘', 'wind': 'Wind', 'stata': 'Stata', 'spss': 'SPSS',
  'axure': 'Axure', 'figma': 'Figma',
};

/** 各维度权重（总和 = 100） */
export const DIM_WEIGHTS = {
  direction: 25,
  skills: 30,
  location: 15,
  program: 10,
  company: 10,
  experience: 10,
};

// ROLE_TRACK 已合并到 TRACK_REGISTRY.roleMap，保持兼容引用
const ROLE_TRACK = TRACK_REGISTRY.roleMap;

// ══════════════════════════════════════════════════════════
// 二、工具函数
// ══════════════════════════════════════════════════════════

/**
 * 归一化地点字符串。
 * 处理库中的脏数据："北京市"→"北京"、"深圳总部"→"深圳"、
 * "四川成都市……等27个工作地点"→"成都"、"广东深圳市"→"深圳"。
 * @param {string} raw - 原始地点字符串
 * @returns {string} 归一化后的城市名（无法识别时返回去除行政区划后缀的原文）
 */
export function normalizeLocation(raw) {
  if (!raw || typeof raw !== 'string') return '';
  // 截断"……等N个工作地点"，去掉"总部"后缀
  let s = raw.split('……')[0].trim().replace(/总部$/, '');
  // 优先匹配已知城市（放在前面避免"广东深圳市"被切成"广东"）
  for (const city of KNOWN_CITIES) {
    if (s.includes(city)) return city;
  }
  // 兜底：去掉省名前缀和行政区划后缀
  return s
    .replace(/^(内蒙古|广西|西藏|宁夏|新疆|河北|山西|辽宁|吉林|黑龙江|江苏|浙江|安徽|福建|江西|山东|河南|湖北|湖南|广东|海南|四川|贵州|云南|陕西|甘肃|青海)/, '')
    .replace(/(市|区|县|地区|盟|自治州)$/, '')
    || s;
}

/**
 * 规范化技能词：小写、去空白、套用别名表。
 * @param {string} term - 原始技能词
 * @returns {string|null} 规范化结果，空输入返回 null
 */
function normalizeSkillTerm(term) {
  const t = (term || '').trim().toLowerCase();
  if (!t) return null;
  return SKILL_ALIASES[t] || (t.length <= 1 ? null : term.trim());
}

/**
 * 从自由文本技能栏提取技能词。
 * 支持格式："Python — 实习中写过 ETL 脚本"、"SQL、Hive、Tableau"、每行一条。
 * @param {string} text - 技能栏原文
 * @returns {string[]} 技能词数组（已去重）
 */
function parseSkillText(text) {
  if (!text) return [];
  return text
    .split(/[\n、,，;；\/|]+/)
    .map(line => {
      // "技能名 — 用它做过什么" 只取破折号前的技能名
      const head = line.split(/[—\-–]|：|:/)[0];
      return head.trim();
    })
    .filter(Boolean);
}

/**
 * 提取用户技能画像：技能词 → 熟练度权重。
 * 来源权重：熟练 1.0 / 实习技术栈 0.8 / 项目技术栈 0.7 / 熟悉 0.6 / 了解 0.3。
 * 同一技能出现在多档时取最高权重（不允许"了解"档覆盖"熟练"档）。
 * @param {Object} profile - 用户档案（schema.js 结构）
 * @returns {Map<string, number>} 技能词 → 权重
 */
export function extractUserSkills(profile) {
  const skillMap = new Map();

  const add = (terms, weight) => {
    for (const raw of terms) {
      const term = normalizeSkillTerm(raw);
      if (!term) continue;
      const prev = skillMap.get(term) ?? 0;
      if (weight > prev) skillMap.set(term, weight);
    }
  };

  add(parseSkillText(profile.skillsProficient), 1.0);
  add(parseSkillText(profile.skillsFamiliar), 0.6);
  add(parseSkillText(profile.skillsKnown), 0.3);

  (profile.internships || []).forEach(it => add(parseSkillText(it.techStack), 0.8));
  (profile.projects || []).forEach(p => add(parseSkillText(p.techStack), 0.7));

  return skillMap;
}

/**
 * 中文字符级 bigram 集合（用于经验文本相似度）。
 * @param {string} text
 * @returns {Set<string>}
 */
function bigrams(text) {
  const s = (text || '').replace(/\s+/g, '');
  const set = new Set();
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}

/**
 * 拼接用户的经历语料（实习职责+成果、项目工作+成果、主修课程）。
 * @param {Object} profile
 * @returns {string}
 */
function buildUserCorpus(profile) {
  const parts = [];
  (profile.internships || []).forEach(it => {
    parts.push(it.role || '', it.background || '', it.responsibilities || '', it.metrics || '');
  });
  (profile.projects || []).forEach(p => {
    parts.push(p.name || '', p.myWork || '', p.result || '');
  });
  parts.push(profile.mainCourses || '');
  return parts.join('\n');
}

// ══════════════════════════════════════════════════════════
// 三、Deal-breaker 硬过滤
// ══════════════════════════════════════════════════════════

/**
 * 按用户勾选的 dealBreakers 过滤岗位。
 * @param {Array} jobs - JD 数组
 * @param {Object} profile - 用户档案
 * @returns {{kept: Array, excluded: Array<{job: Object, rule: string}>}}
 *          保留的岗位 + 被排除的岗位（带命中的规则名，供 UI 提示）
 */
export function applyDealBreakers(jobs, profile) {
  const activeRules = (profile.dealBreakers || [])
    .map(name => ({ name, rule: DEALBREAKER_RULES[name] }))
    .filter(r => r.rule);

  if (activeRules.length === 0) return { kept: [...jobs], excluded: [] };

  const kept = [];
  const excluded = [];
  for (const job of jobs) {
    const title = job.title || '';
    const respText = (job.responsibilities || []).join('\n');
    let hit = null;
    for (const { name, rule } of activeRules) {
      const scopes = rule.where === 'title' ? [title] : rule.where === 'both' ? [title, respText] : [respText];
      if (rule.patterns.some(p => scopes.some(s => s.includes(p)))) { hit = name; break; }
    }
    if (hit) excluded.push({ job, rule: hit });
    else kept.push(job);
  }
  return { kept, excluded };
}

// ══════════════════════════════════════════════════════════
// 四、六维度评分函数（每个返回 0-100 + 可选理由文本）
// ══════════════════════════════════════════════════════════

/** 方向匹配：用户求职方向 ↔ JD track */
function scoreDirection(job, profile) {
  if (!job.track) return { score: null };
  const directions = profile.targetDirections || [];
  if (directions.length === 0) return { score: 50 }; // 未填写，中性
  const tracks = new Set(directions.map(d => DIRECTION_TRACK_MAP[d]).filter(Boolean));
  if (tracks.has(job.track)) return { score: 100, reason: `${job.track}在你的目标方向内` };
  return { score: 30 }; // 用户有明确方向但不含此 track
}

/** 技能重叠：用户技能权重表 + 经历文本印证 ↔ JD keywords。
 *  双层匹配解决词汇空间不重叠问题：
 *  - 第一层：工具技能词（SQL/Python/Tableau）从技能表精确匹配，权重 0.3-1.0
 *  - 第二层：业务能力词（增长/经营分析/指标体系）从实习职责文本印证，权重 0.6
 *  （业务能力词通常不出现在 skillsProficient 栏，但用户做过的经历里会出现） */
function scoreSkills(job, skillMap, userCorpus) {
  const kws = job.keywords || [];
  if (kws.length === 0) return { score: null }; // 没有岗位关键词时不假装完成技能评估
  if (skillMap.size === 0 && !userCorpus) return { score: 40 }; // 用户没填技能，略低中性

  let overlapScore = 0;
  const matched = [];
  const missing = [];
  for (const kw of kws) {
    const kwLower = kw.toLowerCase();
    // 第一层：技能表精确命中 / 别名命中 / 互为包含（中文无空格，包含匹配合理）
    const skillHit = [...skillMap.entries()].find(([term]) => {
      const t = term.toLowerCase();
      return t === kwLower || t.includes(kwLower) || kwLower.includes(t);
    });
    if (skillHit) {
      overlapScore += Math.max(0.4, skillHit[1]);
      matched.push(kw);
      continue;
    }
    // 第二层：经历文本印证（业务能力词在实习职责 / 项目描述中出现）
    if (userCorpus && userCorpus.includes(kw)) {
      overlapScore += 0.6;
      matched.push(kw);
      continue;
    }
    missing.push(kw);
  }
  // 分母取 min(关键词数, 6)：避免长关键词列表稀释得分
  const score = Math.min(100, Math.round((overlapScore / Math.min(kws.length, 6)) * 100));
  const out = { score, matched, missing };
  if (matched.length >= 2) {
    out.reason = `技能关键词命中 ${matched.length}/${kws.length}（${matched.slice(0, 4).join('、')}）`;
  } else if (matched.length === 1) {
    out.reason = `技能关键词命中 ${matched[0]}`;
  }
  return out;
}

/** 城市匹配：用户目标城市 ↔ JD 地点（归一化后取交集） */
function scoreLocation(job, profile) {
  if (!Array.isArray(job.locations) || job.locations.length === 0) return { score: null };
  const cities = profile.targetCities || [];
  if (cities.length === 0) return { score: 70 }; // 未填写，中性
  if (cities.includes('不限')) return { score: 80, reason: '城市不限' };

  const jobCities = new Set((job.locations || []).map(normalizeLocation).filter(Boolean));
  const target = new Set(cities);
  const hitCities = [...jobCities].filter(c => target.has(c));
  if (hitCities.length > 0) {
    return { score: 100, reason: `地点匹配：${hitCities.join('、')}` };
  }
  return { score: 0 };
}

/** 届次匹配：用户毕业年份 ↔ JD program */
function scoreProgram(job, profile) {
  const year = String(profile.graduationYear || '');
  const prog = job.program || '';
  if (!prog) return { score: null };
  if (!year) return { score: 60 };

  const batchYear = prog.match(/(\d{4})/)?.[1] || null;
  if (prog === '日常实习') {
    // 实习对届次宽容，均鼓励（转正通道）
    return { score: 70, reason: '实习岗位，可作转正通道' };
  }
  if (batchYear === year) return { score: 100, reason: `${prog}与你${year}届身份匹配` };
  if (batchYear) {
    const diff = Number(batchYear) - Number(year);
    if (diff === -1) return { score: 40 }; // 上一届批次（已过季，如2027届看2026校招）
    return { score: 10 }; // 差两届以上，基本无资格
  }
  return { score: 50 };
}

/** 企业类型：trackWeight + targetTracks 双信号 */
function scoreCompany(job, profile) {
  const rawType = String(job.companyType || '').trim();
  const sourceTypes = {
    '央国企': 'soe',
    '国企': 'soe',
    '事业单位': 'public',
    '外企': 'foreign',
    '外企/合资': 'foreign',
    '合资': 'foreign',
    '互联网': 'internet',
  };
  const type = sourceTypes[rawType] || COMPANY_TYPE[job.company];
  if (!type) return { score: null };
  const tracks = profile.targetTracks || [];

  const preferences = {
    internet: ['互联网大厂', '中小厂/创业公司', '外企'],
    soe: ['央国企'],
    public: ['事业单位/高校'],
    foreign: ['外企'],
  };
  if (tracks.length > 0 && !preferences[type]?.some(pref => tracks.includes(pref))) return { score: 25 };
  if (type === 'public') return { score: tracks.length > 0 ? 100 : 75, reason: '事业单位岗位类别' };
  if (type === 'foreign') return { score: tracks.length > 0 ? 100 : 75, reason: '外企/合资岗位类别' };

  // 信号二：trackWeight 细分倾向
  const table = {
    '强烈倾向互联网': { internet: 100, soe: 20 },
    '略倾向互联网': { internet: 90, soe: 45 },
    '两边都行': { internet: 80, soe: 80 },
    '略倾向央国企': { internet: 45, soe: 90 },
    '强烈倾向央国企': { internet: 20, soe: 100 },
  };
  const row = table[profile.trackWeight];
  if (!row) return { score: 75, reason: type === 'soe' ? '央国企岗位' : '互联网岗位' }; // 未填倾向，中性偏好
  const score = row[type];
  if (score >= 90) return { score, reason: type === 'soe' ? '符合你的央国企偏好' : '符合你的互联网偏好' };
  return { score };
}

/** 经验相关：用户经历语料 ↔ JD 文本 的字符 bigram 相似度 */
function scoreExperience(job, userCorpus) {
  if (!Array.isArray(job.responsibilities) || job.responsibilities.length === 0) return { score: null };
  if (!userCorpus || userCorpus.trim().length < 20) return { score: 50 }; // 经历太少，中性
  const jdText = [job.title, ...job.responsibilities].join('\n');
  if (!jdText.trim()) return { score: 50 };

  const a = bigrams(userCorpus);
  const b = bigrams(jdText);
  let inter = 0;
  for (const g of a) if (b.has(g)) inter++;
  const union = a.size + b.size - inter;
  const jaccard = union > 0 ? inter / union : 0;
  // Jaccard 原始值通常 0.05-0.35，×400 映射到 20-100 区间
  const score = Math.min(100, Math.round(jaccard * 400));
  if (score >= 60) return { score, reason: '过往经历与 JD 职责文本相似度较高' };
  return { score };
}

// ══════════════════════════════════════════════════════════
// 五、单岗匹配与批量匹配
// ══════════════════════════════════════════════════════════

/** 画像加成：该 JD track 对应的最佳角色在 roleFit 中达到 strong（>=75）时 +5 分 */
function portraitBonus(job, portrait) {
  if (!portrait || !Array.isArray(portrait.roleFit)) return 0;
  const candidates = portrait.roleFit.filter(f => ROLE_TRACK[f.role] === job.track && f.level === 'strong');
  return candidates.length > 0 ? 5 : 0;
}

/** 从 JD keywords 中找出用户真正未覆盖的项（技能表 + 经历文本均未命中）。
 *  与 scoreSkills 的 matched 集保持一致：被经历印证的关键词不算缺口。 */
function findGapNotes(job, skillMap, userCorpus, profile) {
  const missing = (job.keywords || []).filter(kw => {
    const kwLower = kw.toLowerCase();
    // 技能表命中 → 不算缺口
    const skillHit = [...skillMap.keys()].some(t => {
      const tl = t.toLowerCase();
      return tl === kwLower || tl.includes(kwLower) || kwLower.includes(tl);
    });
    if (skillHit) return false;
    // 经历文本印证 → 不算缺口（与 scoreSkills 第二层一致）
    if (userCorpus && userCorpus.includes(kw)) return false;
    return true;
  });
  const selfMarked = (profile.skillGaps || '').split(/[\n、,，]/).map(s => s.trim()).filter(Boolean);
  const notes = [];
  for (const kw of missing.slice(0, 3)) {
    const selfHit = selfMarked.some(g => g && (g.includes(kw) || kw.includes(g)));
    notes.push(selfHit ? `JD 要求「${kw}」—— 你已在已知缺口中标注，建议评估是否补齐` : `JD 要求「${kw}」，技能栈与经历中暂未体现`);
  }
  return notes;
}

/**
 * 匹配单个岗位。
 * @param {Object} job - JD（jd-library.json 的 job 结构）
 * @param {Object} profile - 用户档案
 * @param {Object} [portrait] - 画像（analyzePortrait 产物，用于加成）
 * @param {Map<string, number>} [skillMap] - 预提取的技能表（性能优化：批量调用时传入）
 * @returns {{job: Object, score: number, level: string, reasons: string[], gaps: string[], dimScores: Object, dataCoverage: number, confidence: string}}
 */
export function matchJob(job, profile, portrait, skillMap) {
  const skills = skillMap ?? extractUserSkills(profile);
  const corpus = buildUserCorpus(profile);

  const dims = {
    direction: scoreDirection(job, profile),
    skills: scoreSkills(job, skills, corpus),
    location: scoreLocation(job, profile),
    program: scoreProgram(job, profile),
    company: scoreCompany(job, profile),
    experience: scoreExperience(job, corpus),
  };

  let weightedScore = 0;
  let availableWeight = 0;
  for (const [key, dim] of Object.entries(dims)) {
    if (dim.score === null || dim.score === undefined) continue;
    weightedScore += dim.score * DIM_WEIGHTS[key];
    availableWeight += DIM_WEIGHTS[key];
  }
  let score = availableWeight > 0 ? weightedScore / availableWeight : 50;
  score += portraitBonus(job, portrait);
  score = Math.max(0, Math.min(100, Math.round(score)));
  const dataCoverage = availableWeight;
  const confidence = dataCoverage === 100 ? 'complete' : 'limited';

  // 理由：按维度得分降序取 top 3（只保留有 reason 的）
  const reasons = Object.entries(dims)
    .sort((x, y) => (y[1].score ?? -1) - (x[1].score ?? -1))
    .filter(([, d]) => d.reason && d.score >= 60)
    .slice(0, 3)
    .map(([, d]) => d.reason);
  if (confidence === 'limited') reasons.push('岗位资料有限（覆盖率 ' + dataCoverage + '%），当前分数仅按可用维度计算');

  const level = score >= 75 ? 'strong' : score >= 60 ? 'medium' : 'weak';

  return {
    job,
    score,
    level,
    reasons,
    gaps: findGapNotes(job, skills, corpus, profile),
    dimScores: Object.fromEntries(Object.entries(dims).map(([k, d]) => [k, d.score])),
    dataCoverage,
    confidence,
  };
}

/**
 * 批量匹配 + 排序。
 * @param {Array} jobs - JD 数组（应先经过 applyDealBreakers 过滤）
 * @param {Object} profile - 用户档案
 * @param {Object} [portrait] - 画像
 * @returns {Array} 按 score 降序的结果数组（matchJob 返回值）
 */
export function matchAll(jobs, profile, portrait) {
  const skillMap = extractUserSkills(profile);
  return jobs
    .map(job => matchJob(job, profile, portrait, skillMap))
    .sort((a, b) => b.score - a.score);
}
