/**
 * 经历挖掘引擎（Experience Miner）
 *
 * 纯前端规则引擎，基于用户档案和目标岗位JD，通过对话式引导
 * 帮助用户把「做过的事」翻译成「JD想看到的话」。
 *
 * 核心能力：
 * 1. 三档分析：已覆盖 / 可挖掘 / 完全缺失
 * 2. 对话引导：预定义问题树，逐步收集事实
 * 3. 文案生成：STAR法则模板填充，基于确认过的事实
 * 4. 五维评估：相关性、量化、影响力、专业性、可读性
 * 5. 会话管理：localStorage 持久化
 *
 * 设计原则：
 * - AI 不编造信息：任何文案只基于用户明确确认的事实
 * - 事实确认前置：每个 bullet point 标注数据来源
 * - 拒绝幻觉：缺少数据时降低描述强度，不编造数字
 */

const STORAGE_KEY = 'qiuzhao_mining_sessions';
const INTENTION_KEY = 'qiuzhao_intentions';

/* ═══════════════════════════════════════════════════════════
   一、三档分析
   ═══════════════════════════════════════════════════════════ */

export function analyze(job, profile, matchResult) {
  const keywords = (job.keywords || []).map(k => k.trim()).filter(Boolean);
  if (!keywords.length) return [];

  const experiences = collectExperiences(profile);
  const corpus = buildCorpus(experiences);
  const skillMap = buildSkillMap(profile);
  const minedMap = buildMinedMap(profile);

  return keywords.map(kw => {
    const kwLower = kw.toLowerCase();

    // 1. 检查是否已挖掘（有生成的文案）
    const minedHit = minedMap.has(kw);
    if (minedHit) {
      return {
        keyword: kw,
        tier: 'covered',
        reason: '已生成挖掘文案',
        source: 'mined',
        minedBullet: minedMap.get(kw)
      };
    }

    // 2. 检查技能表是否命中（工具类 keyword）
    const skillHit = skillMap.has(kwLower) ||
      [...skillMap.keys()].some(s => s.includes(kwLower) || kwLower.includes(s));
    if (skillHit) {
      return {
        keyword: kw,
        tier: 'covered',
        reason: '技能表已标注',
        source: 'skill',
        skillLevel: skillMap.get(kwLower) || skillMap.get([...skillMap.keys()].find(s => s.includes(kwLower) || kwLower.includes(s)))
      };
    }

    // 3. 检查经历文本是否命中（业务类 keyword）
    const textHit = corpus.toLowerCase().includes(kwLower);
    if (textHit) {
      // 找出哪段经历包含这个 keyword
      const matchedExps = experiences.filter(e =>
        buildCorpus([e]).toLowerCase().includes(kwLower)
      );
      return {
        keyword: kw,
        tier: 'mineable',
        reason: '经历文本有相关痕迹，可深度挖掘',
        source: 'experience',
        matchedExperiences: matchedExps.map(e => ({
          id: e.id,
          type: e.type,
          title: e.type === 'internship' ? `${e.company} · ${e.role}` : e.name,
          matchedHighlight: e.highlights?.find(h => h.toLowerCase().includes(kwLower)) || null
        }))
      };
    }

    // 4. 完全缺失
    return {
      keyword: kw,
      tier: 'missing',
      reason: '经历中未体现，需要补充',
      source: 'none'
    };
  });
}

function collectExperiences(profile) {
  const exps = [];
  (profile.internships || []).forEach((e, i) => {
    exps.push({ ...e, type: 'internship', id: `intern_${i}` });
  });
  (profile.projects || []).forEach((e, i) => {
    exps.push({ ...e, type: 'project', id: `project_${i}` });
  });
  return exps;
}

function buildCorpus(experiences) {
  return experiences.map(e => {
    const parts = [];
    if (e.company) parts.push(e.company);
    if (e.role) parts.push(e.role);
    if (e.name) parts.push(e.name);
    if (e.highlights) parts.push(...e.highlights);
    if (e.description) parts.push(e.description);
    return parts.join(' ');
  }).join(' ');
}

function buildSkillMap(profile) {
  const map = new Map();
  (profile.skillList || []).forEach(s => {
    if (s.name && s.level) {
      map.set(s.name.toLowerCase(), s.level);
    }
  });
  return map;
}

function buildMinedMap(profile) {
  const map = new Map();
  const exps = collectExperiences(profile);
  exps.forEach(e => {
    (e._mined || []).forEach(m => {
      if (m.keyword && m.bullet) {
        map.set(m.keyword, m.bullet);
      }
    });
  });
  return map;
}

