# 经历挖掘引擎设计方案

## 产品定位

放在 Phase 3（岗位匹配）之后，解决**「匹配完了，但简历不知道怎么改」**的痛点。

用户选定一个感兴趣的岗位后，系统分析该岗位的 JD 要求，对比用户现有经历（实习/项目），找出可挖掘的包装点，通过对话式引导帮助用户把「做过的事」翻译成「JD 想看到的话」，最终生成可直接放进简历的 STAR 格式 bullet points。

全部纯前端实现，数据不出浏览器。

---

## 用户流程

```
用户在 match.html 浏览岗位
  → 点击「💡 经历挖掘」按钮
    → 弹出挖掘面板，显示三档分析：
       🟢 已覆盖：经历里已有，建议换个说法突出
       🟡 可挖掘：经历有相关但表述不够 JD 化，点击展开对话
       🔴 完全缺失：经历里没有，需要新建或学习
    → 用户点击某个 🟡 可挖掘点
      → 进入对话引导（3-5轮问答）
      → 系统生成 bullet point 预览
      → 用户确认「采用」或「再改改」
    → 文案保存到 profile 对应经历项中
    → 回到岗位列表，继续看下一个岗位
```

---

## 数据模型

### 1. 挖掘会话（Mining Session）

```javascript
{
  id: "session_20260819_abc123",
  jobId: "A167767",
  jobTitle: "经营分析 - 抖音电商",
  experienceId: "intern_0",          // 关联 profile.internships 索引
  experienceType: "internship",       // internship | project
  keyword: "AB实验",                  // 当前挖掘的 JD keyword
  status: "active",                  // active | completed | abandoned
  startedAt: "2026-08-19T10:30:00",
  completedAt: null,

  // 对话记录
  qaLog: [
    {
      step: 1,
      question: "这个岗位要求『AB实验』。你在美团的实习里提到『独立设计活动效果评估指标体系』，你做过任何对照组实验或效果对比分析吗？",
      answer: "做过，我对比了两个运营策略的转化率",
      type: "choice"   // choice | text | number | confirm
    },
    {
      step: 2,
      question: "具体数据是什么？比如策略A的转化率 vs 策略B？",
      answer: "策略A 12%，策略B 8%",
      type: "text"
    },
    {
      step: 3,
      question: "样本量多大？",
      answer: "大概5万用户",
      type: "text"
    }
  ],

  // 生成结果
  generatedBullets: [
    "设计对照实验评估两种运营策略效果，覆盖5万用户，验证策略A转化率较基准提升50%（12% vs 8%），驱动策略迭代上线。"
  ],
  userEditedBullet: null,  // 用户修改后的版本
  isAdopted: false         // 是否已保存到 profile
}
```

### 2. Profile 中的经历增强字段

在 `profile.internships[i]` 和 `profile.projects[i]` 中增加 `_mined` 数组：

```javascript
{
  company: "美团",
  role: "数据分析实习生",
  highlights: [
    "独立设计活动效果评估指标体系",
    "SQL处理亿级数据"
  ],
  _mined: [
    {
      keyword: "AB实验",
      bullet: "设计对照实验评估两种运营策略效果，覆盖5万用户，验证策略A转化率较基准提升50%（12% vs 8%），驱动策略迭代上线。",
      sourceSession: "session_20260819_abc123",
      createdAt: "2026-08-19T10:35:00"
    }
  ]
}
```

保存到 localStorage 的 `qiuzhao_profile_v4` 中，与现有数据结构兼容（旧版本导入时 `_mined` 为空数组）。

### 3. 全局会话索引

localStorage 单独存一份索引，方便在 match.html 中显示「这个岗位你挖过哪些 keyword」：

```javascript
localStorage.setItem('qiuzhao_mining_sessions', JSON.stringify({
  'A167767': ['session_20260819_abc123', 'session_20260819_def456'],
  'A65532B': []
}));
```

---

## 引擎架构（`src/experience-miner.js`）

### 核心模块

