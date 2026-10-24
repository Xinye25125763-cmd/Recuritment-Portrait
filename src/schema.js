/**
 * 秋招简历画像系统 — 字段 Schema
 *
 * 设计原则（借鉴 ai-job-search 的 schema 演进规则）：
 * 1. 字段只增不改：新版本只加字段，不重命名/删除已有字段
 * 2. 读者容忍缺失：老版本导出的 JSON 缺字段时，用默认值填充，绝不报错
 * 3. 敏感字段隔离：sensitive: true 的字段永不进入导出的"分享版"JSON
 *
 * 字段类型：text | textarea | number | date | month | select | multiselect | radio | checkbox | list
 * 条件显示：showIf: (data) => boolean
 * 赛道标记：track: 'soe'(央国企) | 'internet'(互联网) | 'both'
 */

const SCHEMA_VERSION = 4;

const TRACKS = {
  soe: '央国企',
  internet: '互联网',
  both: '通用'
};

const SECTIONS = [
  // ══════════════════════════════════════════════════════════
  {
    id: 'meta',
    title: '开始之前',
    icon: '',
    desc: '这两项决定后续要填哪些字段，请先选择。',
    fields: [
      {
        key: 'targetTracks',
        label: '你打算投递哪些类型的单位？',
        type: 'multiselect',
        required: true,
        options: ['互联网大厂', '央国企', '外企', '中小厂/创业公司', '事业单位/高校'],
        hint: '可多选。选了"央国企"会多出民族、籍贯、家庭情况等网申必填项；选了"互联网"会多出 GitHub、技术栈等字段。',
        track: 'both'
      },
      {
        key: 'highestDegree',
        label: '最高学历（在读或已获得）',
        type: 'radio',
        required: true,
        options: ['本科', '硕士', '博士'],
        track: 'both'
      },
      {
        key: 'graduationYear',
        label: '毕业年份',
        type: 'select',
        required: true,
        options: ['2026', '2027', '2028', '2029'],
        hint: '校招按毕业年份区分批次，这项决定你属于哪一届。',
        track: 'both'
      }
    ]
  },

  // ══════════════════════════════════════════════════════════
  {
    id: 'basic',
    title: '基本信息',
    icon: '',
    desc: '按央国企 + 互联网网申表单实际字段设计。敏感信息仅存本地、不进分享版导出。',
    fields: [
      { key: 'name', label: '姓名', type: 'text', required: true, track: 'both' },
      { key: 'gender', label: '性别', type: 'radio', options: ['男', '女'], track: 'both' },
      { key: 'birthMonth', label: '出生年月', type: 'month', track: 'both',
        hint: '网申常要求精确到月' },
      { key: 'phone', label: '手机号', type: 'text', required: true, track: 'both',
        validate: v => /^1[3-9]\d{9}$/.test(v) || '请填写 11 位手机号' },
      { key: 'email', label: '邮箱', type: 'text', required: true, track: 'both',
        hint: '建议用姓名拼音，避免 QQ 号数字串',
        validate: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || '邮箱格式不正确' },
      { key: 'currentCity', label: '现居城市', type: 'text', track: 'both' },
      { key: 'politicalStatus', label: '政治面貌', type: 'select',
        options: ['中共党员', '中共预备党员', '共青团员', '民主党派', '群众'], track: 'both' },
      { key: 'partyJoinDate', label: '入党时间', type: 'month', track: 'soe',
        showIf: d => ['中共党员', '中共预备党员'].includes(d.politicalStatus),
        hint: '党员必填，央国企网申必问' },

      { key: 'ethnicity', label: '民族', type: 'text', track: 'soe',
        showIf: d => hasTrack(d, '央国企'), hint: '央国企网申必填' },
      { key: 'nativePlace', label: '籍贯', type: 'text', track: 'soe',
        showIf: d => hasTrack(d, '央国企'), hint: '精确到省市，如"江苏省南京市"' },
      { key: 'hukou', label: '户口所在地', type: 'text', track: 'soe',
        showIf: d => hasTrack(d, '央国企'), hint: '涉及落户政策' },
      { key: 'maritalStatus', label: '婚姻状况', type: 'radio', options: ['未婚', '已婚'],
        track: 'soe', showIf: d => hasTrack(d, '央国企') },
      { key: 'height', label: '身高(cm)', type: 'number', track: 'soe',
        showIf: d => hasTrack(d, '央国企'), hint: '部分国企体检表要求' },

      { key: 'idNumber', label: '身份证号', type: 'text', track: 'soe', sensitive: true,
        showIf: d => hasTrack(d, '央国企'),
        hint: '仅存你的浏览器本地，不会进入分享版导出，也永远不会写进简历文件' },
      { key: 'emergencyContact', label: '紧急联系人', type: 'text', track: 'soe', sensitive: true,
        showIf: d => hasTrack(d, '央国企'), hint: '格式：姓名 / 关系 / 电话' },

      { key: 'github', label: 'GitHub 主页', type: 'text', track: 'internet',
        showIf: d => hasTrack(d, '互联网大厂') || hasTrack(d, '中小厂/创业公司'),
        hint: '没有可留空。有的话确保仓库是公开且有内容的' },
      { key: 'blog', label: '技术博客 / 个人主页', type: 'text', track: 'internet',
        showIf: d => hasTrack(d, '互联网大厂') || hasTrack(d, '中小厂/创业公司') }
    ]
  },

  // ══════════════════════════════════════════════════════════
  {
    id: 'education',
    title: '教育背景',
    icon: '',
    desc: '从最高学历开始填。GPA 和排名是硬筛项，没有排名就如实写"学院不排名"，不要编。',
    fields: [
      // ---- 研究生 ----
      { key: 'gradSchool', label: '研究生院校', type: 'text', track: 'both',
        showIf: d => ['硕士', '博士'].includes(d.highestDegree) },
      { key: 'gradCollege', label: '学院', type: 'text', track: 'both',
        showIf: d => ['硕士', '博士'].includes(d.highestDegree) },
      { key: 'gradMajor', label: '专业', type: 'text', track: 'both',
        showIf: d => ['硕士', '博士'].includes(d.highestDegree) },
      { key: 'gradDegreeType', label: '学位类型', type: 'radio', options: ['学术型', '专业型'],
        track: 'both', showIf: d => ['硕士', '博士'].includes(d.highestDegree) },
      { key: 'gradStart', label: '入学时间', type: 'month', track: 'both',
        showIf: d => ['硕士', '博士'].includes(d.highestDegree) },
      { key: 'gradEnd', label: '毕业时间', type: 'month', track: 'both',
        showIf: d => ['硕士', '博士'].includes(d.highestDegree) },
      { key: 'gradGpa', label: 'GPA / 加权成绩', type: 'text', track: 'both',
        showIf: d => ['硕士', '博士'].includes(d.highestDegree),
        hint: '如 3.7/4.0 或 88.5/100' },
      { key: 'gradRank', label: '专业排名', type: 'text', track: 'both',
        showIf: d => ['硕士', '博士'].includes(d.highestDegree),
        hint: '如 5/60。学院不排名就填"不排名"' },
      { key: 'advisor', label: '导师姓名', type: 'text', track: 'soe',
        showIf: d => ['硕士', '博士'].includes(d.highestDegree) && hasTrack(d, '央国企') },
      { key: 'researchArea', label: '研究方向', type: 'text', track: 'both',
        showIf: d => ['硕士', '博士'].includes(d.highestDegree) },
      { key: 'thesisTitle', label: '学位论文题目', type: 'text', track: 'soe',
        showIf: d => ['硕士', '博士'].includes(d.highestDegree) && hasTrack(d, '央国企') },

      // ---- 本科 ----
      { key: 'ugSchool', label: '本科院校', type: 'text', required: true, track: 'both' },
      { key: 'ugMajor', label: '本科专业', type: 'text', required: true, track: 'both' },
      { key: 'ugTier', label: '院校层次', type: 'select', track: 'both',
        options: ['985', '211', '双一流', '普通一本', '二本', '海外院校'],
        hint: '网申常有此下拉框，如实填' },
      { key: 'ugStart', label: '入学时间', type: 'month', track: 'both' },
      { key: 'ugEnd', label: '毕业时间', type: 'month', track: 'both' },
      { key: 'ugGpa', label: '本科 GPA / 加权', type: 'text', track: 'both' },
      { key: 'ugRank', label: '本科专业排名', type: 'text', track: 'both' },

      // ---- 高中（国企）----
      { key: 'highSchool', label: '高中学校', type: 'text', track: 'soe',
        showIf: d => hasTrack(d, '央国企'), hint: '央国企网申常要求填到高中' },

      { key: 'mainCourses', label: '主修课程（与目标岗位相关的）', type: 'textarea', track: 'both',
        hint: '按相关度排序，6-10 门，可带分数。如：机器学习(92)、数据库系统(95)、概率论(89)',
        rows: 3 }
    ]
  },

  // ══════════════════════════════════════════════════════════
  {
    id: 'intent',
    title: '求职意向',
    icon: '',
    desc: '这一节最重要 —— 它是岗位画像和推荐的核心输入。方向没想好没关系，把倾向度和顾虑如实填出来，系统会帮你分析。',
    fields: [
      {
        key: 'targetDirections',
        label: '你考虑的岗位方向（可多选）',
        type: 'multiselect',
        required: true,
        track: 'both',
        options: [
          '数据分析', '数据开发', 'BI/商业分析', '数据产品经理',
          '产品经理', '产品运营', '用户研究',
          '后端开发', '前端开发', '算法工程师', '测试开发',
          '项目管理', '咨询', '战略投资',
          '技术支持', '解决方案'
        ],
        hint: '选 2-5 个。不确定就把所有感兴趣的都选上，下一步会让你排优先级。'
      },
      {
        key: 'directionPriority',
        label: '给上面选的方向排个序，并说明理由',
        type: 'textarea',
        track: 'both',
        rows: 5,
        hint: '格式建议每行一个：\n数据分析 | 倾向度4/5 | 想做是因为实习做过 | 担心的是天花板\n产品经理 | 倾向度3/5 | 喜欢和人打交道 | 担心的是没相关实习'
      },
      {
        key: 'targetCities',
        label: '目标城市（按优先级）',
        type: 'multiselect',
        required: true,
        track: 'both',
        options: ['北京', '上海', '深圳', '广州', '杭州', '成都', '武汉', '南京', '西安', '苏州', '天津', '重庆', '合肥', '长沙', '青岛', '大连', '不限']
      },
      {
        key: 'salaryFloor',
        label: '税前年薪底线（万元）',
        type: 'number',
        track: 'both',
        hint: '这会成为岗位筛选的硬门槛。不确定就填一个你能接受的最低值。'
      },
      {
        key: 'dealBreakers',
        label: '绝对不接受的条件',
        type: 'multiselect',
        track: 'both',
        options: ['外包/驻场', '长期出差', '三班倒/夜班', '销售性质', '强制加班文化', '需要垫资', '试用期超过6个月', '无五险一金'],
        hint: '勾选的会成为一票否决项，命中就直接排除该岗位'
      },
      {
        key: 'trackWeight',
        label: '互联网 vs 央国企，你更倾向哪边？',
        type: 'radio',
        track: 'both',
        options: ['强烈倾向互联网', '略倾向互联网', '两边都行', '略倾向央国企', '强烈倾向央国企'],
        showIf: d => hasTrack(d, '互联网大厂') && hasTrack(d, '央国企')
      },
      {
        key: 'careerConcerns',
        label: '你对未来 3 年最看重什么？最担心什么？',
        type: 'textarea',
        track: 'both',
        rows: 3,
        hint: '如实写，这会影响画像里的"方向适配度"判断。例：看重技术成长和稳定性平衡，担心互联网 35 岁危机，也担心国企成长慢。'
      }
    ]
  },

  // ══════════════════════════════════════════════════════════
  {
    id: 'internship',
    title: '实习经历',
    icon: '',
    desc: '这是校招简历权重最高的部分。每段实习按 STAR 拆解，量化成果没有就写"暂无量化"，绝不编数字 —— 面试官会顺着简历追问。',
    isList: true,
    listKey: 'internships',
    addLabel: '+ 添加一段实习',
    itemFields: [
      { key: 'company', label: '公司名称', type: 'text', required: true },
      { key: 'department', label: '部门 / 团队', type: 'text' },
      { key: 'role', label: '岗位名称', type: 'text', required: true },
      { key: 'employmentType', label: '工作性质', type: 'radio', required: true,
        options: ['实习', '正式工作', '兼职/项目制'],
        hint: '校招背景默认多为实习。选"正式工作"才会追问在职状态' },
      { key: 'start', label: '开始时间', type: 'month' },
      { key: 'isOngoing', label: '至今仍在进行', type: 'checkbox',
        showIf: it => it.employmentType === '实习' || it.employmentType === '兼职/项目制',
        hint: '勾选后无需填结束时间' },
      { key: 'isCurrentlyThere', label: '至今在职', type: 'checkbox',
        showIf: it => it.employmentType === '正式工作',
        hint: '勾选后无需填结束时间' },
      { key: 'end', label: '结束时间', type: 'month',
        showIf: it => !it.isOngoing && !it.isCurrentlyThere },
      { key: 'background', label: '业务背景（一句话）', type: 'text',
        hint: '这个团队做什么，你的模块在其中什么位置' },
      { key: 'responsibilities', label: '我具体做了什么', type: 'textarea', rows: 5,
        hint: '3-5 条，动词开头。写"做了什么"而非"参与了什么"' },
      { key: 'metrics', label: '量化成果', type: 'textarea', rows: 3,
        hint: '如：日均处理数据 500W 条、看板被 3 个业务线使用、接口 P99 从 800ms 降到 200ms。\n没有真实数字就写"暂无量化"，不要估算或编造' },
      { key: 'techStack', label: '用到的工具 / 技术栈', type: 'text',
        hint: '如：Python, SQL, Hive, Tableau, Axure' },
      { key: 'deepDivePoints', label: '可深挖的点（面试会问）', type: 'textarea', rows: 3,
        hint: '列 2-3 个你能讲 5 分钟的技术/业务细节' },
      { key: 'weakPoints', label: '我讲不清楚的地方', type: 'textarea', rows: 2,
        hint: '诚实记录短板，这不会出现在简历里，但面试准备时系统会针对性帮你补' }
    ]
  },

  // ══════════════════════════════════════════════════════════
  {
    id: 'projects',
    title: '项目经历',
    icon: '',
    desc: '课程项目、竞赛项目、科研项目、个人项目都算。没有实习的话这里是主要支撑。',
    isList: true,
    listKey: 'projects',
    addLabel: '+ 添加一个项目',
    itemFields: [
      { key: 'name', label: '项目名称', type: 'text', required: true },
      { key: 'type', label: '项目类型', type: 'select',
        options: ['课程项目', '竞赛项目', '科研项目', '个人项目', '开源贡献', '创业项目'] },
      { key: 'start', label: '开始时间', type: 'month' },
      { key: 'end', label: '结束时间', type: 'month' },
      { key: 'teamSize', label: '团队规模', type: 'text', hint: '如：4人 / 独立完成' },
      { key: 'myRole', label: '我的角色', type: 'text', hint: '如：负责数据处理模块 / 项目负责人' },
      { key: 'background', label: '项目背景与目标', type: 'textarea', rows: 2 },
      { key: 'myWork', label: '我具体负责的部分', type: 'textarea', rows: 4,
        hint: '只写你自己做的，团队做的用"团队完成X，我负责其中Y"表述' },
      { key: 'difficulty', label: '技术难点 / 挑战', type: 'textarea', rows: 3,
        hint: '遇到什么问题，怎么解决的 —— 这是面试最爱问的' },
      { key: 'result', label: '项目成果', type: 'textarea', rows: 2,
        hint: '如：获校级一等奖 / 论文录用 / 上线服务 xx 用户 / 暂无对外成果' },
      { key: 'techStack', label: '技术栈', type: 'text' },
      { key: 'link', label: '项目链接（GitHub / 演示）', type: 'text' },
      { key: 'weakPoints', label: '我讲不清楚的地方', type: 'textarea', rows: 2 }
    ]
  },

  // ══════════════════════════════════════════════════════════
  {
    id: 'skills',
    title: '技能清单',
    icon: '',
    desc: '严格分三档。写进简历的必须能被追问，"了解"档不写进简历但面试提到不慌。这个分档是防止简历翻车的关键。',
    fields: [
      { key: 'skillsProficient', label: '熟练（做过项目，能被深入追问）', type: 'textarea',
        rows: 4, track: 'both',
        hint: '这些才能写进简历技能栏。格式：技能名 — 用它做过什么\n如：Python — 实习中写过 ETL 脚本处理日均 500W 数据' },
      { key: 'skillsFamiliar', label: '熟悉（用过，能完成常规任务）', type: 'textarea',
        rows: 3, track: 'both' },
      { key: 'skillsKnown', label: '了解（看过文档/教程，没实战）', type: 'textarea',
        rows: 3, track: 'both',
        hint: '这一档不要写进简历。写了大概率会被问倒' },
      { key: 'skillGaps', label: '已知缺口（JD 常出现但我确实没有）', type: 'textarea',
        rows: 3, track: 'both',
        hint: '如实列出。系统会在岗位匹配时标出这些缺口，并帮你判断是否值得补' },
      { key: 'certificates', label: '证书', type: 'textarea', rows: 3, track: 'both',
        hint: '每行一个：名称 | 成绩/等级 | 时间\n如：CET-6 | 528 | 2023.12' }
    ]
  },

  // ══════════════════════════════════════════════════════════
  {
    id: 'honors',
    title: '荣誉奖励',
    icon: '',
    desc: '央国企看重校级以上 + 集体荣誉 + 党团相关；互联网更看重专业竞赛。系统会按投递对象自动调整展示顺序。',
    fields: [
      { key: 'honorsNational', label: '国家级 / 省部级奖项', type: 'textarea', rows: 4, track: 'both',
        hint: '每行一个：名称 | 级别 | 时间 | 规模或排名\n如：全国大学生数学建模竞赛二等奖 | 国家级 | 2024.11 | 全国前5%' },
      { key: 'honorsSchool', label: '校级奖项', type: 'textarea', rows: 3, track: 'both' },
      { key: 'scholarships', label: '奖学金', type: 'textarea', rows: 3, track: 'both',
        hint: '每行：名称 | 比例或金额 | 学年' },
      { key: 'papers', label: '论文 / 专利', type: 'textarea', rows: 3, track: 'both',
        hint: '格式：标题 | 期刊或会议 | 作者位次 | 状态(已录用/在投)' }
    ]
  },

  // ══════════════════════════════════════════════════════════
  {
    id: 'campus',
    title: '学生工作与社会实践',
    icon: '',
    desc: '这是央国企的显著加分项。投互联网时系统会自动压缩这部分篇幅。',
    showIf: d => hasTrack(d, '央国企') || hasTrack(d, '事业单位/高校'),
    fields: [
      { key: 'campusRoles', label: '学生干部经历', type: 'textarea', rows: 5, track: 'soe',
        hint: '每段一块：职务 | 组织 | 任职时间 | 做了什么 | 可量化成果\n如：研究生会主席 | xx学院 | 2024.09-2025.06 | 统筹全院研究生活动 | 组织8场活动覆盖1200人次' },
      { key: 'volunteer', label: '志愿服务', type: 'textarea', rows: 3, track: 'soe',
        hint: '项目名 | 时长 | 时间' },
      { key: 'socialPractice', label: '社会实践 / 支教 / 调研', type: 'textarea', rows: 3, track: 'soe' }
    ]
  },

  // ══════════════════════════════════════════════════════════
  {
    id: 'family',
    title: '家庭情况',
    icon: '',
    desc: '仅央国企政审表要求。此节全部为敏感信息，只存本地、不进分享版导出、永不写入简历文件。',
    showIf: d => hasTrack(d, '央国企'),
    isList: true,
    listKey: 'familyMembers',
    addLabel: '+ 添加一位家庭成员',
    itemFields: [
      { key: 'name', label: '姓名', type: 'text', sensitive: true },
      { key: 'relation', label: '与本人关系', type: 'select', sensitive: true,
        options: ['父亲', '母亲', '配偶', '兄弟', '姐妹', '祖父', '祖母', '外祖父', '外祖母', '其他'] },
      { key: 'age', label: '年龄', type: 'number', sensitive: true },
      { key: 'workplace', label: '工作单位', type: 'text', sensitive: true },
      { key: 'position', label: '职务', type: 'text', sensitive: true,
        hint: '如：教师、工程师、退休、务农等' },
      { key: 'politicalStatus', label: '政治面貌', type: 'select', sensitive: true,
        options: ['中共党员', '中共预备党员', '共青团员', '民主党派', '群众'] }
    ]
  },

  // ══════════════════════════════════════════════════════════
  {
    id: 'summary',
    title: '自我评价',
    icon: '',
    desc: '三句话，每句必须有事实支撑。形容词堆砌等于没写。',
    fields: [
      { key: 'selfSummary', label: '自我评价', type: 'textarea', rows: 5, track: 'both',
        hint: '反例：本人性格开朗，工作认真负责，善于团队协作\n正例：在字节实习期间独立负责用户增长看板从需求到上线全流程，支撑3个业务线决策；带过4人小组完成校级重点项目并获一等奖' },
      { key: 'extraNotes', label: '其他补充', type: 'textarea', rows: 3, track: 'both',
        hint: '任何你觉得重要但上面没地方填的' }
    ]
  }
];