/* ═══════════════════════════════════════════════════════════
   二、问题树（QUESTION_TREES）
   ═══════════════════════════════════════════════════════════ */

const QUESTION_TREES = {
  'AB实验': {
    steps: [
      {
        id: 'has_experiment',
        question: '你做过任何对照组实验或效果对比分析吗？',
        type: 'choice',
        options: ['做过对照实验', '做过效果对比但没有严格对照', '没有']
      },
      {
        id: 'metrics',
        question: '实验关注的核心指标是什么？转化率？留存率？还是其他？',
        type: 'text',
        condition: answers => ['做过对照实验', '做过效果对比但没有严格对照'].some(o => answers.has_experiment?.includes(o))
      },
      {
        id: 'sample_size',
        question: '实验覆盖了多少用户/样本？',
        type: 'text',
        condition: answers => ['做过对照实验', '做过效果对比但没有严格对照'].some(o => answers.has_experiment?.includes(o))
      },
      {
        id: 'result',
        question: '实验结果如何？有没有具体的提升数据？',
        type: 'text',
        condition: answers => ['做过对照实验', '做过效果对比但没有严格对照'].some(o => answers.has_experiment?.includes(o))
      },
      {
        id: 'impact',
        question: '这个实验结论推动了什么业务决策或产品上线？',
        type: 'text',
        condition: answers => ['做过对照实验', '做过效果对比但没有严格对照'].some(o => answers.has_experiment?.includes(o))
      }
    ]
  },

  '指标体系': {
    steps: [
      {
        id: 'has_metrics',
        question: '你搭建或维护过业务指标体系吗？',
        type: 'choice',
        options: ['从零搭建过', '在现有体系上补充过指标', '只用过现成的看板/报表']
      },
      {
        id: 'metrics_scope',
        question: '覆盖了多少个核心指标？分了几层（如北极星指标、过程指标、监控指标）？',
        type: 'text',
        condition: answers => ['从零搭建过', '在现有体系上补充过指标'].some(o => answers.has_metrics?.includes(o))
      },
      {
        id: 'metrics_tool',
        question: '用什么工具实现的？SQL + 报表平台？还是数据看板？',
        type: 'text',
        condition: answers => ['从零搭建过', '在现有体系上补充过指标'].some(o => answers.has_metrics?.includes(o))
      },
      {
        id: 'metrics_impact',
        question: '指标体系上线后，帮助业务发现了什么问题或做了什么决策？',
        type: 'text',
        condition: answers => ['从零搭建过', '在现有体系上补充过指标'].some(o => answers.has_metrics?.includes(o))
      }
    ]
  },

  '用户增长': {
    steps: [
      {
        id: 'has_growth',
        question: '你做过用户增长相关的工作吗？比如拉新、促活、留存提升？',
        type: 'choice',
        options: ['做过，有明确的增长目标', '做过相关分析但不是增长方向', '没有']
      },
      {
        id: 'growth_channel',
        question: '通过什么渠道或手段实现增长？（如活动运营、渠道投放、产品优化）',
        type: 'text',
        condition: answers => answers.has_growth?.includes('做过，有明确的增长目标')
      },
      {
        id: 'growth_metrics',
        question: '增长的核心指标是什么？DAU、留存率、转化率？提升了多少？',
        type: 'text',
        condition: answers => answers.has_growth?.includes('做过，有明确的增长目标')
      },
      {
        id: 'growth_method',
        question: '用了什么分析方法？漏斗分析？ cohort 分析？还是实验验证？',
        type: 'text',
        condition: answers => answers.has_growth?.includes('做过，有明确的增长目标')
      }
    ]
  },

  '数据驱动': {
    steps: [
      {
        id: 'has_driven',
        question: '你的工作成果有没有直接驱动过业务决策或产品迭代？',
        type: 'choice',
        options: ['有，分析结论被采纳并落地', '有建议但被采纳程度不清楚', '没有']
      },
      {
        id: 'driven_example',
        question: '举一个具体的例子：你发现了什么数据异常或洞察，最终推动了什么改变？',
        type: 'text',
        condition: answers => answers.has_driven?.includes('有')
      },
      {
        id: 'driven_stakeholders',
        question: '这个决策涉及哪些协作方？你是如何说服他们采纳数据结论的？',
        type: 'text',
        condition: answers => answers.has_driven?.includes('有')
      }
    ]
  },

  '商业分析': {
    steps: [
      {
        id: 'has_biz',
        question: '你做过商业分析或经营分析类的工作吗？比如市场分析、收入分析、成本分析？',
        type: 'choice',
        options: ['做过，有明确的商业目标', '做过数据分析但商业属性不强', '没有']
      },
      {
        id: 'biz_scope',
        question: '分析的对象是什么？市场规模、竞品动态、营收结构、还是成本优化？',
        type: 'text',
        condition: answers => answers.has_biz?.includes('做过')
      },
      {
        id: 'biz_method',
        question: '用了什么分析方法？对比分析、趋势分析、还是拆解归因？',
        type: 'text',
        condition: answers => answers.has_biz?.includes('做过')
      },
      {
        id: 'biz_result',
        question: '分析结果带来了什么商业价值？比如发现了新的增长点、优化了成本结构？',
        type: 'text',
        condition: answers => answers.has_biz?.includes('做过')
      }
    ]
  },

  '策略制定': {
    steps: [
      {
        id: 'has_strategy',
        question: '你参与过策略制定或策略评估的工作吗？比如制定运营策略、产品策略？',
        type: 'choice',
        options: ['主导或独立制定过策略', '参与过策略讨论和评估', '没有']
      },
      {
        id: 'strategy_problem',
        question: '当时面临的核心问题是什么？',
        type: 'text',
        condition: answers => answers.has_strategy?.includes('策略')
      },
      {
        id: 'strategy_analysis',
        question: '你基于什么数据或分析得出策略建议？',
        type: 'text',
        condition: answers => answers.has_strategy?.includes('策略')
      },
      {
        id: 'strategy_outcome',
        question: '策略落地后的结果如何？',
        type: 'text',
        condition: answers => answers.has_strategy?.includes('策略')
      }
    ]
  },

  '数据挖掘': {
    steps: [
      {
        id: 'has_mining',
        question: '你做过数据挖掘或机器学习相关的工作吗？比如用户分群、预测模型、推荐算法？',
        type: 'choice',
        options: ['做过，有实际模型上线', '做过分析性的探索但没有模型落地', '没有']
      },
      {
        id: 'mining_model',
        question: '用了什么算法或方法？聚类？分类？回归？还是特征工程？',
        type: 'text',
        condition: answers => answers.has_mining?.includes('做过')
      },
      {
        id: 'mining_data',
        question: '处理的数据规模有多大？特征维度多少？',
        type: 'text',
        condition: answers => answers.has_mining?.includes('做过')
      },
      {
        id: 'mining_impact',
        question: '模型上线后带来了什么业务效果？',
        type: 'text',
        condition: answers => answers.has_mining?.includes('做过')
      }
    ]
  },

  '产品运营': {
    steps: [
      {
        id: 'has_operation',
        question: '你做过产品运营或活动运营的工作吗？',
        type: 'choice',
        options: ['做过，有完整的运营项目', '做过数据支持运营的工作', '没有']
      },
      {
        id: 'operation_goal',
        question: '运营的核心目标是什么？拉新、促活、转化、还是留存？',
        type: 'text',
        condition: answers => answers.has_operation?.includes('做过')
      },
      {
        id: 'operation_method',
        question: '具体做了哪些运营动作？活动策划、内容运营、还是用户分层？',
        type: 'text',
        condition: answers => answers.has_operation?.includes('做过')
      },
      {
        id: 'operation_result',
        question: '运营活动的数据结果如何？',
        type: 'text',
        condition: answers => answers.has_operation?.includes('做过')
      }
    ]
  },

  '竞品分析': {
    steps: [
      {
        id: 'has_competitor',
        question: '你做过竞品分析或行业研究吗？',
        type: 'choice',
        options: ['做过系统的竞品分析报告', '零散了解过竞品但没有系统分析', '没有']
      },
      {
        id: 'competitor_scope',
        question: '分析了哪些竞品？对比了哪些维度？',
        type: 'text',
        condition: answers => answers.has_competitor?.includes('做过')
      },
      {
        id: 'competitor_insight',
        question: '分析得出了什么有价值的洞察或建议？',
        type: 'text',
        condition: answers => answers.has_competitor?.includes('做过')
      }
    ]
  },

  '项目管理': {
    steps: [
      {
        id: 'has_pm',
        question: '你主导或参与过项目的全生命周期管理吗？从需求到上线？',
        type: 'choice',
        options: ['主导过完整项目', '参与过项目执行但不是负责人', '没有']
      },
      {
        id: 'pm_scope',
        question: '项目的规模有多大？涉及多少协作方？周期多长？',
        type: 'text',
        condition: answers => answers.has_pm?.includes('主导') || answers.has_pm?.includes('参与')
      },
      {
        id: 'pm_challenge',
        question: '项目过程中遇到的最大挑战是什么？如何解决的？',
        type: 'text',
        condition: answers => answers.has_pm?.includes('主导') || answers.has_pm?.includes('参与')
      },
      {
        id: 'pm_result',
        question: '项目最终的结果如何？按时交付了吗？达成了什么目标？',
        type: 'text',
        condition: answers => answers.has_pm?.includes('主导') || answers.has_pm?.includes('参与')
      }
    ]
  }
};