```javascript
export const ExperienceMiner = {
  // 1. 分析：找出三档匹配关系
  analyze(job, profile, matchResult),

  // 2. 对话：获取当前步骤的问题
  getNextQuestion(session, keyword, experience),

  // 3. 生成：基于 qaLog 组装 STAR 文案
  generateBullet(session, keyword, experience),

  // 4. 保存：写回 profile
  saveToProfile(session, profile),

  // 5. 加载：读取历史会话
  loadSessions(jobId),
  saveSession(session)
};
```

### 三档分析算法

```javascript
function analyze(job, profile, matchResult) {
  const keywords = job.keywords || [];
  const experiences = [
    ...profile.internships.map((e, i) => ({...e, type: 'internship', id: `intern_${i}`})),
    ...profile.projects.map((e, i) => ({...e, type: 'project', id: `project_${i}`}))
  ];

  const corpus = buildUserCorpus(experiences); // 所有经历文本拼接

  return keywords.map(kw => {
    const kwLower = kw.toLowerCase();

    // 检查技能表是否命中
    const skillHit = profile.skillList?.some(s =>
      s.name.toLowerCase() === kwLower || s.name.toLowerCase().includes(kwLower)
    );

    // 检查经历文本是否命中
    const textHit = corpus.toLowerCase().includes(kwLower);

    // 检查是否有已挖掘的文案
    const minedHit = experiences.some(e =>
      e._mined?.some(m => m.keyword === kw)
    );

    if (skillHit || minedHit) {
      return { keyword: kw, tier: 'covered', reason: '技能表或已挖掘文案已覆盖' };
    }

    if (textHit) {
      return { keyword: kw, tier: 'mineable', reason: '经历文本有相关痕迹，可深度挖掘' };
    }

    return { keyword: kw, tier: 'missing', reason: '经历中未体现，需要新建或学习' };
  });
}
```

### 对话问题树

每个 keyword 预定义一组问题模板，根据用户回答动态组装：

```javascript
const QUESTION_TREES = {
  'AB实验': {
    steps: [
      {
        id: 'has_experiment',
        question: '你在「{experience}」中提到「{highlight}」，你做过任何对照组实验或效果对比分析吗？',
        type: 'choice',
        options: ['做过对照实验', '做过效果对比但没有严格对照', '没有']
      },
      {
        id: 'metrics',
        question: '实验关注的核心指标是什么？转化率？留存率？还是其他？',
        type: 'text',
        condition: (answers) => answers.has_experiment?.includes('做过')
      },
      {
        id: 'sample_size',
        question: '实验覆盖了多少用户/样本？',
        type: 'text',
        condition: (answers) => answers.has_experiment?.includes('做过')
      },
      {
        id: 'result',
        question: '实验结果如何？有没有具体的提升数据？',
        type: 'text',
        condition: (answers) => answers.has_experiment?.includes('做过')
      },
      {
        id: 'impact',
        question: '这个实验结论推动了什么业务决策或产品上线？',
        type: 'text',
        condition: (answers) => answers.has_experiment?.includes('做过')
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
        condition: (a) => a.has_metrics?.includes('搭建') || a.has_metrics?.includes('补充')
      },
      {
        id: 'metrics_tool',
        question: '用什么工具实现的？SQL + 报表平台？还是数据看板？',
        type: 'text',
        condition: (a) => a.has_metrics?.includes('搭建') || a.has_metrics?.includes('补充')
      },
      {
        id: 'metrics_impact',
        question: '指标体系上线后，帮助业务发现了什么问题或做了什么决策？',
        type: 'text',
        condition: (a) => a.has_metrics?.includes('搭建') || a.has_metrics?.includes('补充')
      }
    ]
  }

  // ... 更多 keyword 的问题树
};
```

### 文案生成模板（STAR 法则）

每个 keyword 对应一组文案模板，根据用户回答填充变量：

