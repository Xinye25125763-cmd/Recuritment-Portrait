/**
 * 简历生成引擎 v2
 *
 * 借鉴 ai-job-search /apply 七步流水线的核心机制，重建简历生成过程：
 *
 *   1. 三源事实装配 —— 教育/技能/荣誉/经历全部从 schema v4 真实字段装配
 *      （修复旧版读取 skillList / education / highlights 等不存在的字段导致整块空白）
 *   2. 诚实性边界 —— 「了解」「缺口」档技能不进简历；「暂无量化」占位符不进简历
 *   3. 相关性加权裁剪 —— 每条 bullet 按 相关度×唯一性×叙事负载 打分，
 *      超出篇幅预算从最低分砍起，且把「砍了什么、为什么」透明报告，绝不静默丢弃
 *   4. 需求逐项覆盖表 —— JD 每条 responsibility 都被回应：要么指出被哪条 bullet
 *      覆盖，要么诚实标注缺口，绝不悄悄略过
 *   5. 关键词四态审计 —— 已覆盖 / 近义覆盖 / 有但没写 / 真缺口（诚实缺口绝不塞词）
 *   6. 面试回溯测试 —— bullet 依赖你标记「讲不清楚」(weakPoints) 的经历 → 风险警告
 *   7. 风格 lint —— 弱动词开头、缺量化、句式重复的静态检查（建议清单，不自动改写）
 *
 * 依赖：match-engine.js 的 extractUserSkills（技能权重表，用于「有但没写」判定）
 */

import { extractUserSkills } from './match-engine.js';

// ══════════════════════════════════════════════════════════
// 一、基础工具
// ══════════════════════════════════════════════════════════

/** 弱动词开头清单（lint 用）：这些词弱化贡献，建议改为具体动作 + 产出 */
const WEAK_VERB_STARTS = ['参与', '协助', '配合', '帮助', '学习', '了解'];

/**
 * 多行文本 → 干净的行数组（去掉 "1、" "2." 等编号前缀与空行）。
 */
function splitLines(text) {
  // 防御：兼容数组形式的历史数据
  if (Array.isArray(text)) text = text.join('\n');
  return (text || '')
    .split('\n')
    .map(l => l.replace(/^\s*\d+[、.．)）]?\s*/, '').trim())
    .filter(Boolean);
}

/** 技能行 "Python — 实习中写过 ETL" → "Python" */
function parseSkillName(line) {
  return line.split(/[—–:：|,，]/)[0].trim();
}

/** 归一化用于匹配：去大小写/斜杠/连字符/空格差异（A/B实验 ↔ AB实验） */
function normalizeForMatch(s) {
  return (s || '').toLowerCase().replace(/[\s/／\-—·、]/g, '');
}

/** 字符二元组 Dice 相似度（需求覆盖表的模糊匹配） */
function bigramSim(a, b) {
  const grams = s => {
    const t = normalizeForMatch(s);
    const set = new Set();
    if (t.length < 2) { if (t) set.add(t); return set; }
    for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
    return set;
  };
  const A = grams(a), B = grams(b);
  if (!A.size || !B.size) return 0;
  let hit = 0;
  A.forEach(g => { if (B.has(g)) hit++; });
  return (2 * hit) / (A.size + B.size);
}

/** "2024-09" → "2024.09"；进行中显示至今 */
export function formatDate(val, isOngoing = false) {
  if (!val) return isOngoing ? '至今' : '';
  return String(val).replace(/-/g, '.');
}

// ══════════════════════════════════════════════════════════
// 二、三源事实装配（教育 / 技能 / 荣誉 / 经历）
// ══════════════════════════════════════════════════════════

/** 教育背景：从 schema v4 扁平字段（ugSchool/gradSchool…）装配，最高学历在前 */
function buildEducation(profile) {
  const list = [];
  const isGrad = ['硕士', '博士'].includes(profile.highestDegree);
  if (isGrad && profile.gradSchool) {
    list.push({
      school: profile.gradSchool,
      major: profile.gradMajor,
      degree: profile.highestDegree,
      start: profile.gradStart,
      end: profile.gradEnd,
      gpa: profile.gradGpa || '',
      rank: profile.gradRank || '',
      courses: isGrad ? (profile.mainCourses || '') : '',
    });
  }
  if (profile.ugSchool) {
    list.push({
      school: profile.ugSchool,
      major: profile.ugMajor,
      degree: '本科',
      start: profile.ugStart,
      end: profile.ugEnd,
      gpa: profile.ugGpa || '',
      rank: profile.ugRank || '',
      courses: isGrad ? '' : (profile.mainCourses || ''),
    });
  }
  return list;
}