// 默认问题树（通用版）
const DEFAULT_QUESTION_TREE = {
  steps: [
    {
      id: 'has_relevant',
      question: '你的经历中有没有和「{keyword}」相关的工作？',
      type: 'choice',
      options: ['有，做过相关工作', '有间接关联但不是核心工作', '没有']
    },
    {
      id: 'relevant_detail',
      question: '具体做了什么？用了什么方法？',
      type: 'text',
      condition: answers => answers.has_relevant?.includes('有')
    },
    {
      id: 'relevant_result',
      question: '结果如何？有没有数据可以量化？',
      type: 'text',
      condition: answers => answers.has_relevant?.includes('有')
    },
    {
      id: 'relevant_impact',
      question: '这个成果对业务或团队有什么影响？',
      type: 'text',
      condition: answers => answers.has_relevant?.includes('有')
    }
  ]
};

export function getQuestionTree(keyword) {
  return QUESTION_TREES[keyword] || DEFAULT_QUESTION_TREE;
}

export function getNextQuestion(session, keyword, profile) {
  const tree = getQuestionTree(keyword);
  const answeredIds = new Set((session.qaLog || []).map(q => q.stepId));

  for (const step of tree.steps) {
    if (answeredIds.has(step.id)) continue;

    // 检查条件是否满足
    if (step.condition) {
      const answers = {};
      (session.qaLog || []).forEach(q => { answers[q.stepId] = q.answer; });
      if (!step.condition(answers)) continue;
    }

    // 个性化问题文本（替换变量）
    let question = step.question;
    const experience = findExperience(session.experienceId, profile);
    if (experience) {
      const highlight = experience.highlights?.[0] || '这段经历';
      const title = experience.type === 'internship'
        ? `${experience.company} · ${experience.role}`
        : experience.name;
      question = question
        .replace(/\{experience\}/g, title)
        .replace(/\{highlight\}/g, highlight)
        .replace(/\{keyword\}/g, keyword);
    }

    return { ...step, question, totalSteps: tree.steps.length };
  }

  return null; // 所有问题已回答
}

