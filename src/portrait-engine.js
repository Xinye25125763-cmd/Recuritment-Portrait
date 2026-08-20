/**
 * 秋招画像系统 · 画像分析引擎
 * 从原始档案数据生成结构化人才画像
 */

// ── 雷达维度定义 ──
export const RADAR_DIMS = [
  { key: 'dataAnalysis',    label: '数据分析' },
  { key: 'businessAnalysis', label: '经营分析' },
  { key: 'businessInsight',  label: '商业洞察' },
  { key: 'dataEngineering',  label: '数据工程' },
  { key: 'modeling',         label: '预测建模' },
  { key: 'audit',            label: '审计合规' },
  { key: 'productSense',     label: '产品思维' },
];

// ── 岗位匹配模板：weights 为各雷达维度的权重（和应为1）──
export const ROLE_TEMPLATES = [
  { role: '商业分析师',       weights: { dataAnalysis: 0.25, businessAnalysis: 0.25, businessInsight: 0.2,  dataEngineering: 0.15, modeling: 0.05, productSense: 0.1  } },
  { role: '数据分析师',       weights: { dataAnalysis: 0.3,  dataEngineering: 0.25, businessAnalysis: 0.15, modeling: 0.15,         businessInsight: 0.1,  productSense: 0.05 } },
  { role: 'BI分析师',         weights: { dataEngineering: 0.3, businessAnalysis: 0.25, dataAnalysis: 0.2,    businessInsight: 0.15,  modeling: 0.05, productSense: 0.05 } },
  { role: '战略投资分析师',   weights: { businessInsight: 0.3, audit: 0.25,            businessAnalysis: 0.2, dataAnalysis: 0.15,      modeling: 0.05, productSense: 0.05 } },
  { role: '咨询分析师',       weights: { businessInsight: 0.3, dataAnalysis: 0.25,      businessAnalysis: 0.2, productSense: 0.1,       dataEngineering: 0.1,  modeling: 0.05 } },
  { role: '产品经理',         weights: { productSense: 0.45,  businessInsight: 0.2,     dataAnalysis: 0.1,     businessAnalysis: 0.05, dataEngineering: 0.1,  modeling: 0.1  } },
  { role: '审计师',           weights: { audit: 0.4,          dataAnalysis: 0.2,        businessAnalysis: 0.15, businessInsight: 0.1,  dataEngineering: 0.1,  modeling: 0.05 } },
];

// ── 大厂列表 ──
const BIGCOS = ['美团', '字节', '腾讯', '阿里', '百度', '京东', '滴滴', '快手', '拼多多', '小红书', '网易'];

/**
 * 核心分析函数：输入原始档案，输出完整画像
 * @param {Object} data — 原始档案数据
 * @returns {Object} 画像对象
 */