/**
 * 技能栏：只装「熟练」「熟悉」两档。
 * 「了解」档按 schema 提示不写进简历；「缺口」是待补清单，绝不能出现在简历上。
 */
function buildSkillGroups(profile) {
  const groups = [];
  const prof = [...new Set(splitLines(profile.skillsProficient).map(parseSkillName).filter(Boolean))];
  const fam = [...new Set(splitLines(profile.skillsFamiliar).map(parseSkillName).filter(Boolean))];
  if (prof.length) groups.push({ level: '熟练', items: prof });
  if (fam.length) groups.push({ level: '熟悉', items: fam });
  return groups;
}

/** 荣誉奖项：四个文本域行合并，去除重复 */
function buildAwards(profile) {
  const all = [
    ...splitLines(profile.honorsNational),
    ...splitLines(profile.honorsSchool),
    ...splitLines(profile.scholarships),
    ...splitLines(profile.papers),
  ];
  return [...new Set(all)];
}

/**
 * 经历条目：bullet 三源合并
 *   - 原始职责/工作内容（responsibilities / myWork）
 *   - 量化成果（metrics / result，去掉「暂无量化」占位符）
 *   - 深度挖掘产物（_mined：意向经历定向挖掘出的 STAR bullet，带 keyword 溯源）
 */
function buildExperienceEntries(profile) {
  const entries = [];

  (profile.internships || []).forEach((item, idx) => {
    if (!item.company) return;
    const bullets = [];
    splitLines(item.responsibilities).forEach(t =>
      bullets.push({ text: t, source: 'responsibilities' }));
    splitLines(item.metrics).forEach(t => {
      if (/^暂无量化/.test(t)) return; // 占位符不进简历
      bullets.push({ text: '成果：' + t, source: 'metrics' });
    });
    (item._mined || []).forEach(m => {
      if (m && m.bullet) bullets.push({ text: m.bullet, source: 'mined', keyword: m.keyword });
    });
    if (!bullets.length) return;
    entries.push({
      id: 'intern_' + idx,
      type: 'internship',
      title: [item.company, item.role].filter(Boolean).join(' · '),
      company: item.company, department: item.department || '', role: item.role || '',
      start: item.start, end: item.end,
      isOngoing: !!(item.isOngoing || item.isCurrentlyThere),
      techStack: item.techStack || '',
      weakPoints: (item.weakPoints || '').trim(),
      bullets, relevance: 0,
    });
  });

  (profile.projects || []).forEach((item, idx) => {
    if (!item.name) return;
    const bullets = [];
    splitLines(item.myWork).forEach(t =>
      bullets.push({ text: t, source: 'myWork' }));
    splitLines(item.result).forEach(t => {
      if (/^暂无对外成果/.test(t)) return;
      bullets.push({ text: '成果：' + t, source: 'result' });
    });
    (item._mined || []).forEach(m => {
      if (m && m.bullet) bullets.push({ text: m.bullet, source: 'mined', keyword: m.keyword });
    });
    if (!bullets.length) return;
    entries.push({
      id: 'project_' + idx,
      type: 'project',
      title: item.name,
      name: item.name, myRole: item.myRole || '', teamSize: item.teamSize || '', link: item.link || '',
      start: item.start, end: item.end,
      techStack: item.techStack || '',
      weakPoints: (item.weakPoints || '').trim(),
      bullets, relevance: 0,
    });
  });

  return entries;
}

// ══════════════════════════════════════════════════════════
// 三、相关性加权裁剪（借鉴 ai-job-search Relevance-weighted cutting）
// ══════════════════════════════════════════════════════════

/**
 * bullet 打分 = 相关性 + 叙事负载 + 唯一性
 *   - 相关性：命中该 JD 关键词 +2/个
 *   - 叙事负载：定向挖掘产物 +3；唯一覆盖某关键词的 bullet +1/个
 *   - 唯一性：内容重复（前 24 字指纹相同）-3
 * 经历总分 = 各 bullet 分之和（用于经历排序）。
 */