function findExperience(id, profile) {
  if (!profile) return null;
  const [type, idx] = id.split('_');
  const arr = type === 'intern' ? profile.internships : profile.projects;
  return arr?.[parseInt(idx)] || null;
}

/* ═══════════════════════════════════════════════════════════
   三、文案生成（STAR 法则模板填充）
   ═══════════════════════════════════════════════════════════ */

const BULLET_TEMPLATES = {
  'AB实验': {
    full: '{method}，样本量：{sample_size}，指标：{metric}，结果：{lift}，业务影响：{impact}。',
    simple: '{method}，指标：{metric}，结果：{lift}。',
    minimal: '{method}，结果：{lift}。'
  },
  '指标体系': {
    full: '{scope}，指标范围：{count}，使用工具：{tool}，监控频率：{frequency}，业务影响：{impact}。',
    simple: '{scope}，指标范围：{count}，业务影响：{impact}。',
    minimal: '{scope}，业务影响：{impact}。'
  },
  '用户增长': {
    full: '渠道：{channel}，范围：{scope}，样本量：{sample_size}，指标：{metric}，结果：{lift}，业务影响：{impact}。',
    simple: '渠道：{channel}，指标：{metric}，结果：{lift}。',
    minimal: '指标：{metric}，结果：{lift}。'
  },
  '数据驱动': {
    full: '分析依据：{analysis}，发现：{insight}，协作方：{stakeholders}，业务影响：{impact}。',
    simple: '分析依据：{analysis}，发现：{insight}，业务影响：{impact}。',
    minimal: '发现：{insight}，业务影响：{impact}。'
  },
  '商业分析': {
    full: '分析范围：{scope}，方法：{method}，发现：{insight}，业务影响：{impact}。',
    simple: '分析范围：{scope}，发现：{insight}，业务影响：{impact}。',
    minimal: '分析范围：{scope}，发现：{insight}。'
  },
  '策略制定': {
    full: '分析依据：{analysis}，策略范围：{scope}，协作方：{stakeholders}，业务影响：{impact}。',
    simple: '策略范围：{scope}，协作方：{stakeholders}，业务影响：{impact}。',
    minimal: '策略范围：{scope}，业务影响：{impact}。'
  },
  '数据挖掘': {
    full: '方法：{method}，工作范围：{scope}，数据量：{sample_size}，指标：{metric}，结果：{lift}，业务影响：{impact}。',
    simple: '方法：{method}，工作范围：{scope}，指标：{metric}，结果：{lift}。',
    minimal: '方法：{method}，工作范围：{scope}。'
  },
  '产品运营': {
    full: '工作范围：{scope}，方法：{method}，指标：{metric}，结果：{lift}，业务影响：{impact}。',
    simple: '工作范围：{scope}，方法：{method}，指标：{metric}，结果：{lift}。',
    minimal: '工作范围：{scope}，方法：{method}。'
  },
  '竞品分析': {
    full: '分析范围：{scope}，对比维度：{dimensions}，发现：{insight}，业务影响：{impact}。',
    simple: '分析范围：{scope}，对比维度：{dimensions}，发现：{insight}。',
    minimal: '分析范围：{scope}，发现：{insight}。'
  },
  '项目管理': {
    full: '项目范围：{scope}，协作方：{stakeholders}，挑战：{challenge}，业务影响：{impact}。',
    simple: '项目范围：{scope}，协作方：{stakeholders}，业务影响：{impact}。',
    minimal: '项目范围：{scope}，挑战：{challenge}。'
  }
};