```javascript
const BULLET_TEMPLATES = {
  'AB实验': [
    // 完整版（5个回答都给了）
    '设计{scope}对照实验，覆盖{sample_size}，验证{metric}较{benchmark}提升{lift}，{impact}。',
    // 简化版（缺少 impact）
    '通过{scope}实验验证{metric}效果，样本量{sample_size}，实验组较对照组提升{lift}。',
    // 极简版（只给了基本数据）
    '基于{sample_size}样本开展效果评估，{metric}提升{lift}。'
  ],

  '指标体系': [
    '搭建{scope}指标体系，覆盖{count}个核心指标，通过{tool}实现{frequency}监控，{impact}。',
    '设计并维护{scope}数据看板，整合{count}个过程指标，支撑{impact}。'
  ]
};

function generateBullet(session, keyword) {
  const answers = {};
  session.qaLog.forEach(qa => { answers[qa.stepId] = qa.answer; });

  const templates = BULLET_TEMPLATES[keyword] || BULLET_TEMPLATES['default'];

  // 选择最匹配的模板（根据回答完整度）
  const template = selectBestTemplate(templates, answers);

  // 填充变量
  return template
    .replace(/{scope}/g, answers.scope || '业务')
    .replace(/{sample_size}/g, answers.sample_size || '一定规模')
    .replace(/{metric}/g, answers.metrics || '核心指标')
    .replace(/{lift}/g, answers.result || '显著提升')
    .replace(/{impact}/g, answers.impact || '支撑业务决策')
    .replace(/{tool}/g, answers.metrics_tool || '数据工具')
    .replace(/{count}/g, answers.metrics_count || '多')
    .replace(/{frequency}/g, '定期');
}
```

---

## UI/UX 设计

### 入口：岗位卡片上的「💡 经历挖掘」按钮

放在每个岗位卡片的右上角，与「标记」按钮并排。已挖掘过的岗位显示一个小的徽章数字（如 💡3 表示已生成3条文案）。

### 挖掘面板（弹窗/侧边抽屉）

```
┌─────────────────────────────────────────────┐
│  💡 经历挖掘 · 经营分析 - 抖音电商           │
│  字节跳动 · 2027届校园招聘 · 上海              │
├─────────────────────────────────────────────┤
│                                             │
│  📋 JD 核心要求                             │
│  ┌─────────────────────────────────────┐    │
│  │ 指标体系  ·  A/B实验  ·  SQL        │    │
│  │ 数据驱动  ·  用户增长  ·  商业分析   │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  🟢 已覆盖（3项）                           │
│  ┌─────────────────────────────────────┐    │
│  │ SQL  → 技能表已标注「熟练」           │    │
│  │ 商业分析 → 已挖掘：「基于SQL完成...」 │    │
│  │ 数据驱动 → 经历文本已有体现           │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  🟡 可挖掘（2项）← 点击展开对话            │
│  ┌─────────────────────────────────────┐    │
│  │ 🔍 A/B实验                          │    │
│  │   美团实习里有「效果评估」相关描述，   │    │
│  │   但未明确提到对照实验。               │    │
│  │   [开始挖掘]                        │    │
│  ├─────────────────────────────────────┤    │
│  │ 🔍 指标体系                          │    │
│  │   项目经历里有「搭建监控报表」，        │    │
│  │   可以往「指标体系」方向包装。         │    │
│  │   [开始挖掘]                        │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  🔴 完全缺失（1项）                         │
│  ┌─────────────────────────────────────┐    │
│  │ 用户增长 → 经历中未找到相关痕迹        │    │
│  │ 建议：补充一个增长相关的项目或实习     │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  [关闭面板]                                 │
└─────────────────────────────────────────────┘
```

### 对话界面（内嵌在可挖掘项下方）

```
┌─────────────────────────────────────────────┐
│  🔍 正在挖掘：A/B实验                        │
│  关联经历：美团 · 数据分析实习生             │
│  原始描述：独立设计活动效果评估指标体系      │
├─────────────────────────────────────────────┤
│                                             │
│  🤖 第 1/5 问                               │
│  你在「独立设计活动效果评估指标体系」中提到   │
│  的这段工作，你做过任何对照组实验或           │
│  效果对比分析吗？                            │
│                                             │
│  [○] 做过对照实验                           │
│  [○] 做过效果对比但没有严格对照             │
│  [○] 没有                                   │
│                                             │
│  [下一步]  [跳过这个keyword]                 │
│                                             │
│  ─────────────────────────────────────      │
│  💡 小提示：如果实在没有，可以选择「跳过」，   │
│     系统会帮你标记为「完全缺失」，提醒你后续  │
│     补充。                                  │
└─────────────────────────────────────────────┘
```