function scoreBullets(entries, job) {
  const keywords = job?.keywords || [];

  // 统计每个关键词被多少条 bullet 覆盖（找「唯一覆盖者」）
  const kwCount = new Map();
  entries.forEach(e => e.bullets.forEach(b => {
    keywords.forEach(kw => {
      if (b.text.includes(kw)) kwCount.set(kw, (kwCount.get(kw) || 0) + 1);
    });
  }));

  const seen = new Map();
  entries.forEach(e => {
    e.bullets.forEach(b => {
      let score = 0;
      keywords.forEach(kw => {
        if (b.text.includes(kw)) score += 2;
        if (b.text.includes(kw) && kwCount.get(kw) === 1) score += 1;
      });
      if (b.source === 'mined') score += 3;
      const fp = b.text.replace(/\s+/g, '').slice(0, 24);
      if (seen.has(fp)) { score -= 3; b.dup = true; } else seen.set(fp, 1);
      b.score = score;
    });
    e.relevance = e.bullets.reduce((s, b) => s + b.score, 0);
  });
}

/** 篇幅预算档位（bullet 总条数） */
export const BUDGET_PRESETS = {
  compact:  { key: 'compact',  label: '紧凑（一页无忧）', maxBullets: 12 },
  standard: { key: 'standard', label: '标准（约一页）',   maxBullets: 16 },
  full:     { key: 'full',     label: '完整（不裁剪）',   maxBullets: 999 },
};

/**
 * 超出预算时从最低分 bullet 砍起（每段经历至少保留 1 条，避免空标题）。
 * 每一次裁剪都记录进报告——「砍了什么、为什么」，绝不静默丢弃。
 */
function applyBudget(entries, preset) {
  const cutReport = [];
  if (preset.maxBullets >= 999) return cutReport;
  let total = entries.reduce((n, e) => n + e.bullets.length, 0);
  while (total > preset.maxBullets) {
    let target = null;
    entries.forEach(e => {
      if (e.bullets.length <= 1) return;
      e.bullets.forEach(b => {
        if (!target || b.score < target.b.score) target = { e, b };
      });
    });
    if (!target) break; // 全部只剩 1 条，无法再砍
    target.e.bullets = target.e.bullets.filter(x => x !== target.b);
    target.e.relevance -= target.b.score;
    cutReport.push({
      experience: target.e.title,
      text: target.b.text,
      reason: target.b.dup
        ? '与其他条目内容重复（唯一性低）'
        : `与该岗位相关度低（信号分 ${target.b.score}），被更高信号的条目挤出预算`,
    });
    total--;
  }
  return cutReport;
}

// ══════════════════════════════════════════════════════════
// 四、关键词四态审计（借鉴 ai-job-search Step 5d）
// ══════════════════════════════════════════════════════════

/** 用户全档案文本（含未选入简历的经历原文与技能三档），用于「有但没写」判定 */
function buildProfileCorpus(profile) {
  const parts = [];
  (profile.internships || []).forEach(i =>
    parts.push(i.company || '', i.role || '', i.background || '', i.responsibilities || '',
      i.metrics || '', i.techStack || '', i.deepDivePoints || ''));
  (profile.projects || []).forEach(p =>
    parts.push(p.name || '', p.background || '', p.myWork || '', p.difficulty || '',
      p.result || '', p.techStack || ''));
  parts.push(profile.skillsProficient || '', profile.skillsFamiliar || '', profile.skillsKnown || '');
  return parts.join('\n');
}