const DEFAULT_TEMPLATES = {
  full: '方法：{method}，工作范围：{scope}，业务影响：{impact}。',
  simple: '方法：{method}，工作范围：{scope}，结果：{lift}。',
  minimal: '工作范围：{scope}，结果：{lift}。'
};

export function generateBullet(session, keyword, experience) {
  const templates = BULLET_TEMPLATES[keyword] || DEFAULT_TEMPLATES;
  const answers = {};
  (session.qaLog || []).forEach(q => { answers[q.stepId] = q.answer; });
  if (!Object.values(answers).some(isUsableAnswer)) return '';

  const template = selectBestTemplate(templates, answers);
  const values = {
    scope: extractScope(experience, answers),
    sample_size: answers.sample_size,
    metric: answers.metrics || answers.growth_metrics || answers.metric,
    lift: answers.result,
    impact: answers.impact || answers.metrics_impact || answers.biz_result || answers.pm_result,
    tool: answers.metrics_tool,
    count: answers.metrics_scope,
    method: answers.method || answers.growth_method || answers.biz_method || answers.mining_model || answers.has_experiment,
    insight: answers.insight || answers.competitor_insight || answers.biz_result,
    stakeholders: answers.driven_stakeholders || answers.pm_stakeholders,
    analysis: answers.driven_example || answers.strategy_analysis,
    challenge: answers.pm_challenge,
    dimensions: answers.competitor_scope,
    channel: answers.growth_channel,
    frequency: answers.frequency || answers.metrics_frequency,
  };
  if (values.insight && values.insight === values.impact) values.impact = null;

  let bullet = renderGroundedTemplate(template, values);
  if (!bullet) bullet = formatAnswersAsFacts(answers);
  return deduplicateBullet(bullet);
}

function selectBestTemplate(templates, answers) {
  const answerCount = Object.values(answers).filter(isUsableAnswer).length;
  if (answerCount >= 4 && templates.full) return templates.full;
  if (answerCount >= 2 && templates.simple) return templates.simple;
  return templates.minimal || templates.full || '完成相关工作。';
}

function extractScope(experience, answers) {
  return answers.scope || answers.biz_scope || answers.strategy_scope || answers.pm_scope ||
    (experience && (experience.business || experience.name)) || null;
}

function isUsableAnswer(answer) {
  if (answer === null || answer === undefined) return false;
  const text = String(answer).trim();
  return Boolean(text) && !/^(没有|跳过|否|无|未做过|不适用)$/.test(text);
}