export function analyzePortrait(data) {
  const interns = (data.internships || []).filter(i => i.company);
  const skills = ((data.skillsProficient || '') + ' ' + (data.skillsFamiliar || '')).toLowerCase();

  // ── 1. 标签 ──
  const tags = [];
  tags.push(data.highestDegree || '硕士');
  if (data.gradSchool) tags.push(data.gradSchool);
  if (data.ugSchool && data.ugSchool !== data.gradSchool) tags.push(data.ugSchool);
  tags.push('审计+数据复合背景');
  if (skills.includes('sql')) tags.push('SQL');
  if (skills.includes('tableau')) tags.push('Tableau');
  tags.push('经营分析');
  if (interns.some(i => (i.responsibilities || '').includes('预测') || (i.deepDivePoints || '').includes('预测'))) {
    tags.push('预测建模');
  }
  (data.targetDirections || []).slice(0, 3).forEach(d => tags.push(d));

  // ── 2. 经历亮点提取 ──
  function extractHighlights(item) {
    const h = [];
    const r = (item.responsibilities || '').trim();
    if (!r) return h;
    const lines = r.split('\n').filter(l => l.trim());
    if (lines[0]) {
      h.push(lines[0].replace(/^\d+[、.．]\s*/, '').trim());
    }
    if (item.metrics) h.push('成果：' + item.metrics.trim());
    return h;
  }

  // ── 3. 雷达评分（基于文本推断）──
  const radar = {};

  let da = 0;
  if (skills.includes('sql')) da++;
  if (interns.some(i => (i.responsibilities || '').includes('亿') || (i.responsibilities || '').includes('万'))) da++;
  if (interns.some(i => (i.responsibilities || '').includes('拆解') || (i.responsibilities || '').includes('漏斗') || (i.responsibilities || '').includes('归因'))) da++;
  if (interns.some(i => (i.responsibilities || '').includes('AOV') || (i.responsibilities || '').includes('UV') || (i.responsibilities || '').includes('RFM'))) da++;
  if (interns.some(i => (i.responsibilities || '').includes('AB') || (i.metrics || '').includes('%'))) da++;
  radar.dataAnalysis = Math.min(5, da);

  let ba = 0;
  if (interns.some(i => (i.responsibilities || '').includes('日报') || (i.responsibilities || '').includes('周报'))) ba++;
  if (interns.some(i => (i.responsibilities || '').includes('监控') || (i.responsibilities || '').includes('指标'))) ba++;
  if (interns.some(i => (i.responsibilities || '').includes('归因') || (i.responsibilities || '').includes('拆解'))) ba++;
  if (interns.some(i => (i.responsibilities || '').includes('策略') || (i.responsibilities || '').includes('建议'))) ba++;
  if (interns.some(i => (i.responsibilities || '').includes('推动') || (i.responsibilities || '').includes('落地'))) ba++;
  radar.businessAnalysis = Math.min(5, ba);

  let bi = 0;
  if (interns.some(i => (i.background || '').trim())) bi++;
  if (interns.some(i => (i.responsibilities || '').includes('定位') || (i.responsibilities || '').includes('识别'))) bi++;
  if (interns.some(i => (i.responsibilities || '').includes('建议') || (i.responsibilities || '').includes('策略'))) bi++;
  if (interns.some(i => (i.responsibilities || '').includes('推动') || (i.responsibilities || '').includes('优化'))) bi++;
  if (interns.some(i => (i.responsibilities || '').includes('协同') || (i.responsibilities || '').includes('跨'))) bi++;
  radar.businessInsight = Math.min(5, bi);

  let de = 0;
  if (skills.includes('sql')) de++;
  if (interns.some(i => (i.responsibilities || '').includes('清洗') || (i.responsibilities || '').includes('处理'))) de++;
  if (interns.some(i => (i.responsibilities || '').includes('自动') || (i.responsibilities || '').includes('AI'))) de++;
  if (skills.includes('tableau') || interns.some(i => (i.techStack || '').includes('Tableau'))) de++;
  if (interns.some(i => (i.responsibilities || '').includes('搭建') || (i.responsibilities || '').includes('框架'))) de++;
  radar.dataEngineering = Math.min(5, de);

  let mo = 0;
  if (interns.some(i => (i.responsibilities || '').includes('预测') || (i.deepDivePoints || '').includes('预测'))) mo++;
  if (interns.some(i => (i.responsibilities || '').includes('模型') || (i.responsibilities || '').includes('搭建'))) mo++;
  if (interns.some(i => (i.responsibilities || '').includes('迭代') || (i.responsibilities || '').includes('优化'))) mo++;
  if (interns.some(i => (i.responsibilities || '').includes('偏差') || (i.responsibilities || '').includes('%'))) mo++;
  if (interns.some(i => (i.responsibilities || '').includes('应用') || (i.metrics || '').includes('%'))) mo++;
  radar.modeling = Math.min(5, mo);

  let au = 0;
  if (interns.some(i => i.company.includes('事务所') || i.company.includes('审计'))) au++;
  if (interns.some(i => (i.responsibilities || '').includes('核查') || (i.responsibilities || '').includes('核对'))) au++;
  if (interns.some(i => (i.responsibilities || '').includes('底稿') || (i.responsibilities || '').includes('报告'))) au++;
  if (interns.some(i => i.company.includes('教育部') || i.company.includes('监管'))) au++;
  if (interns.some(i => (i.responsibilities || '').includes('风险') || (i.responsibilities || '').includes('异常'))) au++;
  radar.audit = Math.min(5, au);

  let ps = 0;
  if (interns.some(i => (i.responsibilities || '').includes('产品') || (i.responsibilities || '').includes('工具'))) ps++;
  if (interns.some(i => (i.responsibilities || '').includes('需求') || (i.responsibilities || '').includes('转化'))) ps++;
  if (interns.some(i => (i.responsibilities || '').includes('自动') || (i.responsibilities || '').includes('标准化'))) ps++;
  if (interns.some(i => (i.responsibilities || '').includes('协同') || (i.responsibilities || '').includes('产研'))) ps++;
  if (interns.some(i => (i.background || '').includes('全链路') || (i.responsibilities || '').includes('全链路'))) ps++;
  radar.productSense = Math.min(5, ps);

  // ── 4. 岗位匹配（加权雷达分 + 加分项）──
  const hasBigCo = interns.some(i => BIGCOS.some(c => i.company.includes(c)));
  const hasProjects = data.projects && data.projects.filter(p => p.name).length > 0;
  const roleFit = ROLE_TEMPLATES.map(rt => {
    let weighted = 0;
    Object.entries(rt.weights).forEach(([k, w]) => { weighted += (radar[k] || 0) * w; });
    let score = (weighted / 5) * 70;
    const reasons = [];
    let bonus = 0;
    if ((data.targetDirections || []).some(d => rt.role.includes(d) || d.includes(rt.role.replace(/师|分析师/g, '')))) {
      bonus += 5; reasons.push('与目标求职方向匹配');
    }
    if (data.highestDegree === '硕士') { bonus += 2; }
    if (interns.length >= 4) { bonus += 3; reasons.push(`${interns.length}段实习，经历丰富`); }
    if (hasProjects) { bonus += 3; }
    if (hasBigCo) { bonus += 3; reasons.push('有大厂实习背书'); }
    score = Math.min(95, Math.round(score + Math.min(20, bonus)));
    const topDims = Object.entries(rt.weights).sort((a, b) => b[1] - a[1]).slice(0, 3);
    topDims.forEach(([k, w]) => {
      const val = radar[k];
      const label = RADAR_DIMS.find(d => d.key === k).label;
      if (val >= 4) reasons.push(`${label}突出（${val}/5）`);
      else if (val >= 3) reasons.push(`${label}良好（${val}/5）`);
    });
    const level = score >= 75 ? 'strong' : score >= 60 ? 'medium' : 'weak';
    return { role: rt.role, score, level, reasons: [...new Set(reasons)].slice(0, 3) };
  }).sort((a, b) => b.score - a.score);
  roleFit.forEach((f, i) => { if (i < 3) f.isTop = true; });

  // ── 5. 优势与短板 ──
  const strengths = [];
  if (radar.dataAnalysis >= 4) strengths.push('数据基本功扎实：能处理亿级数据量，熟练运用SQL进行多维度拆解与归因分析');
  if (radar.businessAnalysis >= 4) strengths.push('经营分析体系化：有日报/周报框架搭建经验，能覆盖指标监控→异常定位→策略建议全链路');
  if (radar.modeling >= 3) strengths.push('自驱探索意识强：主动搭建DAU预测模型，具备从0到1的建模与迭代能力');
  if (interns.length >= 4) strengths.push(`实习经历丰富且多元：${interns.length}段实习覆盖互联网数据运营、电商分析、政府监管、投行尽调、审计合规，跨行业视角广`);
  if (radar.audit >= 3 && radar.dataAnalysis >= 3) strengths.push('审计+数据复合背景：既懂财务合规又懂数据驱动，在需要风控意识的岗位（如战略投资、风控、内审）有独特优势');
  if ((data.targetDirections || []).length >= 3) strengths.push('目标方向清晰：对数据分析与产品经理均有深入思考，不是盲目海投');

  const gaps = [];
  if (radar.modeling < 4) gaps.push('预测建模深度有限：目前仅有一个DAU预测项目，建议补充时间序列/机器学习相关项目或课程');
  if (!skills.includes('python')) gaps.push('Python 尚未出现在技能栈：数据分析/产品方向普遍要求 Python（pandas/numpy），建议补充');
  if (!interns.some(i => i.company.includes('字节') || i.company.includes('腾讯') || i.company.includes('阿里') || i.company.includes('百度'))) {
    gaps.push('缺少头部互联网大厂实习背书：当前实习以美团（境外业务）和唯品会为主，建议争取一段更核心的互联网中台/策略实习');
  }
  if (radar.productSense < 4) gaps.push('产品经理核心经验不足：虽有产品化思维（AI Skill），但缺少正式的产品实习，PRD/用户调研/AB test 全流程经验待补');
  if (!data.projects || data.projects.filter(p => p.name).length === 0) {
    gaps.push('项目经历空白：建议在画像系统或GitHub上补充1-2个完整的数据分析/预测建模项目，作为面试深挖素材');
  }
  if (!data.papers && !data.honorsNational) gaps.push('学术/竞赛亮点不突出：审计专硕背景在纯数据岗位竞争力有限，建议通过项目或竞赛补齐差异化');

  // ── 6. 一句话定位 ──
  const pitch = `${data.gradSchool || ''}${data.highestDegree || '硕士'}，${data.gradMajor || '审计'}背景，具备从大盘监控到门店级下钻的完整经营分析能力，能独立搭建预测模型并推动业务落地。${interns.length}段实习覆盖互联网数据运营、电商分析、政府监管与审计合规，擅长将数据洞察转化为可执行策略。目标方向：${(data.targetDirections || []).slice(0, 3).join('、')}。`;

  // ── 7. 投递建议 ──
  const topRoles = roleFit.filter(r => r.level === 'strong').map(r => r.role);
  const advice = `<strong>第一梯队（优先投递）：</strong>${topRoles.slice(0, 3).join('、')}。你的数据分析+经营分析双强背景与这些岗位高度契合，面试时应重点讲美团Keeta的亿级数据处理与唯品会的转化率优化案例。<br><br>
<strong>第二梯队（有策略地投）：</strong>${roleFit.filter(r => r.level === 'medium').slice(0, 2).map(r => r.role).join('、')}。这些岗位需要补充特定经验，建议针对每个岗位JD量身定制简历侧重点。<br><br>
<strong>注意事项：</strong>（1）所有涉及"预测模型"的简历描述需准备好被追问建模细节（特征工程、评估指标、迭代逻辑）；（2）缺少头部大厂核心实习是当前最大短板，建议秋招前再争取一段中台/策略实习，或把GitHub上的项目打磨到能讲15分钟；（3）产品经理方向投递时，需要把"AI Skill提效"包装成完整的"需求分析→方案设计→落地迭代"故事。`;

  return {
    tags,
    elevatorPitch: pitch,
    radar,
    roleFit,
    strengths,
    gaps,
    advice,
    extractHighlights,
    _autoRoleFit: roleFit.map(r => ({ ...r })),
  };
}