// ── 工具函数 ──────────────────────────────────────────────
function hasTrack(data, trackName) {
  return Array.isArray(data.targetTracks) && data.targetTracks.includes(trackName);
}

/** 收集所有敏感字段的 key，用于导出时剥离 */
function getSensitiveKeys() {
  const keys = [];
  SECTIONS.forEach(sec => {
    (sec.fields || []).forEach(f => { if (f.sensitive) keys.push(f.key); });
    // isList 型且 itemFields 里有 sensitive 标记的，整个 listKey 视为敏感
    if (sec.isList && (sec.itemFields || []).some(f => f.sensitive)) {
      keys.push(sec.listKey);
    }
  });
  return keys;
}

/** 构建空白数据对象，所有字段给默认值（保证老 JSON 导入时字段齐全） */
function buildEmptyData() {
  const data = { schemaVersion: SCHEMA_VERSION, _createdAt: new Date().toISOString() };
  SECTIONS.forEach(sec => {
    if (sec.isList) {
      data[sec.listKey] = [];
    } else {
      (sec.fields || []).forEach(f => {
        data[f.key] = (f.type === 'multiselect') ? [] : (f.type === 'checkbox' ? false : '');
      });
    }
  });
  return data;
}

/** 空白列表项 */
function buildEmptyListItem(section) {
  const item = { _id: Date.now() + Math.random() };
  section.itemFields.forEach(f => {
    item[f.key] = (f.type === 'multiselect') ? [] : (f.type === 'checkbox' ? false : '');
  });
  return item;
}

