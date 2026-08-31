// 网申自动填充 - popup 控制面板
// 与 content/main.js 通过 chrome.tabs.sendMessage 通信
// localStorage key 与主站一致：qiuzhao_profile_v4

const PROFILE_KEY = 'qiuzhao_profile_v4';
const $ = id => document.getElementById(id);

let currentTab = null;
let engineReady = false;

// ── 初始化 ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  $('version').textContent = 'v' + chrome.runtime.getManifest().version;
  bindEvents();
  await refreshTab();
  refreshProfileStatus();
  initMappingUI();
});

function bindEvents() {
  $('btn-import').addEventListener('click', triggerImport);
  $('file-input').addEventListener('change', handleImport);
  $('btn-clear').addEventListener('click', handleClear);
  $('btn-fill').addEventListener('click', handleFill);
  $('btn-export').addEventListener('click', handleExport);
  $('btn-preview').addEventListener('click', handlePreview);
  $('btn-confirm-fill').addEventListener('click', handleConfirmFill);
  $('preview-check-all').addEventListener('change', handleCheckAll);
  $('btn-add-mapping').addEventListener('click', addMapping);
}

// ── Tab / 引擎状态 ──────────────────────────────────────
async function refreshTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tab;
    const url = tab.url || '';
    const isHttp = /^https?:/.test(url);
    $('fill-status').textContent = isHttp
      ? '已就绪 - 点击下方按钮填充当前页面'
      : '请在普通网页（http/https）中使用';
    $('fill-status').className = 'status-box ' + (isHttp ? 'ready' : '');
    $('btn-fill').disabled = !isHttp;
    $('btn-preview').disabled = !isHttp;
  } catch (e) {
    $('fill-status').textContent = '无法获取当前标签页';
    $('btn-fill').disabled = true;
    $('btn-preview').disabled = true;
  }
}

// ── 档案状态 ────────────────────────────────────────────
function refreshProfileStatus() {
  chrome.storage.local.get([PROFILE_KEY], result => {
    const profile = result[PROFILE_KEY];
    const box = $('profile-status');
    const info = $('profile-info');
    if (profile && profile.data) {
      const d = profile.data;
      box.textContent = '档案已载入';
      box.className = 'status-box ready';
      info.style.display = 'block';
      $('info-name').textContent = d.name || '未填';
      $('info-phone').textContent = d.phone ? String(d.phone).replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : '未填';
      const now = new Date();
      const age = d.birthYear ? (now.getFullYear() - d.birthYear) : null;
      $('info-birth').textContent = d.birthMonth ? `${d.birthYear || '?'}-${String(d.birthMonth).padStart(2, '0')}` : '未填';
      $('info-intern').textContent = Array.isArray(d.internships) ? `${d.internships.length} 段` : '0 段';
      $('info-updated').textContent = profile.updatedAt
        ? new Date(profile.updatedAt).toLocaleString('zh-CN', { hour12: false })
        : '未知';
      $('btn-export').disabled = false;
    } else {
      box.textContent = '尚未导入档案 - 请先从主站导出并导入';
      box.className = 'status-box';
      info.style.display = 'none';
      $('btn-export').disabled = true;
    }
  });
}

// ── 导入 / 导出 / 清除 ─────────────────────────────────
function triggerImport() { $('file-input').click(); }

function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      let loaded = JSON.parse(ev.target.result);
      // 兼容主站导出格式：敏感字段在 _sensitive 里
      if (loaded._sensitive) {
        Object.assign(loaded, loaded._sensitive);
        delete loaded._sensitive;
      }
      if (!loaded || typeof loaded !== 'object' || Array.isArray(loaded)) {
        throw new Error('not object');
      }
      // 容错：用户直接粘了 { data: {...} } 结构
      const data = loaded.data && typeof loaded.data === 'object' ? loaded.data : loaded;
      if (!('name' in data) && !('phone' in data) && !('gradSchool' in data)) {
        throw new Error('no recognizable fields');
      }
      chrome.storage.local.set({
        [PROFILE_KEY]: { data, updatedAt: Date.now() }
      }, () => {
        refreshProfileStatus();
        alert(`导入成功！\n\n姓名：${data.name || '未填'}\n实习：${(data.internships || []).length} 段\n项目：${(data.projects || []).length} 个\n\n现在打开网申页面，点击"一键填充"即可。`);
      });
    } catch (err) {
      alert('导入失败：文件不是有效的档案 JSON。\n\n请先在主站完成填写并点击"导出档案"，再导入到本插件。');
    }
    e.target.value = '';
  };
  reader.readAsText(file);
}

