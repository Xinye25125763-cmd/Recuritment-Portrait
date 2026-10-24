/**
 * 演示数据档案 —— 用于截图、录屏、公开展示时不暴露真实个人信息
 * 人物：陈默（虚构），2027 届，数据分析方向
 * 访问任意页面加 ?demo=1 参数即可加载此档案，不影响 localStorage 中的真实数据
 */

export const DEMO_PROFILE = {
  name: '陈默',
  gender: '男',
  phone: '138****0000',
  email: 'chenmo@example.com',
  github: 'github.com/demo-chenmo',
  blog: '',

  highestDegree: '硕士',
  ugSchool: '浙江大学',
  ugMajor: '统计学',
  ugStart: '2019-09',
  ugEnd: '2023-06',
  ugGpa: '3.7/4.0',
  ugRank: '前 15%',

  gradSchool: '上海交通大学',
  gradMajor: '应用统计',
  gradStart: '2023-09',
  gradEnd: '2026-06',
  gradGpa: '3.8/4.0',
  gradRank: '',

  mainCourses: '回归分析、时间序列、机器学习、数据库原理、数据挖掘',

  targetDirections: '数据分析、商业分析',
  graduationYear: '2027',
  preferredLocations: '上海、杭州',
  preferredEmployment: '正式',
  targetSalary: '面议',
  careerPlan: '短期深耕数据分析，中长期向数据产品/策略方向发展',

  skillsProficient: 'Python — 主力分析语言，pandas/numpy 日常\nSQL — 复杂查询、窗口函数、性能优化\nExcel — 透视表、VLOOKUP、宏基础\nA/B实验 — 实验设计、显著性检验、结果解读',
  skillsFamiliar: 'Tableau — 经营看板搭建\nHive — 大表取数与优化\nR — 统计建模与可视化',
  skillsKnown: 'Spark — 了解 RDD/SparkSQL 概念，未实际使用',
  skillGaps: 'Tableau 可视化审美、Spark 实战',

  honorsNational: '全国大学生数学建模竞赛省级一等奖',
  honorsSchool: '校级优秀毕业生、优秀学生干部',
  scholarships: '国家励志奖学金（2 次）、学业一等奖学金',
  papers: '',

  internships: [
    {
      company: '蚂蚁集团', department: '数据技术部', role: '数据分析实习生',
      start: '2025-03', end: '2025-08', isOngoing: false, isCurrentlyThere: false,
      background: '负责支付宝商家经营分析，支持千万级商家运营策略',
      responsibilities: '1、搭建商家分层经营指标体系，输出周/月经营日报\n2、设计并执行 A/B实验，评估补贴策略对 GMV 的提升效果\n3、通过漏斗分析定位商家流失环节，推动运营优化',
      metrics: '实验组 GMV 提升 12%，商家流失率下降 3 个百分点',
      techStack: 'Python, SQL, Tableau',
      deepDivePoints: '实验设计的分组均衡性如何保证？\n因果推断与相关性的边界在哪里？',
      weakPoints: '分层实验的方差缩减方法我讲不太清',
      _mined: [
        { keyword: '指标体系', bullet: '从 0 搭建商家经营指标体系，覆盖 GMV、留存、活跃度 12 个核心指标' },
        { keyword: 'A/B实验', bullet: '主导 8 次 A/B实验，单次实验样本量 50 万+，显著性检验 p<0.05' },
      ],
    },
    {
      company: '某快消品牌', department: '电商部', role: '运营数据实习生',
      start: '2024-07', end: '2024-10',
      background: '负责天猫旗舰店日常数据监控与活动复盘',
      responsibilities: '1、每日监控店铺流量与转化数据，产出日报\n2、协助大促活动数据复盘，整理可视化报告',
      metrics: '暂无量化',
      techStack: 'Excel, SQL',
      weakPoints: '',
      _mined: [],
    },
  ],

  projects: [
    {
      name: '校园图书馆借阅预测系统', myRole: '数据建模', teamSize: '3',
      start: '2024-09', end: '2025-01',
      background: '基于历史借阅数据预测热门书籍需求，优化采购预算分配',
      myWork: '1、清洗 3 年 20 万条借阅记录，构建特征工程\n2、使用 XGBoost 建模，预测准确率 78%\n3、设计可视化看板供馆员决策参考',
      difficulty: '数据存在严重季节性波动与节假日异常，需特殊处理',
      result: '采购预算分配准确率提升 15%，年度积压书籍减少 20%',
      techStack: 'Python, XGBoost, Tableau',
      weakPoints: '',
      _mined: [],
    },
    {
      name: '外卖骑手配送时效分析', myRole: '独立分析',
      start: '2025-01', end: '2025-03',
      background: '利用公开数据集分析外卖配送超时影响因素',
      myWork: '1、数据清洗与缺失值处理\n2、构建回归模型识别超时关键因素\n3、输出可落地的优化建议',
      result: '识别出 3 个核心影响因素，提出 2 条优化建议',
      techStack: 'Python, 线性回归',
      weakPoints: '模型的内生性处理不够严谨',
      _mined: [],
    },
  ],

  selfIntro: '我是陈默，一名数据科学方向的研究生，对用数据驱动业务决策充满热情。',
  advantages: '1、扎实的统计与编程基础\n2、两段互联网数据分析实习经验\n3、擅长将复杂数据转化为清晰业务洞察',
  disadvantages: '1、可视化审美有待提升\n2、大数据工具（Spark）实战经验不足',
  motivation: '希望在头部互联网公司从事数据分析工作，持续积累业务理解与技术深度',
};

/** 判断当前是否应加载演示数据 */
export function isDemoMode() {
  return new URLSearchParams(window.location.search).has('demo');
}

/** 安全获取档案：demo 模式返回演示数据，否则返回 localStorage 真实数据 */
export function getProfile() {
  if (isDemoMode()) return JSON.parse(JSON.stringify(DEMO_PROFILE));
  const raw = localStorage.getItem('qiuzhao_profile_v4');
  return raw ? JSON.parse(raw) : null;
}
