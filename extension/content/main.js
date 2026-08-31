/**
 * 秋招画像 — 网申自动填充 Content Script
 * 与主站 schema.js 对齐的字段映射
 */

(function() {
  'use strict';

  if (window.__QZHA_AUTOFILL_ACTIVE__) return;
  window.__QZHA_AUTOFILL_ACTIVE__ = true;

  const LS_PROFILE_KEY = 'qiuzhao_profile_v4';

  // ===== 同义词库（内联 MVP 子集，与主站 schema.js 对齐） =====
  const SYNONYMS = {
    rules: [
      { fieldPath: 'name', fieldName: '姓名', synonyms: ['姓名','名字','真实姓名','本人姓名','应聘者姓名','申请人姓名'], fieldType: 'text', priority: 100 },
      { fieldPath: 'gender', fieldName: '性别', synonyms: ['性别','性別'], fieldType: 'select', options: { '男': ['男','男性','M'], '女': ['女','女性','F'] }, priority: 100 },
      { fieldPath: 'birthMonth', fieldName: '出生年月', synonyms: ['出生年月','出生日期','生日','出生年月日','出生时间'], fieldType: 'date', priority: 100 },
      { fieldPath: 'phone', fieldName: '手机号', synonyms: ['手机号','手机号码','联系电话','电话','手机','移动电话','联系方式'], fieldType: 'tel', priority: 100 },
      { fieldPath: 'email', fieldName: '邮箱', synonyms: ['邮箱','电子邮箱','电子邮件','Email','E-mail','邮件地址','联系邮箱'], fieldType: 'email', priority: 100 },
      { fieldPath: 'currentCity', fieldName: '现居城市', synonyms: ['现居城市','现居住地','居住城市','所在城市','城市','居住地','常住地'], fieldType: 'text', priority: 90 },
      { fieldPath: 'politicalStatus', fieldName: '政治面貌', synonyms: ['政治面貌','政治状态','党派','政治身份','政治面目'], fieldType: 'select', options: { '中共党员': ['中共党员','党员','共产党','中国共产党'], '中共预备党员': ['中共预备党员','预备党员'], '共青团员': ['共青团员','团员','共青团'], '民主党派': ['民主党派'], '群众': ['群众','无党派','普通群众'] }, priority: 100 },
      { fieldPath: 'partyJoinDate', fieldName: '入党时间', synonyms: ['入党时间','入党日期','加入党组织时间'], fieldType: 'date', priority: 80 },
      { fieldPath: 'ethnicity', fieldName: '民族', synonyms: ['民族','国籍','族别'], fieldType: 'select', options: { '汉族': ['汉族','汉'], '蒙古族': ['蒙古族','蒙古'], '回族': ['回族','回'], '藏族': ['藏族','藏'], '维吾尔族': ['维吾尔族','维吾尔'], '苗族': ['苗族','苗'], '彝族': ['彝族','彝'], '壮族': ['壮族','壮'], '满族': ['满族','满'] }, priority: 100 },
      { fieldPath: 'nativePlace', fieldName: '籍贯', synonyms: ['籍贯','出生地','祖籍','户籍所在地','户口所在地','原籍','籍贯所在地'], fieldType: 'text', priority: 100 },
      { fieldPath: 'hukou', fieldName: '户口所在地', synonyms: ['户口所在地','户籍所在地','户口','户籍'], fieldType: 'text', priority: 90 },
      { fieldPath: 'maritalStatus', fieldName: '婚姻状况', synonyms: ['婚姻状况','婚姻状态','婚否','婚姻','结婚状况'], fieldType: 'select', options: { '未婚': ['未婚','单身'], '已婚': ['已婚'] }, priority: 80 },
      { fieldPath: 'height', fieldName: '身高', synonyms: ['身高','身高(cm)','身高(厘米)','height','体高'], fieldType: 'number', priority: 60 },
      { fieldPath: 'idNumber', fieldName: '身份证号', synonyms: ['身份证号','身份证号码','证件号码','证件号','身份号','居民身份证号'], fieldType: 'text', sensitive: true, priority: 90 },
      { fieldPath: 'emergencyContact', fieldName: '紧急联系人', synonyms: ['紧急联系人','紧急联系人姓名','紧急联络人','联系人'], fieldType: 'text', sensitive: true, priority: 70 },
      { fieldPath: 'github', fieldName: 'GitHub', synonyms: ['GitHub','github','GitHub主页','github主页'], fieldType: 'text', priority: 70 },
      { fieldPath: 'blog', fieldName: '技术博客', synonyms: ['技术博客','个人主页','博客','blog','技术主页','个人网站'], fieldType: 'text', priority: 60 },
      { fieldPath: 'gradSchool', fieldName: '研究生院校', synonyms: ['研究生院校','研究生学校','硕士院校','博士院校'], fieldType: 'text', priority: 100 },
      { fieldPath: 'gradCollege', fieldName: '学院', synonyms: ['学院','院系','所属学院','研究生学院'], fieldType: 'text', priority: 90 },
      { fieldPath: 'gradMajor', fieldName: '专业', synonyms: ['专业','研究方向','研究生专业','硕士专业','博士专业','所学专业'], fieldType: 'text', priority: 100 },
      { fieldPath: 'gradDegreeType', fieldName: '学位类型', synonyms: ['学位类型','学位类别'], fieldType: 'select', options: { '学术型': ['学术型','学术学位','学硕'], '专业型': ['专业型','专业学位','专硕'] }, priority: 80 },
      { fieldPath: 'gradStart', fieldName: '入学时间', synonyms: ['入学时间','入学日期','就读开始时间','入学年月','研究生入学时间'], fieldType: 'date', priority: 100 },
      { fieldPath: 'gradEnd', fieldName: '毕业时间', synonyms: ['毕业时间','毕业日期','预计毕业时间','毕业年月','结束时间','离校时间','研究生毕业时间'], fieldType: 'date', priority: 100 },
      { fieldPath: 'gradGpa', fieldName: 'GPA', synonyms: ['GPA','绩点','平均绩点','加权成绩','研究生GPA'], fieldType: 'text', priority: 80 },
      { fieldPath: 'gradRank', fieldName: '专业排名', synonyms: ['专业排名','成绩排名','排名','研究生排名'], fieldType: 'text', priority: 70 },
      { fieldPath: 'advisor', fieldName: '导师', synonyms: ['导师','导师姓名','指导教师','研究生导师'], fieldType: 'text', priority: 70 },
      { fieldPath: 'researchArea', fieldName: '研究方向', synonyms: ['研究方向','研究领域','研究课题'], fieldType: 'text', priority: 80 },
      { fieldPath: 'thesisTitle', fieldName: '论文题目', synonyms: ['论文题目','学位论文题目','毕业论文题目','论文名称'], fieldType: 'text', priority: 70 },
      { fieldPath: 'ugSchool', fieldName: '本科院校', synonyms: ['本科院校','本科学校','毕业院校','院校','就读院校','学校','大学','毕业学校','母校'], fieldType: 'text', priority: 100 },
      { fieldPath: 'ugMajor', fieldName: '本科专业', synonyms: ['本科专业','专业','主修专业','专业名称','所学专业'], fieldType: 'text', priority: 100 },
      { fieldPath: 'ugTier', fieldName: '院校层次', synonyms: ['院校层次','学校层次','学校类型','院校类型'], fieldType: 'select', options: { '985': ['985'], '211': ['211'], '双一流': ['双一流'], '普通一本': ['普通一本','一本'], '二本': ['二本','普通二本'], '海外院校': ['海外院校','海外'] }, priority: 80 },
      { fieldPath: 'ugStart', fieldName: '本科入学时间', synonyms: ['本科入学时间','本科入学日期','本科就读开始时间'], fieldType: 'date', priority: 90 },
      { fieldPath: 'ugEnd', fieldName: '本科毕业时间', synonyms: ['本科毕业时间','本科毕业日期','本科预计毕业时间'], fieldType: 'date', priority: 90 },
      { fieldPath: 'ugGpa', fieldName: '本科GPA', synonyms: ['本科GPA','本科绩点','本科平均绩点'], fieldType: 'text', priority: 70 },
      { fieldPath: 'ugRank', fieldName: '本科排名', synonyms: ['本科排名','本科成绩排名','本科专业排名'], fieldType: 'text', priority: 60 },
      { fieldPath: 'highSchool', fieldName: '高中学校', synonyms: ['高中学校','高中','高中毕业学校'], fieldType: 'text', priority: 60 },
      { fieldPath: 'mainCourses', fieldName: '主修课程', synonyms: ['主修课程','所学课程','课程','修读课程'], fieldType: 'textarea', priority: 60 },
      { fieldPath: 'targetDirections', fieldName: '岗位方向', synonyms: ['岗位方向','目标岗位','意向岗位','应聘方向','求职方向'], fieldType: 'text', priority: 90 },
      { fieldPath: 'targetCities', fieldName: '目标城市', synonyms: ['目标城市','期望城市','工作城市','意向城市','工作地点','工作地','期望工作地'], fieldType: 'text', priority: 100 },
      { fieldPath: 'salaryFloor', fieldName: '年薪底线', synonyms: ['年薪底线','期望薪资','薪资要求','薪酬期望','工资要求','待遇要求','期望年薪'], fieldType: 'text', priority: 70 },
      { fieldPath: 'skillsProficient', fieldName: '熟练技能', synonyms: ['熟练技能','专业技能','掌握技能','技能','技术栈'], fieldType: 'textarea', priority: 70 },
      { fieldPath: 'certificates', fieldName: '证书', synonyms: ['证书','资格证书','所获证书','英语等级','语言证书'], fieldType: 'textarea', priority: 70 },
      { fieldPath: 'honorsNational', fieldName: '国家级奖项', synonyms: ['国家级奖项','省部级奖项','获奖情况','奖项','荣誉','奖励'], fieldType: 'textarea', priority: 60 },
      { fieldPath: 'campusRoles', fieldName: '学生干部经历', synonyms: ['学生干部经历','干部经历','学生工作','社团经历','组织经历','干部任职'], fieldType: 'textarea', priority: 60 },
      { fieldPath: 'volunteer', fieldName: '志愿服务', synonyms: ['志愿服务','志愿活动','志愿者经历','义工'], fieldType: 'textarea', priority: 50 },
      { fieldPath: 'socialPractice', fieldName: '社会实践', synonyms: ['社会实践','社会实践活动','实践经历','实习实践'], fieldType: 'textarea', priority: 50 },
      { fieldPath: 'selfSummary', fieldName: '自我评价', synonyms: ['自我评价','个人评价','自我描述','个人介绍','个人简介'], fieldType: 'textarea', priority: 60 },
      { fieldPath: 'extraNotes', fieldName: '其他补充', synonyms: ['其他补充','补充说明','备注','其他信息'], fieldType: 'textarea', priority: 40 },
      // ── 数组字段（支持 {index} 占位符，网申中常见的「实习单位1」「家庭成员2」等） ──
      { fieldPath: 'internships[{index}].company', fieldName: '实习单位', synonyms: ['实习单位{index}','工作单位{index}','实习公司{index}','所在公司{index}','工作单位名称{index}'], fieldType: 'text', priority: 80 },
      { fieldPath: 'internships[{index}].role', fieldName: '实习岗位', synonyms: ['实习岗位{index}','实习职位{index}','岗位名称{index}','职位{index}','实习职务{index}'], fieldType: 'text', priority: 80 },
      { fieldPath: 'internships[{index}].start', fieldName: '实习开始时间', synonyms: ['实习开始时间{index}','实习起始时间{index}','实习开始日期{index}'], fieldType: 'date', priority: 80 },
      { fieldPath: 'internships[{index}].end', fieldName: '实习结束时间', synonyms: ['实习结束时间{index}','实习终止时间{index}','实习结束日期{index}'], fieldType: 'date', priority: 80 },
      { fieldPath: 'internships[{index}].department', fieldName: '实习部门', synonyms: ['实习部门{index}','部门{index}','所属部门{index}'], fieldType: 'text', priority: 70 },
      { fieldPath: 'projects[{index}].name', fieldName: '项目名称', synonyms: ['项目名称{index}','项目经历{index}','项目{index}'], fieldType: 'text', priority: 80 },
      { fieldPath: 'projects[{index}].myRole', fieldName: '项目角色', synonyms: ['项目角色{index}','担任角色{index}','项目职务{index}'], fieldType: 'text', priority: 80 },
      { fieldPath: 'familyMembers[{index}].name', fieldName: '家庭成员姓名', synonyms: ['家庭成员姓名{index}','家庭成员{index}','亲属姓名{index}','家人姓名{index}','家属姓名{index}'], fieldType: 'text', priority: 80 },
      { fieldPath: 'familyMembers[{index}].relation', fieldName: '与本人关系', synonyms: ['与本人关系{index}','关系{index}','亲属关系{index}','家庭成员关系{index}','与我的关系{index}'], fieldType: 'select', priority: 80 },
      { fieldPath: 'familyMembers[{index}].workplace', fieldName: '工作单位', synonyms: ['工作单位{index}','工作单位及职务{index}','工作单位名称{index}'], fieldType: 'text', priority: 80 },
      { fieldPath: 'familyMembers[{index}].position', fieldName: '职务', synonyms: ['职务{index}','职位{index}','工作单位职务{index}'], fieldType: 'text', priority: 80 },
      { fieldPath: 'familyMembers[{index}].age', fieldName: '年龄', synonyms: ['年龄{index}','岁数{index}','年纪{index}'], fieldType: 'number', priority: 80 }
    ]
  };

  // ===== Extractor =====
  const Extractor = {
    extract() {
      const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
      const fields = [];
      inputs.forEach((el, index) => {
        const info = this.analyzeElement(el, index);
        if (info) fields.push(info);
      });
      this.injectMarkers(fields);
      return fields;
    },
    analyzeElement(el, index) {
      const tag = el.tagName.toLowerCase();
      const type = el.type || tag;
      if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button' || el.type === 'reset' || el.type === 'image' || el.disabled || el.offsetParent === null) return null;
      const label = this.findLabel(el);
      const fieldGroup = this.findFieldGroup(el);
      const semanticLabel = this.buildSemanticLabel(label, el.placeholder || '', el.name || '', el.id || '');
      return { element: el, tag, type, name: el.name || '', id: el.id || '', label, placeholder: el.placeholder || '', required: el.required || false, fieldGroup, semanticLabel, index, selector: this.buildSelector(el, index) };
    },
    findLabel(el) {
      if (el.id) { const l = document.querySelector(`label[for="${el.id}"]`); if (l) return l.textContent.trim(); }
      const pl = el.closest('label'); if (pl) { const c = pl.cloneNode(true); c.querySelectorAll('input,select,textarea').forEach(i=>i.remove()); return c.textContent.trim(); }
      const prev = el.previousElementSibling; if (prev && ['LABEL','SPAN','DIV'].includes(prev.tagName)) { const t = prev.textContent.trim(); if (t && t.length < 50) return t; }
      if (el.getAttribute('aria-labelledby')) { const r = document.getElementById(el.getAttribute('aria-labelledby')); if (r) return r.textContent.trim(); }
      if (el.getAttribute('aria-label')) return el.getAttribute('aria-label').trim();
      return '';
    },
    findFieldGroup(el) { let c = el.parentElement, d = 0; while (c && d < 6) { const h = c.querySelector(':scope > h2, :scope > h3, :scope > h4, :scope > legend, :scope > .section-title'); if (h) return h.textContent.trim(); c = c.parentElement; d++; } return ''; },
    buildSemanticLabel(label, placeholder, name, id) { if (label) return label; if (placeholder) return placeholder; if (name) return name; return id || ''; },
    buildSelector(el, index) { if (el.id) return `#${el.id}`; if (el.name) return `[name="${el.name}"]`; return `[data-autofill-index="${index}"]`; },
    injectMarkers(fields) { fields.forEach((f,i)=>{ if (!f.element.id && !f.element.name) f.element.setAttribute('data-autofill-index', i); }); }
  };

  // ===== Matcher =====
  const Matcher = {
    // 合并内置规则与用户自定义规则（用户规则优先级更高）
    buildRules(userSynonyms = {}) {
      const rules = [...SYNONYMS.rules];
      Object.entries(userSynonyms).forEach(([label, cfg]) => {
        rules.unshift({
          fieldPath: cfg.fieldPath,
          fieldName: cfg.fieldName || label,
          synonyms: [label, ...(cfg.synonyms || [])],
          fieldType: cfg.fieldType || 'text',
          priority: cfg.priority || 100,
          _userDefined: true
        });
      });
      return rules;
    },

    match(fields, profile, userSynonyms) {
      const rules = this.buildRules(userSynonyms);
      const fillPlan = []; let identified = 0, empty = 0, unidentified = 0;
      fields.forEach(field => {
        const result = this.matchField(field, profile, rules);
        if (result.confidence >= 0.7) { identified++; if (!result.value) empty++; } else { unidentified++; }
        fillPlan.push({ target: field.selector, fieldType: field.type, semanticLabel: field.semanticLabel, fieldGroup: field.fieldGroup, ...result });
      });
      return { fillPlan, stats: { identified_fields_count: identified, empty_fields_count: empty, unidentified_fields_count: unidentified, total: fields.length } };
    },

    matchField(field, profile, rules) {
      const label = field.semanticLabel;
      if (!label) return { confidence: 0, value: null, sourceField: null, reason: '无识别标签' };

      // 检测标签中的数字索引（如：实习单位1、家庭成员2）
      const index = this.extractIndex(label);

      // 过滤适用规则并替换 {index} 占位符
      const applicableRules = rules.filter(rule => {
        const hasPlaceholder = rule.fieldPath && rule.fieldPath.includes('{index}');
        return index !== null ? hasPlaceholder : !hasPlaceholder;
      }).map(rule => {
        if (index === null || !rule.fieldPath) return rule;
        const indexedPath = rule.fieldPath.replace(/\{index\}/g, String(index));
        const indexedSynonyms = rule.synonyms.map(s => s.replace(/\{index\}/g, String(index + 1))); // 显示用 1-based
        return { ...rule, _fieldPath: indexedPath, _synonyms: indexedSynonyms };
      });

      // 精确匹配
      for (const rule of applicableRules) {
        if (this.checkExactMatch(label, rule._synonyms || rule.synonyms)) {
          const path = rule._fieldPath || rule.fieldPath;
          const value = this.getProfileValue(profile, path);
          return { confidence: 1.0, value, sourceField: path, fieldName: rule.fieldName, reason: `精确匹配：${label} → ${rule.fieldName}`, caseSensitive: false };
        }
      }

      // 模糊匹配
      let bestMatch = null, bestScore = 0;
      for (const rule of applicableRules) {
        const score = this.calculateSimilarity(label, rule._synonyms || rule.synonyms);
        if (score > bestScore && score >= 0.6) { bestScore = score; bestMatch = rule; }
      }
      if (bestMatch) {
        const path = bestMatch._fieldPath || bestMatch.fieldPath;
        const value = this.getProfileValue(profile, path);
        return { confidence: bestScore, value, sourceField: path, fieldName: bestMatch.fieldName, reason: `模糊匹配(${Math.round(bestScore*100)}%)：${label} → ${bestMatch.fieldName}`, caseSensitive: false };
      }
      return { confidence: 0, value: null, sourceField: null, reason: '无匹配规则' };
    },

    checkExactMatch(label, synonyms) { const n = this.normalize(label); return synonyms.some(s => this.normalize(s) === n); },

    calculateSimilarity(label, synonyms) { const nl = this.normalize(label); let maxScore = 0; for (const syn of synonyms) { const ns = this.normalize(syn); if (nl.includes(ns) || ns.includes(nl)) { const ratio = Math.min(nl.length, ns.length)/Math.max(nl.length, ns.length); maxScore = Math.max(maxScore, 0.7 + 0.3*ratio); continue; } const dist = this.levenshtein(nl, ns); const ml = Math.max(nl.length, ns.length); if (ml > 0) { const s = 1 - dist/ml; if (s >= 0.6) maxScore = Math.max(maxScore, s); } } return maxScore; },

    getProfileValue(profile, path) {
      if (!path) return null;
      // 支持 internships[0].company 和 familyMembers[1].name 这种路径
      const regex = /([^\[\].]+)(?:\[(\d+)\])?/g;
      let curr = profile;
      let match;
      while ((match = regex.exec(path)) !== null) {
        if (curr == null || typeof curr !== 'object') return null;
        const key = match[1];
        const index = match[2];
        curr = curr[key];
        if (index != null) {
          if (!Array.isArray(curr)) return null;
          curr = curr[parseInt(index, 10)];
        }
      }
      return curr != null ? String(curr) : null;
    },

    normalize(text) { return text.toLowerCase().replace(/[\s\(\)（）\[\]【】]/g,'').replace(/[：:]/g,'').replace(/[*＊]/g,'').trim(); },

    levenshtein(a,b) { const m=a.length,n=b.length; if(m===0)return n; if(n===0)return m; const dp=Array.from({length:m+1},()=>new Array(n+1).fill(0)); for(let i=0;i<=m;i++)dp[i][0]=i; for(let j=0;j<=n;j++)dp[0][j]=j; for(let i=1;i<=m;i++)for(let j=1;j<=n;j++){const cost=a[i-1]===b[j-1]?0:1; dp[i][j]=Math.min(dp[i-1][j]+1,dp[i][j-1]+1,dp[i-1][j-1]+cost);} return dp[m][n]; },

    extractIndex(label) {
      // 匹配「第X个/位/条/段」或纯数字（支持全角数字）
      const m = label.match(/(?:第([一二三四五六七八九十\d]+)[个位条段]|(\d+)|([０-９]+))/);
      if (!m) return null;
      if (m[1]) return this.parseChineseNumber(m[1]);
      if (m[2]) return parseInt(m[2], 10) - 1; // 1-based → 0-based
      if (m[3]) return parseInt(m[3].replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)), 10) - 1;
      return null;
    },

    parseChineseNumber(str) {
      const cn = { '一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10 };
      const s = str.trim();
      if (/^\d+$/.test(s)) return parseInt(s, 10) - 1;
      if (s === '十') return 9; // 第10个
      if (s.startsWith('十')) return (cn[s[1]] || 0) + 9;
      if (s.endsWith('十')) return (cn[s[0]] || 1) * 10 - 1;
      if (s.includes('十')) {
        const parts = s.split('十');
        return ((cn[parts[0]] || 1) * 10 + (cn[parts[1]] || 0)) - 1;
      }
      return (cn[s] || 1) - 1;
    }
  };

  // ===== Filler =====
  const Filler = {
    async fill(fillPlan, options = {}) {
      const { delay = 80, onProgress } = options;
      let filled = 0, skipped = 0; const failed = [], pending = [], manualConfirm = [];
      for (const item of fillPlan) {
        if (item.confidence < 0.7 || !item.value) { skipped++; pending.push(item); continue; }
        try {
          const result = await this.fillField(item);
          if (result && typeof result === 'object' && result.status === 'manual') {
            manualConfirm.push({ ...item, reason: result.reason });
          } else if (result === true || (result && result.status === 'filled')) {
            filled++; item._filled = true;
          } else {
            failed.push({...item, failReason: '写入失败'}); pending.push(item);
          }
        } catch (err) { failed.push({...item, failReason: err.message}); pending.push(item); }
        if (onProgress) onProgress({ filled, total: fillPlan.length, current: item.semanticLabel });
        if (delay > 0) await this.sleep(delay);
      }
      return { filled, failed, skipped, pending, manualConfirm };
    },
    fillField(item) {
      const el = document.querySelector(item.target);
      if (!el) throw new Error('目标控件未找到：' + item.target);
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // 优先尝试组件库适配器（AntD / Element UI / Layui）
      if (window.__QZHA_ADAPTERS__) {
        const ok = window.__QZHA_ADAPTERS__.fill(el, item.value);
        if (ok && ok.then) return ok; // async adapter
        if (ok) return Promise.resolve(true);
      }
      const tag = el.tagName.toLowerCase();
      const type = el.type || tag;
      switch (type) {
        case 'text': case 'email': case 'tel': case 'number': case 'url': case 'password': case 'search': return this.fillText(el, item.value);
        case 'textarea': return this.fillText(el, item.value);
        case 'select': case 'select-one': return this.fillSelect(el, item.value, item.caseSensitive);
        case 'radio': return this.fillRadio(el, item.value);
        case 'checkbox': return this.fillCheckbox(el, item.value, item.semanticLabel);
        case 'date': case 'month': return this.fillDate(el, item.value);
        default: return this.fillText(el, item.value);
      }
    },
    fillText(el, value) {
      el.focus();
      const proto = el.tagName.toLowerCase() === 'textarea' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(el, value); else el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      el.blur();
      return true;
    },
    fillSelect(el, value, caseSensitive = false) {
      const options = Array.from(el.options);
      const compare = caseSensitive ? (a,b)=>a===b : (a,b)=>a.toLowerCase()===b.toLowerCase();
      let matched = options.find(opt => compare(opt.text.trim(), value));
      if (!matched) matched = options.find(opt => compare(opt.value.trim(), value));
      if (!matched) matched = options.find(opt => opt.text.toLowerCase().includes(value.toLowerCase()) || value.toLowerCase().includes(opt.text.toLowerCase()));
      if (matched) { el.value = matched.value; el.dispatchEvent(new Event('change', { bubbles: true })); return true; }
      return false;
    },
    fillRadio(el, value) {
      const name = el.name; if (!name) return false;
      const radios = document.querySelectorAll(`input[type="radio"][name="${name}"]`);
      const nv = value.toLowerCase().trim();
      for (const r of radios) {
        const rVal = (r.value||'').toLowerCase().trim();
        // 同时匹配 radio value 和相邻 label 文本（很多系统 value='1' label='男'）
        const labelEl = r.nextElementSibling || r.parentElement?.querySelector('span,label');
        const labelText = (labelEl?.textContent || '').toLowerCase().trim();
        if (rVal === nv || labelText === nv || labelText.includes(nv) || nv.includes(labelText) && labelText.length > 0) {
          r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); return true;
        }
      }
      return false;
    },
    fillCheckbox(el, value, label = '') {
      const highRiskKeywords = ['同意', '接受', '授权', '许可', '隐私', '条款', '协议', '免责声明', '承诺', '保证', '知情', '自愿', '调剂', '外派', '轮岗', '加班', '派遣', '外包', '借调'];
      const labelLower = String(label).toLowerCase();
      const isHighRisk = highRiskKeywords.some(kw => labelLower.includes(kw));
      if (isHighRisk) {
        return { status: 'manual', reason: '高风险选项需人工确认：' + label };
      }
      const shouldCheck = ['是','yes','true','1','on','checked'].includes(String(value).toLowerCase().trim());
      if (el.checked !== shouldCheck) { el.checked = shouldCheck; el.dispatchEvent(new Event('change', { bubbles: true })); }
      return { status: 'filled' };
    },
    fillDate(el, value) {
      let formatted = value;
      const v = String(value).trim();
      if (/^\d{4}\/\d{2}\/\d{2}$/.test(v)) formatted = v.replace(/\//g, '-');
      else if (/^\d{4}年\d{2}月$/.test(v)) formatted = v.replace(/年/,'-').replace(/月/,'');
      else if (/^\d{4}-\d{2}$/.test(v)) formatted = v;
      else if (/^\d{4}\.\d{2}$/.test(v)) formatted = v.replace(/\./g, '-');
      else if (/^\d{4}年\d{1,2}月\d{1,2}日$/.test(v)) {
        formatted = v.replace(/年/,'-').replace(/月/,'-').replace(/日/,'');
      }
      else if (/^\d{4}年\d{1,2}月$/.test(v)) {
        const m = v.match(/(\d{4})年(\d{1,2})月/);
        if (m) formatted = `${m[1]}-${m[2].padStart(2, '0')}`;
      }
      return this.fillText(el, formatted);
    },
    sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  };

  // ===== Report =====
  const Report = {
    generate(fillPlan, stats) {
      const filledItems = fillPlan.filter(p => p._filled);
      const pendingItems = fillPlan.filter(p => !p._filled && p.confidence >= 0.7 && p.value && !stats.manualConfirm?.some(m => m.target === p.target));
      const noMatchItems = fillPlan.filter(p => p.confidence < 0.7);
      const emptyItems = fillPlan.filter(p => p.confidence >= 0.7 && !p.value);
      return {
        summary: { total: fillPlan.length, filled: filledItems.length, pending: pendingItems.length, manualConfirm: stats.manualConfirm?.length || 0, skipped: noMatchItems.length + emptyItems.length, empty: emptyItems.length, noMatch: noMatchItems.length },
        filled: filledItems.map(p => ({ label: p.semanticLabel, fieldName: p.fieldName, sourceField: p.sourceField, value: this.mask(p.sourceField, p.value), reason: p.reason })),
        pending: pendingItems.map(p => ({ label: p.semanticLabel, fieldName: p.fieldName, reason: p.failReason || '写入失败，请手动补填' })),
        noMatch: noMatchItems.map(p => ({ label: p.semanticLabel, reason: '无匹配规则' })),
        empty: emptyItems.map(p => ({ label: p.semanticLabel, fieldName: p.fieldName, reason: '档案中该字段为空' })),
        manualConfirm: (stats.manualConfirm || []).map(p => ({ label: p.semanticLabel, fieldName: p.fieldName, reason: p.reason || '高风险选项需人工确认' }))
      };
    },
    mask(fieldPath, value) {
      if (!fieldPath || !value) return value;
      const sens = ['idNumber','phone','email','password','card','emergencyContact'];
      if (sens.some(p => fieldPath.toLowerCase().includes(p)) && value.length > 4) return value.slice(0,2) + '****' + value.slice(-2);
      return value;
    }
  };

  // ===== UI 面板 =====
  const UI = {
    panel: null,
    show(message, type = 'info') {
      this.ensurePanel();
      const item = document.createElement('div');
      item.style.cssText = `padding:6px 10px;margin:4px 0;border-radius:4px;font-size:13px;${
        type === 'success' ? 'background:#d4edda;color:#155724;' :
        type === 'error' ? 'background:#f8d7da;color:#721c24;' :
        type === 'warning' ? 'background:#fff3cd;color:#856404;' :
        'background:#d1ecf1;color:#0c5460;'
      }`;
      item.textContent = message;
      this.panel.appendChild(item);
      this.panel.style.display = 'block';
    },
    clear() { if (this.panel) this.panel.innerHTML = ''; },
    ensurePanel() {
      if (this.panel) return;
      this.panel = document.createElement('div');
      this.panel.id = '__qzha_autofill_panel__';
      this.panel.style.cssText = 'position:fixed;top:16px;right:16px;width:340px;max-height:80vh;overflow-y:auto;background:#fff;border:1px solid #ccc;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:2147483647;padding:12px;font-family:"Microsoft YaHei",sans-serif;font-size:14px;display:none;';
      const header = document.createElement('div');
      header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;border-bottom:1px solid #eee;padding-bottom:8px;';
      header.innerHTML = '<strong style="color:#2b6cb0;">📝 秋招画像自动填充</strong>';
      const closeBtn = document.createElement('button');
      closeBtn.textContent = '×';
      closeBtn.style.cssText = 'background:none;border:none;font-size:18px;cursor:pointer;color:#999;';
      closeBtn.onclick = () => { this.panel.style.display = 'none'; };
      header.appendChild(closeBtn);
      this.panel.appendChild(header);
      document.body.appendChild(this.panel);
    },
    renderReport(report) {
      this.ensurePanel(); this.clear();
      const s = report.summary;
      this.show(`✅ 成功 ${s.filled} / ⚠️ 待补 ${s.pending} / ❓ 无匹配 ${s.noMatch} / 📝 空值 ${s.empty}`, 'info');
      if (report.pending.length > 0) { this.show('─── 待补填字段 ───', 'warning'); report.pending.forEach(p => this.show(`• ${p.label}${p.fieldName ? ' → ' + p.fieldName : ''}`, 'warning')); }
      if (report.noMatch.length > 0) { this.show('─── 无匹配字段（可扩充同义词库）───', 'warning'); report.noMatch.forEach(p => this.show(`• ${p.label}`, 'warning')); }
      if (report.empty.length > 0) { this.show('─── 档案为空字段 ───', 'warning'); report.empty.forEach(p => this.show(`• ${p.label}（${p.fieldName}）`, 'warning')); }
    }
  };

  // ===== 主流程 =====
  async function previewMatch(profile, userSynonyms = {}) {
    console.log('[QZHA Autofill] 开始预览匹配...');
    UI.clear(); UI.show('🔍 正在提取页面表单字段...');
    const fields = Extractor.extract();
    UI.show(`📋 提取到 ${fields.length} 个表单控件`);
    UI.show('🧩 正在匹配档案字段...');
    const { fillPlan, stats } = Matcher.match(fields, profile, userSynonyms);
    UI.show(`✅ 识别 ${stats.identified_fields_count} / ❓ 未识别 ${stats.unidentified_fields_count} / 📝 空值 ${stats.empty_fields_count}`);
    console.log('[QZHA Autofill] 预览完成', fillPlan);
    return { fillPlan, stats };
  }

  async function executeFill(fillPlan, options = {}) {
    UI.show('✏️ 正在自动填写...');
    const result = await Filler.fill(fillPlan, { delay: 80, onProgress: ({ filled, total }) => { if (filled % 5 === 0) UI.show(`进度: ${filled}/${total}`); } });
    UI.show('📊 生成报告...');
    const report = Report.generate(fillPlan, result);
    UI.renderReport(report);
    console.log('[QZHA Autofill] 填充完成', report);
    return report;
  }

  async function runAutofill(profile, userSynonyms = {}) {
    const { fillPlan } = await previewMatch(profile, userSynonyms);
    return executeFill(fillPlan);
  }

  // ===== 消息监听 =====
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'START_AUTOFILL') {
      const profile = request.profile || {};
      chrome.storage.local.get('userSynonyms', result => {
        const userSynonyms = result.userSynonyms || {};
        runAutofill(profile, userSynonyms).then(report => sendResponse({ success: true, report })).catch(err => {
          console.error('[QZHA Autofill] 错误:', err); UI.show('❌ 错误: ' + err.message, 'error'); sendResponse({ success: false, error: err.message });
        });
      });
      return true;
    }
    if (request.action === 'PREVIEW_MATCH') {
      const profile = request.profile || {};
      chrome.storage.local.get('userSynonyms', result => {
        const userSynonyms = result.userSynonyms || {};
        previewMatch(profile, userSynonyms).then(({ fillPlan, stats }) => {
          const items = fillPlan.map(p => ({
            target: p.target,
            fieldType: p.fieldType,
            semanticLabel: p.semanticLabel,
            fieldName: p.fieldName,
            sourceField: p.sourceField,
            value: p.value,
            confidence: p.confidence,
            reason: p.reason,
            checked: p.confidence >= 0.7 && !!p.value
          }));
          sendResponse({ success: true, preview: items, stats });
        }).catch(err => {
          console.error('[QZHA Autofill] 预览错误:', err);
          sendResponse({ success: false, error: err.message });
        });
      });
      return true;
    }
    if (request.action === 'CONFIRM_FILL') {
      const plan = request.plan || [];
      executeFill(plan).then(report => sendResponse({ success: true, report })).catch(err => {
        console.error('[QZHA Autofill] 填充错误:', err); UI.show('❌ 错误: ' + err.message, 'error'); sendResponse({ success: false, error: err.message });
      });
      return true;
    }
    return false;
  });

  console.log('[QZHA Autofill] Content script 已加载');
})();