/** 自报缺口（skillGaps 文本域 → 数组） */
function parseSelfGaps(profile) {
  return (profile.skillGaps || '')
    .split(/[\n、,，;；]/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(normalizeForMatch)
    .filter(s => s.length >= 2);
}

/**
 * 关键词四态审计（升级旧版二元命中/缺失）：
 *   covered           已写进简历（字面命中）
 *   nearCovered       近义覆盖（归一化后命中，如 A/B实验 ↔ AB实验）
 *                     —— ATS 精确匹配可能漏，可考虑补原词
 *   presentNotWritten 档案里有、简历没写 → 提示补写或去深度挖掘
 *   honestGap         你自报的已知缺口 → 诚实呈现，绝不塞词
 *   gap               真缺口
 * 生成前传 resumeText='' 可得到「预生成视角」（有但没写全部亮起）。
 */
export function auditKeywords(job, resumeText, profile, skillMap) {
  const result = { covered: [], nearCovered: [], presentNotWritten: [], honestGap: [], gap: [] };
  const text = resumeText || '';
  const textNorm = normalizeForMatch(text);
  const corpusNorm = normalizeForMatch(buildProfileCorpus(profile));
  const gapList = parseSelfGaps(profile);
  const skillTerms = [...(skillMap || new Map()).keys()].map(normalizeForMatch).filter(s => s.length >= 2);

  (job?.keywords || []).forEach(kw => {
    if (text.includes(kw)) return result.covered.push(kw);
    const kwn = normalizeForMatch(kw);
    if (kwn.length >= 2 && textNorm.includes(kwn)) return result.nearCovered.push(kw);
    const inCorpus = corpusNorm.includes(kwn) ||
      skillTerms.some(s => s.includes(kwn) || kwn.includes(s));
    if (inCorpus) return result.presentNotWritten.push(kw);
    if (gapList.some(g => g.includes(kwn) || kwn.includes(g))) return result.honestGap.push(kw);
    result.gap.push(kw);
  });
  return result;
}

// ══════════════════════════════════════════════════════════
// 五、需求逐项覆盖表（借鉴 ai-job-search "Every requirement gets addressed"）
// ══════════════════════════════════════════════════════════

/**
 * JD 每条 responsibility 逐项回应：
 * 被哪条 bullet 覆盖（关键词命中或语义相似度 ≥ 0.3），否则诚实标注缺口。
 */
function coverRequirements(job, entries) {
  const bullets = [];
  entries.forEach(e => e.bullets.forEach(b => bullets.push({ text: b.text, norm: normalizeForMatch(b.text), exp: e.title })));
  return (job?.responsibilities || []).map(req => {
    const reqNorm = normalizeForMatch(req);
    // 该条需求相关的关键词（归一化后互相包含，解决「A/B 实验」vs「A/B实验」这类写法差异）
    const reqKws = (job.keywords || []).filter(kw => {
      const kwn = normalizeForMatch(kw);
      return kwn.length >= 2 && reqNorm.includes(kwn);
    });
    const hits = bullets
      .map(b => ({
        b,
        s: Math.max(reqKws.some(kw => b.norm.includes(normalizeForMatch(kw))) ? 0.5 : 0, bigramSim(req, b.text)),
      }))
      .filter(x => x.s >= 0.3)
      .sort((x, y) => y.s - x.s)
      .slice(0, 2)
      .map(x => x.b);
    return {
      requirement: req,
      status: hits.length ? 'covered' : 'gap',
      coveredBy: hits,
    };
  });
}

// ══════════════════════════════════════════════════════════
// 六、风格 lint + 面试回溯测试
// ══════════════════════════════════════════════════════════

/** 静态风格检查：弱动词、占位符、缺量化、句式重复。只出建议，不自动改写。 */
function lintBullets(entries) {
  const findings = [];
  entries.forEach(e => e.bullets.forEach(b => {
    const weak = WEAK_VERB_STARTS.find(w => b.text.startsWith(w));
    if (weak) {
      findings.push({
        severity: 'warn', exp: e.title, text: b.text,
        advice: `以「${weak}」开头——弱动词弱化贡献，建议改为具体动作 + 产出（搭建/设计/推动…）`,
      });
    }
    if (b.text.includes('暂无量化')) {
      findings.push({
        severity: 'warn', exp: e.title, text: b.text,
        advice: '包含「暂无量化」占位符——投递前要么补上真实数字，要么删掉这半句',
      });
    } else if (!/\d|%|％/.test(b.text)) {
      findings.push({
        severity: 'info', exp: e.title, text: b.text,
        advice: '没有量化信息——有真实数据请补（规模/频次/覆盖率均可），没有就不强求',
      });
    }
  }));
  // 同一经历内连续 3 条以相同两字开头 → 句式重复
  entries.forEach(e => {
    for (let i = 2; i < e.bullets.length; i++) {
      const a = e.bullets[i - 2].text.slice(0, 2);
      if (a && a === e.bullets[i - 1].text.slice(0, 2) && a === e.bullets[i].text.slice(0, 2)) {
        findings.push({
          severity: 'info', exp: e.title, text: e.bullets[i].text,
          advice: `「${e.title}」连续 3 条以「${a}」开头——句式重复，读起来像模板，建议换写法`,
        });
      }
    }
  });
  return findings;
}

/** 面试回溯测试：简历依赖你标记「讲不清楚」的经历 → 追问风险警告 */
function findBacktrackRisks(entries) {
  return entries
    .filter(e => e.weakPoints)
    .map(e => ({
      experience: e.title,
      weakPoints: e.weakPoints,
      bulletCount: e.bullets.length,
      sample: e.bullets.slice(0, 2).map(b => b.text),
    }));
}

// ══════════════════════════════════════════════════════════
// 七、纯文本输出（修复旧版泄漏 [keyword] 调试标记的缺陷）
// ══════════════════════════════════════════════════════════

function dateRange(start, end, isOngoing) {
  const s = formatDate(start);
  const e = formatDate(end, isOngoing);
  if (!s && !e) return '';
  return `${s || '?'} – ${e || (isOngoing ? '至今' : '?')}`;
}

function toPlainText(data) {
  const lines = [];
  lines.push(data.name || '简历');
  const contacts = [];
  if (data.basic.phone) contacts.push('电话：' + data.basic.phone);
  if (data.basic.email) contacts.push('邮箱：' + data.basic.email);
  if (data.basic.github) contacts.push('GitHub：' + data.basic.github);
  if (data.basic.blog) contacts.push('博客：' + data.basic.blog);
  if (contacts.length) { lines.push(contacts.join(' | ')); lines.push(''); }

  lines.push('【求职意向】');
  lines.push(`目标岗位：${data.targetJob.title} @ ${data.targetJob.company}`);
  lines.push('');

  if (data.education.length) {
    lines.push('【教育背景】');
    data.education.forEach(edu => {
      const range = dateRange(edu.start, edu.end);
      lines.push(`${edu.school} · ${edu.major}（${edu.degree}）${range ? '  ' + range : ''}`);
      if (edu.gpa) lines.push(`GPA：${edu.gpa}`);
      if (edu.rank) lines.push(`专业排名：${edu.rank}`);
      if (edu.courses) lines.push(`主修课程：${edu.courses}`);
    });
    lines.push('');
  }

  if (data.skills.length) {
    lines.push('【专业技能】');
    data.skills.forEach(g => lines.push(`${g.level}：${g.items.join('、')}`));
    lines.push('');
  }

  if (data.internships.length) {
    lines.push('【实习经历】');
    data.internships.forEach(item => {
      const range = dateRange(item.start, item.end, item.isOngoing);
      lines.push(`${item.title}${range ? '  ' + range : ''}`);
      item.bullets.forEach(b => lines.push('· ' + b.text));
    });
    lines.push('');
  }

  if (data.projects.length) {
    lines.push('【项目经历】');
    data.projects.forEach(item => {
      const range = dateRange(item.start, item.end);
      lines.push(`${item.title}${range ? '  ' + range : ''}`);
      item.bullets.forEach(b => lines.push('· ' + b.text));
    });
    lines.push('');
  }

  if (data.awards.length) {
    lines.push('【荣誉奖项】');
    data.awards.forEach(a => lines.push('· ' + a));
    lines.push('');
  }

  return lines.join('\n').trim();
}

// ══════════════════════════════════════════════════════════
// 八、主入口
// ══════════════════════════════════════════════════════════

/**
 * 生成一份针对目标岗位的简历（含透明报告）。
 * @param {Object} profile - schema v4 用户档案（localStorage qiuzhao_profile_v4）
 * @param {Object} job - JD（jd-library.json 的 job 结构）
 * @param {Object} [matchResult] - matchJob() 的返回值（评分闸门用，可省略）
 * @param {Object} [options] - { budget: 'compact'|'standard'|'full' }
 * @returns {{ data: Object, text: string, report: Object }}
 */
export function buildResume(profile, job, matchResult, options = {}) {
  const preset = BUDGET_PRESETS[options.budget] || BUDGET_PRESETS.standard;

  // 1. 三源事实装配
  const education = buildEducation(profile);
  const skills = buildSkillGroups(profile);
  const awards = buildAwards(profile);
  const entries = buildExperienceEntries(profile);

  // 2. 打分 + 预算裁剪 + 按相关度排序
  scoreBullets(entries, job);
  const cutReport = applyBudget(entries, preset);
  entries.sort((a, b) => b.relevance - a.relevance);

  const internships = entries.filter(e => e.type === 'internship');
  const projects = entries.filter(e => e.type === 'project');

  const data = {
    name: profile.name || '',
    basic: {
      phone: profile.phone || '',
      email: profile.email || '',
      github: profile.github || '',
      blog: profile.blog || '',
    },
    targetJob: {
      title: job?.title || '',
      company: job?.company || '',
      matchScore: matchResult?.score ?? null,
    },
    education, skills, internships, projects, awards,
  };
  const text = toPlainText(data);

  // 3. 四项审计
  const skillMap = extractUserSkills(profile);
  const keywordAudit = auditKeywords(job, text, profile, skillMap);
  const requirementCoverage = coverRequirements(job, entries);
  const lint = lintBullets(entries);
  const backtrackRisks = findBacktrackRisks(entries);

  return {
    data,
    text,
    report: {
      budget: { key: preset.key, label: preset.label, maxBullets: preset.maxBullets },
      keptBullets: entries.reduce((n, e) => n + e.bullets.length, 0),
      cut: cutReport,
      keywordAudit,
      requirementCoverage,
      lint,
      backtrackRisks,
    },
  };
}