function renderGroundedTemplate(template, values) {
  const parts = template.match(/[^，。；]+[，。；]?/g) || [];
  const rendered = [];
  for (const part of parts) {
    const tokens = [...part.matchAll(/\{([a-z_]+)\}/g)].map(match => match[1]);
    if (!tokens.length || !tokens.every(key => isUsableAnswer(values[key]))) continue;
    rendered.push(part.replace(/\{([a-z_]+)\}/g, (_match, key) => String(values[key]).trim()));
  }
  const text = rendered.join('')
    .replace(/[，；]\s*[，；。]/g, '。')
    .replace(/[，；]{2,}/g, '，')
    .replace(/^[，；。]+|[，；。]+$/g, '')
    .trim();
  return text ? text + '。' : '';
}

function formatAnswersAsFacts(answers) {
  const labels = {
    has_experiment: '实验情况',
    has_metrics: '指标工作',
    has_growth: '增长工作',
    has_driven: '数据应用',
    has_biz: '商业分析',
    has_strategy: '策略工作',
    has_mining: '数据挖掘',
    has_operation: '运营工作',
    has_competitor: '竞品分析',
    has_pm: '项目参与',
    has_relevant: '相关经历',
  };
  return Object.entries(answers)
    .filter(([, answer]) => isUsableAnswer(answer))
    .map(([key, answer]) => (labels[key] || key) + '：' + String(answer).trim())
    .join('；') + '。';
}

/** 去除 bullet 中连续重复的子串（>=8 字） */
function deduplicateBullet(text) {
  if (!text || text.length < 16) return text;
  let result = text;
  // 滑动窗口，从长到短检测重复
  for (let len = Math.floor(result.length / 2); len >= 8; len--) {
    for (let i = 0; i <= result.length - len * 2; i++) {
      const sub = result.substring(i, i + len);
      const next = result.substring(i + len, i + len + len);
      if (sub === next) {
        // 移除一次重复
        result = result.substring(0, i + len) + result.substring(i + len + len);
        // 缩短窗口重新扫描
        return deduplicateBullet(result);
      }
    }
  }
  return result;
}

/* ═══════════════════════════════════════════════════════════
   四、五维评估
   ═══════════════════════════════════════════════════════════ */

export function evaluateFiveDimensions(bullet, keyword, job) {
  const result = {
    relevance: { score: 0, max: 20, comment: '' },
    quantification: { score: 0, max: 20, comment: '' },
    impact: { score: 0, max: 20, comment: '' },
    professionalism: { score: 0, max: 20, comment: '' },
    readability: { score: 0, max: 20, comment: '' }
  };

  // 1. 相关性：是否包含 keyword 或同义词
  const bulletLower = bullet.toLowerCase();
  const keywordLower = keyword.toLowerCase();
  if (bulletLower.includes(keywordLower)) {
    result.relevance.score = 18;
    result.relevance.comment = '直接包含JD关键词，相关性高';
  } else {
    // 检查同义词
    const synonyms = getSynonyms(keyword);
    if (synonyms.some(s => bulletLower.includes(s.toLowerCase()))) {
      result.relevance.score = 14;
      result.relevance.comment = '使用了同义表达，相关性良好';
    } else {
      result.relevance.score = 8;
      result.relevance.comment = '未直接提及关键词，建议优化措辞';
    }
  }

  // 2. 量化：是否包含具体数字
  const numbers = bullet.match(/\d+(?:\.\d+)?[万亿千百kKwW%倍]/g);
  if (numbers && numbers.length >= 2) {
    result.quantification.score = 18;
    result.quantification.comment = `包含${numbers.length}处量化数据，说服力强`;
  } else if (numbers && numbers.length === 1) {
    result.quantification.score = 14;
    result.quantification.comment = '包含1处量化数据，建议补充更多';
  } else {
    result.quantification.score = 6;
    result.quantification.comment = '缺少量化数据，建议补充具体数字';
  }

  // 3. 影响力：是否有业务结果或决策推动
  const impactKeywords = ['驱动', '推动', '支撑', '上线', '迭代', '优化', '提升', '落地', '采纳', '决策', '上线'];
  const hasImpact = impactKeywords.some(k => bullet.includes(k));
  if (hasImpact) {
    result.impact.score = 16;
    result.impact.comment = '体现了业务影响力';
  } else {
    result.impact.score = 8;
    result.impact.comment = '缺少业务结果描述，建议补充影响力';
  }

  // 4. 专业性：术语使用是否准确
  const professionalTerms = ['指标体系', '对照实验', '漏斗分析', '归因', '拆解', ' cohort', 'SQL', 'Python', 'A/B', 'AB实验', 'ROI', 'GMV', 'DAU', '留存', '转化'];
  const usedTerms = professionalTerms.filter(t => bullet.toLowerCase().includes(t.toLowerCase()));
  if (usedTerms.length >= 2) {
    result.professionalism.score = 16;
    result.professionalism.comment = `使用了${usedTerms.length}个专业术语，表达专业`;
  } else if (usedTerms.length === 1) {
    result.professionalism.score = 12;
    result.professionalism.comment = '专业术语使用较少，建议补充';
  } else {
    result.professionalism.score = 8;
    result.professionalism.comment = '缺少专业术语，建议引入行业关键词';
  }

  // 5. 可读性：长度适中，无冗余
  const charCount = bullet.length;
  if (charCount >= 40 && charCount <= 80) {
    result.readability.score = 18;
    result.readability.comment = '长度适中，信息密度高';
  } else if (charCount > 80) {
    result.readability.score = 12;
    result.readability.comment = '偏长，建议精简到80字以内';
  } else if (charCount < 25) {
    result.readability.score = 10;
    result.readability.comment = '过短，信息不足，建议扩充';
  } else {
    result.readability.score = 14;
    result.readability.comment = '长度基本合适';
  }

  // 总分
  const total = Object.values(result).reduce((sum, d) => sum + d.score, 0);
  result.total = total;
  result.max = 100;
  result.level = total >= 80 ? 'excellent' : total >= 60 ? 'good' : total >= 40 ? 'fair' : 'poor';

  return result;
}