/**
 * 应用自定义覆盖到自动生成的画像
 * @param {Object} base — analyzePortrait 生成的画像
 * @param {Object} custom — 用户自定义配置
 * @returns {Object} 合并后的画像
 */
export function applyCustomOverrides(base, custom) {
  if (!custom || Object.keys(custom).length === 0) return base;
  const out = JSON.parse(JSON.stringify(base));

  // 雷达评分覆盖
  if (custom.radar) {
    Object.entries(custom.radar).forEach(([k, v]) => {
      if (v !== '' && v !== null && v !== undefined) out.radar[k] = parseFloat(v);
    });
  }

  // 岗位分数覆盖 & 隐藏
  if (custom.roleScores || custom.disabledRoles) {
    out.roleFit = out.roleFit.map(f => {
      const customScore = custom.roleScores?.[f.role];
      if (customScore !== '' && customScore !== null && customScore !== undefined) {
        f.score = Math.min(100, Math.max(0, parseInt(customScore)));
        f.level = f.score >= 75 ? 'strong' : f.score >= 60 ? 'medium' : 'weak';
      }
      return f;
    }).filter(f => !(custom.disabledRoles || []).includes(f.role));
    out.roleFit.forEach((f, i) => { f.isTop = i < 3; });
  }

  // 文本覆盖
  if (custom.elevatorPitch) out.elevatorPitch = custom.elevatorPitch;
  if (custom.tags) out.tags = custom.tags.split('/').map(s => s.trim()).filter(Boolean);
  if (custom.strengths) out.strengths = custom.strengths.split('\n').map(s => s.trim()).filter(Boolean);
  if (custom.gaps) out.gaps = custom.gaps.split('\n').map(s => s.trim()).filter(Boolean);

  return out;
}