/**
 * 版本迁移：老 JSON 导入时，用空白模板填补缺失字段
 * 规则同 ai-job-search：容忍缺失，绝不因为字段不全而拒绝导入
 */
function migrate(loaded) {
  const fresh = buildEmptyData();
  const merged = { ...fresh, ...loaded };
  merged.schemaVersion = SCHEMA_VERSION;

  // 注意：必须放在下面的 isList 循环之前：
  // v3 的 familyMembers 是 textarea 字符串，而循环会把"非数组"一律重置为 []，
  // 先转成数组，旧数据才不会被抹掉。
  if (typeof merged.familyMembers === 'string') {
    const raw = merged.familyMembers.trim();
    merged.familyMembers = !raw ? [] : raw.split('\n').filter(l => l.trim()).map(line => {
      const item = { _id: Date.now() + Math.random() };
      // 旧格式约定：称谓 | 姓名 | 工作单位 | 职务 | 政治面貌
      const p = line.split('|').map(s => s.trim());
      if (p.length >= 2) {
        item.relation = p[0] || '';
        item.name = p[1] || '';
        item.workplace = p[2] || '';
        item.position = p[3] || '';
        item.politicalStatus = p[4] || '';
      } else {
        // 不符合约定的行整行塞进姓名，保证信息不丢，由用户自己重新拆分
        item.name = line.trim();
      }
      return item;
    });
  }

  // 列表项也要补字段
  SECTIONS.filter(s => s.isList).forEach(sec => {
    if (!Array.isArray(merged[sec.listKey])) merged[sec.listKey] = [];
    merged[sec.listKey] = merged[sec.listKey].map(item => {
      const blank = buildEmptyListItem(sec);
      const m = { ...blank, ...item };
      // v3 新增 employmentType：老数据没有这个字段会导致"结束时间"被条件隐藏，
      // 所以按旧的 isCurrentlyThere 推断一个默认值（校招语境默认实习）
      if (sec.listKey === 'internships' && !m.employmentType) {
        m.employmentType = m.isCurrentlyThere ? '正式工作' : '实习';
      }
      return m;
    });
  });
  return merged;
}

if (typeof window !== 'undefined') {
  window.QZ_SCHEMA = { SCHEMA_VERSION, TRACKS, SECTIONS, hasTrack, getSensitiveKeys, buildEmptyData, buildEmptyListItem, migrate };
}