function getSynonyms(keyword) {
  const map = {
    'AB实验': ['对照实验', '实验验证', '效果验证', '实验设计', '分组测试'],
    '指标体系': ['指标监控', '数据看板', '核心指标', '北极星指标', '过程指标'],
    '用户增长': ['增长运营', '拉新', '促活', '留存提升', '增长策略'],
    '数据驱动': ['数据支撑', '数据决策', '分析驱动', '量化支撑'],
    '商业分析': ['经营分析', '业务分析', '市场分析', '营收分析'],
    '策略制定': ['策略规划', '策略设计', '策略评估', '策略迭代'],
    '数据挖掘': ['机器学习', '模型构建', '算法应用', '特征工程', '用户分群'],
    '产品运营': ['运营策略', '活动策划', '用户运营', '内容运营'],
    '竞品分析': ['竞争分析', '行业研究', '市场对比', '竞品调研'],
    '项目管理': ['项目推进', '项目协调', '跨团队协作', '项目交付']
  };
  return map[keyword] || [];
}

/* ═══════════════════════════════════════════════════════════
   五、会话管理
   ═══════════════════════════════════════════════════════════ */

export function createSession(jobId, jobTitle, keyword, experienceId, experienceType) {
  return {
    id: `session_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    jobId,
    jobTitle,
    keyword,
    experienceId,
    experienceType,
    status: 'active',
    startedAt: new Date().toISOString(),
    completedAt: null,
    qaLog: [],
    generatedBullets: [],
    userEditedBullet: null,
    isAdopted: false,
    fiveDimEval: null
  };
}

export function saveSession(session) {
  const all = loadAllSessions();
  const idx = all.findIndex(s => s.id === session.id);
  if (idx >= 0) {
    all[idx] = session;
  } else {
    all.push(session);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  return session;
}

export function loadSessions(jobId) {
  return loadAllSessions().filter(s => s.jobId === jobId);
}

export function loadAllSessions() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch (e) {
    console.error('load sessions error', e);
    return [];
  }
}

export function deleteSession(sessionId) {
  const all = loadAllSessions().filter(s => s.id !== sessionId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function clearSessions() {
  localStorage.removeItem(STORAGE_KEY);
}

/* ═══════════════════════════════════════════════════════════
   六、意向岗位管理
   ═══════════════════════════════════════════════════════════ */

export function addIntention(job) {
  const data = loadIntentionsRaw();
  const existing = data.jobs.find(j => j.jobId === job.id);
  if (existing) {
    if (!existing.jobSnapshot) {
      existing.jobSnapshot = snapshotJob(job);
      localStorage.setItem(INTENTION_KEY, JSON.stringify(data));
    }
  } else {
    data.jobs.push({
      jobId: job.id,
      company: job.company,
      title: job.title,
      track: job.track,
      locations: job.locations,
      program: job.program,
      score: job._matchScore || 0,
      level: job._matchLevel || 'medium',
      confidence: job._matchConfidence || 'limited',
      dataCoverage: job._matchCoverage ?? null,
      jobSnapshot: snapshotJob(job),
      addedAt: new Date().toISOString(),
      status: 'mining'
    });
    localStorage.setItem(INTENTION_KEY, JSON.stringify(data));
  }
  return data;
}

function snapshotJob(job) {
  const fields = [
    'id', 'company', 'companyType', 'industry', 'title', 'track', 'locations', 'program',
    'employmentType', 'descriptionType', 'sourceType', 'source', 'description',
    'sourceListing', 'responsibilities', 'keywords', 'business', 'url', 'deadline', 'crawlDate'
  ];
  const snapshot = {};
  for (const field of fields) {
    if (job[field] === undefined) continue;
    const value = job[field];
    snapshot[field] = Array.isArray(value) ? [...value] : value;
  }
  return snapshot;
}

export function removeIntention(jobId) {
  const data = loadIntentionsRaw();
  data.jobs = data.jobs.filter(j => j.jobId !== jobId);
  localStorage.setItem(INTENTION_KEY, JSON.stringify(data));
  return data;
}

export function getIntentions() {
  return loadIntentionsRaw().jobs;
}

export function isIntention(jobId) {
  return loadIntentionsRaw().jobs.some(j => j.jobId === jobId);
}

export function getIntentionProgress(jobId) {
  const sessions = loadSessions(jobId);
  const intention = loadIntentionsRaw().jobs.find(j => j.jobId === jobId);
  if (!intention) return null;

  const totalKeywords = intention._totalKeywords || 5; // 需要外部传入
  const covered = sessions.filter(s => s.isAdopted).length;
  const inProgress = sessions.filter(s => s.status === 'active' && !s.isAdopted).length;

  return {
    totalKeywords,
    covered,
    inProgress,
    missing: totalKeywords - covered - inProgress,
    minedBullets: sessions.filter(s => s.isAdopted).length
  };
}

function loadIntentionsRaw() {
  try {
    return JSON.parse(localStorage.getItem(INTENTION_KEY) || '{"version":1,"jobs":[]}');
  } catch (e) {
    return { version: 1, jobs: [] };
  }
}

/* ═══════════════════════════════════════════════════════════
   七、保存到 Profile
   ═══════════════════════════════════════════════════════════ */

export function saveToProfile(session, profile) {
  if (!session || !session.isAdopted || !session.generatedBullets.length) return null;

  const experience = findExperience(session.experienceId, profile);
  if (!experience) return null;

  if (!experience._mined) experience._mined = [];

  // 去重：同 keyword 只保留最新
  experience._mined = experience._mined.filter(m => m.keyword !== session.keyword);
  experience._mined.push({
    keyword: session.keyword,
    bullet: session.userEditedBullet || session.generatedBullets[0],
    sourceSession: session.id,
    createdAt: new Date().toISOString()
  });

  return profile;
}

export function loadMinedFromProfile(profile, experienceId) {
  const experience = findExperience(experienceId, profile);
  return experience?._mined || [];
}

/* ═══════════════════════════════════════════════════════════
   八、辅助函数
   ═══════════════════════════════════════════════════════════ */

export function getAdoptedBullets(profile) {
  const bullets = [];
  const exps = collectExperiences(profile);
  exps.forEach(e => {
    (e._mined || []).forEach(m => {
      bullets.push({
        keyword: m.keyword,
        bullet: m.bullet,
        experience: e.type === 'internship' ? `${e.company} · ${e.role}` : e.name,
        createdAt: m.createdAt
      });
    });
  });
  return bullets;
}

export function getMiningStats(profile) {
  const sessions = loadAllSessions();
  const adopted = sessions.filter(s => s.isAdopted);
  return {
    totalSessions: sessions.length,
    completed: adopted.length,
    totalBullets: adopted.reduce((sum, s) => sum + (s.generatedBullets?.length || 0), 0),
    byKeyword: adopted.reduce((map, s) => {
      map[s.keyword] = (map[s.keyword] || 0) + 1;
      return map;
    }, {})
  };
}

// 兼容导出
export const ExperienceMiner = {
  analyze,
  getQuestionTree,
  getNextQuestion,
  generateBullet,
  evaluateFiveDimensions,
  createSession,
  saveSession,
  loadSessions,
  loadAllSessions,
  deleteSession,
  clearSessions,
  addIntention,
  removeIntention,
  getIntentions,
  isIntention,
  getIntentionProgress,
  saveToProfile,
  loadMinedFromProfile,
  getAdoptedBullets,
  getMiningStats
};