function handleExport() {
  chrome.storage.local.get([PROFILE_KEY], result => {
    const profile = result[PROFILE_KEY];
    if (!profile) return;
    const blob = new Blob([JSON.stringify(profile.data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const name = (profile.data.name || '未命名').replace(/[\\/:*?"<>|]/g, '');
    a.download = `秋招档案_${name}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

function handleClear() {
  if (!confirm('确定要清除插件中存储的档案吗？\n\n（不影响主站数据，可随时重新导入）')) return;
  chrome.storage.local.remove([PROFILE_KEY], () => {
    refreshProfileStatus();
    resetReport();
  });
}

// ── 一键填充 ────────────────────────────────────────────
async function handleFill() {
  const btn = $('btn-fill');
  btn.disabled = true;
  btn.textContent = '正在填充...';
  resetReport();
  try {
    const result = await sendFillCommand();
    renderReport(result);
  } catch (e) {
    // 引擎未注入（页面加载早于插件安装 / 无权限），注入后重试一次
    try {
      await injectEngine();
      const result = await sendFillCommand();
      renderReport(result);
    } catch (e2) {
      alert('填充失败：无法与页面通信。\n\n请刷新网申页面后重试。若问题持续，请确认该页面不是 chrome:// 内部页面。');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = '⚡ 一键填充当前页面';
    await refreshTab();
  }
}

// 先读档案，再发给 content script 执行填充
function sendFillCommand() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([PROFILE_KEY], result => {
      const stored = result[PROFILE_KEY];
      if (!stored || !stored.data) {
        alert('尚未导入档案。请先从主站导出档案 JSON，再点击上方"导入档案"。');
        return reject(new Error('no profile'));
      }
      chrome.tabs.sendMessage(
        currentTab.id,
        { action: 'START_AUTOFILL', profile: stored.data },
        response => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (!response) return reject(new Error('no response'));
          if (!response.success) return resolve({ ok: false, error: response.error || '填充失败' });
          resolve({ ok: true, ...response.report });
        }
      );
    });
  });
}

function injectEngine() {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      files: ['content/adapters.js', 'content/main.js']
    }, results => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      resolve(results);
    });
  });
}

// ── 结果渲染 ────────────────────────────────────────────
function renderReport(result) {
  if (!result || !result.ok || !result.summary) {
    $('stat-total').textContent = result && result.total ? result.total : '–';
    $('stat-filled').textContent = '0';
    renderDetails([{ status: 'nomatch', label: result && result.error ? result.error : '填充失败' }]);
    return;
  }
  const s = result.summary;
  $('stat-total').textContent = s.total;
  $('stat-filled').textContent = s.filled;
  $('stat-pending').textContent = s.pending + s.empty;
  $('stat-nomatch').textContent = s.noMatch;
  // 优先展示待补填 + 空值，其次无匹配
  const items = []
    .concat(result.pending || [])
    .concat(result.empty || [])
    .concat((result.noMatch || []).slice(0, 10));
  renderDetails(items.map(it => ({ status: 'pending', label: `${it.label}${it.reason ? '（' + it.reason + '）' : ''}` })));
  // 高风险 checkbox 单独展示
  renderManualConfirm(result.manualConfirm || []);
}

function resetReport() {
  ['stat-total', 'stat-filled', 'stat-pending', 'stat-nomatch'].forEach(id => $(id).textContent = '–');
  $('detail-list').innerHTML = '';
  $('manual-confirm-section').style.display = 'none';
  $('manual-confirm-list').innerHTML = '';
  $('preview-section').style.display = 'none';
  $('preview-list').innerHTML = '';
}

function renderDetails(items) {
  const list = $('detail-list');
  list.innerHTML = '';
  if (!items || items.length === 0) {
    list.innerHTML = '<div class="detail-item nomatch">🎉 全部字段匹配成功，无待处理项</div>';
    return;
  }
  items.slice(0, 30).forEach(it => {
    const div = document.createElement('div');
    div.className = 'detail-item ' + (it.status === 'pending' ? 'pending' : 'nomatch');
    const label = it.label || it.field || '未知字段';
    div.textContent = it.status === 'pending'
      ? `待填：${label}`
      : label;
    list.appendChild(div);
  });
  if (items.length > 30) {
    const more = document.createElement('div');
    more.className = 'detail-item nomatch';
    more.textContent = `... 还有 ${items.length - 30} 项`;
    list.appendChild(more);
  }
}

function renderManualConfirm(items) {
  const section = $('manual-confirm-section');
  const list = $('manual-confirm-list');
  if (!items || items.length === 0) {
    section.style.display = 'none';
    list.innerHTML = '';
    return;
  }
  section.style.display = 'block';
  list.innerHTML = '';
  items.forEach(it => {
    const div = document.createElement('div');
    div.className = 'detail-item manual';
    div.textContent = it.label || it.fieldName || '未知字段';
    list.appendChild(div);
  });
}

// ── 预览匹配 ────────────────────────────────────────────
let currentPreviewPlan = [];

async function handlePreview() {
  const btn = $('btn-preview');
  btn.disabled = true;
  btn.textContent = '正在分析...';
  resetReport();
  try {
    const result = await sendPreviewCommand();
    if (result.ok && result.preview) {
      currentPreviewPlan = result.preview;
      renderPreview(currentPreviewPlan);
    } else {
      alert('预览失败：' + (result.error || '无法获取匹配结果'));
    }
  } catch (e) {
    try {
      await injectEngine();
      const result = await sendPreviewCommand();
      if (result.ok && result.preview) {
        currentPreviewPlan = result.preview;
        renderPreview(currentPreviewPlan);
      } else {
        alert('预览失败：' + (result.error || '无法获取匹配结果'));
      }
    } catch (e2) {
      alert('预览失败：无法与页面通信。\n\n请刷新网申页面后重试。');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = '🔍 预览匹配结果';
  }
}

function sendPreviewCommand() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([PROFILE_KEY], result => {
      const stored = result[PROFILE_KEY];
      if (!stored || !stored.data) {
        alert('尚未导入档案。请先从主站导出档案 JSON，再点击上方"导入档案"。');
        return reject(new Error('no profile'));
      }
      chrome.tabs.sendMessage(
        currentTab.id,
        { action: 'PREVIEW_MATCH', profile: stored.data },
        response => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (!response) return reject(new Error('no response'));
          if (!response.success) return resolve({ ok: false, error: response.error || '预览失败' });
          resolve({ ok: true, preview: response.preview, stats: response.stats });
        }
      );
    });
  });
}

function renderPreview(items) {
  const section = $('preview-section');
  const list = $('preview-list');
  const countEl = $('preview-count');
  section.style.display = 'block';
  list.innerHTML = '';
  countEl.textContent = `${items.length} 项`;

  items.forEach((it, idx) => {
    const row = document.createElement('div');
    row.className = 'preview-row';
    row.dataset.index = idx;

    // 复选框
    const chkWrap = document.createElement('div');
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = it.checked !== false;
    chk.dataset.index = idx;
    chk.addEventListener('change', updateCheckAllState);
    chkWrap.appendChild(chk);

    // 字段标签
    const label = document.createElement('div');
    label.className = 'preview-label';
    label.title = it.semanticLabel;
    label.textContent = it.semanticLabel || '未知字段';

    // 值（可编辑）
    const valWrap = document.createElement('div');
    valWrap.className = 'preview-value';
    const valInput = document.createElement('input');
    valInput.type = 'text';
    valInput.value = it.value || '';
    valInput.placeholder = '空值';
    valInput.dataset.index = idx;
    valInput.dataset.field = 'value';
    valWrap.appendChild(valInput);

    // 状态标签
    const badge = document.createElement('div');
    badge.className = 'preview-badge';
    if (it.confidence >= 1.0) { badge.className += ' exact'; badge.textContent = '精确'; }
    else if (it.confidence >= 0.7) { badge.className += ' fuzzy'; badge.textContent = '模糊'; }
    else if (it.confidence > 0) { badge.className += ' empty'; badge.textContent = '空值'; }
    else { badge.className += ' nomatch'; badge.textContent = '无匹配'; }

    row.appendChild(chkWrap);
    row.appendChild(label);
    row.appendChild(valWrap);
    row.appendChild(badge);
    list.appendChild(row);
  });

  $('preview-check-all').checked = true;
}

function handleCheckAll(e) {
  const checked = e.target.checked;
  const rows = $('preview-list').querySelectorAll('.preview-row input[type="checkbox"]');
  rows.forEach(chk => chk.checked = checked);
}

function updateCheckAllState() {
  const rows = $('preview-list').querySelectorAll('.preview-row input[type="checkbox"]');
  const allChecked = Array.from(rows).every(chk => chk.checked);
  $('preview-check-all').checked = allChecked;
}

async function handleConfirmFill() {
  if (!currentPreviewPlan || currentPreviewPlan.length === 0) return;
  const rows = $('preview-list').querySelectorAll('.preview-row');
  const plan = [];
  rows.forEach(row => {
    const idx = parseInt(row.dataset.index, 10);
    const chk = row.querySelector('input[type="checkbox"]');
    if (!chk.checked) return;
    const valInput = row.querySelector('input[data-field="value"]');
    const original = currentPreviewPlan[idx];
    plan.push({
      target: original.target,
      fieldType: original.fieldType,
      semanticLabel: original.semanticLabel,
      value: valInput ? valInput.value : original.value,
      confidence: original.confidence,
      fieldName: original.fieldName,
      sourceField: original.sourceField,
      reason: original.reason,
      caseSensitive: false
    });
  });

  if (plan.length === 0) {
    alert('请至少勾选一项进行填充');
    return;
  }

  const btn = $('btn-confirm-fill');
  btn.disabled = true;
  btn.textContent = '正在填充...';
  try {
    const result = await sendConfirmFill(plan);
    if (result.ok) {
      $('preview-section').style.display = 'none';
      renderReport(result);
    } else {
      alert('填充失败：' + (result.error || '未知错误'));
    }
  } catch (e) {
    alert('填充失败：' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '✅ 确认填充已选项';
  }
}

function sendConfirmFill(plan) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(
      currentTab.id,
      { action: 'CONFIRM_FILL', plan },
      response => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!response) return reject(new Error('no response'));
        if (!response.success) return resolve({ ok: false, error: response.error || '填充失败' });
        resolve({ ok: true, ...response.report });
      }
    );
  });
}

// ── 自定义字段映射 ──────────────────────────────────────
const SCHEMA_FIELDS = [
  // 基础信息
  { key: 'name', label: '姓名', group: '基础信息' },
  { key: 'gender', label: '性别', group: '基础信息' },
  { key: 'birthMonth', label: '出生年月', group: '基础信息' },
  { key: 'phone', label: '手机号', group: '基础信息' },
  { key: 'email', label: '邮箱', group: '基础信息' },
  { key: 'currentCity', label: '现居城市', group: '基础信息' },
  { key: 'politicalStatus', label: '政治面貌', group: '基础信息' },
  { key: 'partyJoinDate', label: '入党时间', group: '基础信息' },
  { key: 'ethnicity', label: '民族', group: '基础信息' },
  { key: 'nativePlace', label: '籍贯', group: '基础信息' },
  { key: 'hukou', label: '户口所在地', group: '基础信息' },
  { key: 'maritalStatus', label: '婚姻状况', group: '基础信息' },
  { key: 'height', label: '身高', group: '基础信息' },
  { key: 'idNumber', label: '身份证号', group: '基础信息' },
  { key: 'emergencyContact', label: '紧急联系人', group: '基础信息' },
  { key: 'github', label: 'GitHub', group: '基础信息' },
  { key: 'blog', label: '技术博客', group: '基础信息' },
  // 教育背景
  { key: 'gradSchool', label: '研究生院校', group: '教育背景' },
  { key: 'gradCollege', label: '学院', group: '教育背景' },
  { key: 'gradMajor', label: '专业', group: '教育背景' },
  { key: 'gradDegreeType', label: '学位类型', group: '教育背景' },
  { key: 'gradStart', label: '入学时间', group: '教育背景' },
  { key: 'gradEnd', label: '毕业时间', group: '教育背景' },
  { key: 'gradGpa', label: 'GPA', group: '教育背景' },
  { key: 'gradRank', label: '专业排名', group: '教育背景' },
  { key: 'advisor', label: '导师', group: '教育背景' },
  { key: 'researchArea', label: '研究方向', group: '教育背景' },
  { key: 'thesisTitle', label: '论文题目', group: '教育背景' },
  { key: 'ugSchool', label: '本科院校', group: '教育背景' },
  { key: 'ugMajor', label: '本科专业', group: '教育背景' },
  { key: 'ugTier', label: '院校层次', group: '教育背景' },
  { key: 'ugStart', label: '本科入学时间', group: '教育背景' },
  { key: 'ugEnd', label: '本科毕业时间', group: '教育背景' },
  { key: 'ugGpa', label: '本科GPA', group: '教育背景' },
  { key: 'ugRank', label: '本科排名', group: '教育背景' },
  { key: 'highSchool', label: '高中学校', group: '教育背景' },
  { key: 'mainCourses', label: '主修课程', group: '教育背景' },
  // 职业意向
  { key: 'targetDirections', label: '岗位方向', group: '职业意向' },
  { key: 'targetCities', label: '目标城市', group: '职业意向' },
  { key: 'salaryFloor', label: '年薪底线', group: '职业意向' },
  // 技能与荣誉
  { key: 'skillsProficient', label: '熟练技能', group: '技能与荣誉' },
  { key: 'skillsFamiliar', label: '熟悉技能', group: '技能与荣誉' },
  { key: 'skillsKnown', label: '了解技能', group: '技能与荣誉' },
  { key: 'skillGaps', label: '已知缺口', group: '技能与荣誉' },
  { key: 'certificates', label: '证书', group: '技能与荣誉' },
  { key: 'honorsNational', label: '国家级奖项', group: '技能与荣誉' },
  { key: 'honorsSchool', label: '校级奖项', group: '技能与荣誉' },
  { key: 'scholarships', label: '奖学金', group: '技能与荣誉' },
  { key: 'papers', label: '论文/专利', group: '技能与荣誉' },
  // 学生工作
  { key: 'campusRoles', label: '学生干部经历', group: '学生工作' },
  { key: 'volunteer', label: '志愿服务', group: '学生工作' },
  { key: 'socialPractice', label: '社会实践', group: '学生工作' },
  // 自我评价
  { key: 'selfSummary', label: '自我评价', group: '自我评价' },
  { key: 'extraNotes', label: '其他补充', group: '自我评价' },
  // 实习经历（数组，预生成前3项）
  { key: 'internships[0].company', label: '实习单位1', group: '实习经历' },
  { key: 'internships[0].role', label: '实习岗位1', group: '实习经历' },
  { key: 'internships[0].start', label: '实习开始1', group: '实习经历' },
  { key: 'internships[0].end', label: '实习结束1', group: '实习经历' },
  { key: 'internships[0].department', label: '实习部门1', group: '实习经历' },
  { key: 'internships[1].company', label: '实习单位2', group: '实习经历' },
  { key: 'internships[1].role', label: '实习岗位2', group: '实习经历' },
  { key: 'internships[1].start', label: '实习开始2', group: '实习经历' },
  { key: 'internships[1].end', label: '实习结束2', group: '实习经历' },
  { key: 'internships[1].department', label: '实习部门2', group: '实习经历' },
  { key: 'internships[2].company', label: '实习单位3', group: '实习经历' },
  { key: 'internships[2].role', label: '实习岗位3', group: '实习经历' },
  { key: 'internships[2].start', label: '实习开始3', group: '实习经历' },
  { key: 'internships[2].end', label: '实习结束3', group: '实习经历' },
  { key: 'internships[2].department', label: '实习部门3', group: '实习经历' },
  // 项目经历（数组，预生成前3项）
  { key: 'projects[0].name', label: '项目名称1', group: '项目经历' },
  { key: 'projects[0].myRole', label: '项目角色1', group: '项目经历' },
  { key: 'projects[1].name', label: '项目名称2', group: '项目经历' },
  { key: 'projects[1].myRole', label: '项目角色2', group: '项目经历' },
  { key: 'projects[2].name', label: '项目名称3', group: '项目经历' },
  { key: 'projects[2].myRole', label: '项目角色3', group: '项目经历' },
  // 家庭成员（数组，预生成前3项）
  { key: 'familyMembers[0].name', label: '家庭成员姓名1', group: '家庭成员' },
  { key: 'familyMembers[0].relation', label: '与本人关系1', group: '家庭成员' },
  { key: 'familyMembers[0].workplace', label: '工作单位1', group: '家庭成员' },
  { key: 'familyMembers[0].position', label: '职务1', group: '家庭成员' },
  { key: 'familyMembers[0].age', label: '年龄1', group: '家庭成员' },
  { key: 'familyMembers[1].name', label: '家庭成员姓名2', group: '家庭成员' },
  { key: 'familyMembers[1].relation', label: '与本人关系2', group: '家庭成员' },
  { key: 'familyMembers[1].workplace', label: '工作单位2', group: '家庭成员' },
  { key: 'familyMembers[1].position', label: '职务2', group: '家庭成员' },
  { key: 'familyMembers[1].age', label: '年龄2', group: '家庭成员' },
  { key: 'familyMembers[2].name', label: '家庭成员姓名3', group: '家庭成员' },
  { key: 'familyMembers[2].relation', label: '与本人关系3', group: '家庭成员' },
  { key: 'familyMembers[2].workplace', label: '工作单位3', group: '家庭成员' },
  { key: 'familyMembers[2].position', label: '职务3', group: '家庭成员' },
  { key: 'familyMembers[2].age', label: '年龄3', group: '家庭成员' }
];

function initMappingUI() {
  const select = $('map-field');
  select.innerHTML = '';
  let currentGroup = null;
  let optgroup = null;
  SCHEMA_FIELDS.forEach(f => {
    if (f.group !== currentGroup) {
      currentGroup = f.group;
      optgroup = document.createElement('optgroup');
      optgroup.label = f.group;
      select.appendChild(optgroup);
    }
    const opt = document.createElement('option');
    opt.value = f.key;
    opt.textContent = f.label;
    optgroup.appendChild(opt);
  });
  refreshMappingList();
}

function refreshMappingList() {
  chrome.storage.local.get('userSynonyms', result => {
    const rules = result.userSynonyms || {};
    const list = $('mapping-list');
    list.innerHTML = '';
    const keys = Object.keys(rules);
    if (keys.length === 0) {
      list.innerHTML = '<div class="mapping-row"><span style="color:#a0aec0;">暂无自定义映射</span></div>';
      return;
    }
    keys.forEach(label => {
      const cfg = rules[label];
      const fieldDef = SCHEMA_FIELDS.find(f => f.key === cfg.fieldPath);
      const row = document.createElement('div');
      row.className = 'mapping-row';
      row.innerHTML = `<span title="${label}">${label} → ${fieldDef?.label || cfg.fieldPath}</span><button data-label="${label.replace(/"/g, '&quot;')}">删除</button>`;
      row.querySelector('button').addEventListener('click', e => deleteMapping(e.target.dataset.label));
      list.appendChild(row);
    });
  });
}

function addMapping() {
  const label = $('map-label').value.trim();
  const fieldPath = $('map-field').value;
  if (!label) { alert('请输入网页上的字段名'); return; }
  if (!fieldPath) { alert('请选择档案字段'); return; }
  const fieldDef = SCHEMA_FIELDS.find(f => f.key === fieldPath);
  chrome.storage.local.get('userSynonyms', result => {
    const rules = result.userSynonyms || {};
    rules[label] = { fieldPath, fieldName: fieldDef?.label || fieldPath, fieldType: fieldDef ? 'text' : 'text' };
    chrome.storage.local.set({ userSynonyms: rules }, () => {
      $('map-label').value = '';
      refreshMappingList();
    });
  });
}

function deleteMapping(label) {
  chrome.storage.local.get('userSynonyms', result => {
    const rules = result.userSynonyms || {};
    delete rules[label];
    chrome.storage.local.set({ userSynonyms: rules }, refreshMappingList);
  });
}