### 生成结果预览

```
┌─────────────────────────────────────────────┐
│  ✅ 文案生成完成 · A/B实验                   │
├─────────────────────────────────────────────┤
│                                             │
│  基于你的回答，系统生成以下文案：             │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │ 设计对照实验评估两种运营策略效果，     │    │
│  │ 覆盖5万用户，验证策略A转化率较基准     │    │
│  │ 提升50%（12% vs 8%），驱动策略迭代   │    │
│  │ 上线。                                │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  [直接采用]  [再改改]  [重新回答]           │
│                                             │
│  ─────────────────────────────────────      │
│  📝 如果你想微调，可以直接在文本框里编辑：     │
│  ┌─────────────────────────────────────┐    │
│  │ [设计对照实验评估两种运营策略效果...] │    │
│  └─────────────────────────────────────┘    │
│  [保存到「美团实习」经历中]                  │
│                                             │
└─────────────────────────────────────────────┘
```

---

## 实现计划（分阶段）

### Phase A：经历挖掘引擎核心（`src/experience-miner.js`）

- 实现 `analyze()` 三档分析
- 定义 10-15 个核心 keyword 的问题树（覆盖数据分析/商业分析/产品经理常见要求）
- 实现对话状态机（`getNextQuestion()`）
- 实现文案生成模板（`generateBullet()`）
- 实现 save/load 会话管理
- 冒烟测试：用现有 profile + 3-5 个真实 JD 验证分析结果

### Phase B：match.html 嵌入挖掘面板

- 新增「💡 经历挖掘」按钮（岗位卡片上）
- 新增弹窗/面板组件（三档分析 + 对话界面）
- 对接 `experience-miner.js` API
- 浏览器实测：验证对话流程、文案生成、保存逻辑

### Phase C：文案保存与档案联动

- 挖掘文案保存到 `profile.internships/projects._mined`
- 在 index.html 的经历编辑区显示「已挖掘文案」标签
- 挖掘结果参与 portrait.html 的画像生成（加权重或标记）
- 导出 profile JSON 时包含 `_mined` 数据

---

## 与现有系统的集成点

| 现有文件 | 集成方式 |
|---|---|
| `match.html` | 新增「经历挖掘」按钮 + 挖掘面板弹窗 |
| `src/match-engine.js` | 复用 `scoreSkills()` 和 `findGapNotes()` 的匹配逻辑，作为 `analyze()` 的输入 |
| `index.html` | 经历编辑区显示 `_mined` 文案，支持删除/编辑 |
| `portrait.html` | 画像生成时识别 `_mined` 文案，调整角色适配度 |
| `schema.js` | 版本兼容：`profile.internships[i]._mined` 为可选字段，旧版本导入时自动初始化为空数组 |

---

## 关键设计决策

1. **纯前端规则引擎，不调用外部模型**
   - 原因：隐私优先、零依赖、响应即时
   - 代价：对话深度有限，只能覆盖预定义的 keyword 模板
   - 缓解：keyword 模板库可扩展，用户贡献新模板后可以合并

2. **文案生成基于模板填充，而非自由创作**
   - 原因：保证输出格式一致、可控、符合中文简历习惯
   - 代价：灵活度不如 LLM，但 STAR 法则的结构性反而更强

3. **保存到 profile 而非独立存储**
   - 原因：挖掘成果是简历的一部分，与经历天然绑定
   - 代价：profile JSON 会变大，但一条 bullet 50-100 字节，影响可忽略

---

这个方案的核心价值是**把「抽象的 JD 要求」转化为「具体的经历修改动作」**，填补了匹配结果到简历优化之间的断层。你觉得这个方向对吗？如果认可，我们可以从 Phase A 开始写代码。