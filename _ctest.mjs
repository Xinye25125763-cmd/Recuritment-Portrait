// 阶段C 逻辑验证：筛选器 + 配置面板 + 标记投递
import { readFileSync } from 'node:fs';
import { analyzePortrait } from './src/portrait-engine.js';
import { matchAll, applyDealBreakers, normalizeLocation } from './src/match-engine.js';

const lib = JSON.parse(readFileSync('./jobs/jd-library.json', 'utf-8'));
const jobs = lib.jobs;

const profile = {
  graduationYear: '2027',
  targetTracks: ['互联网大厂', '央国企'],
  highestDegree: '硕士',
  targetDirections: ['数据分析', 'BI/商业分析', '产品经理'],
  targetCities: ['北京', '上海'],
  trackWeight: '两边都行',
  dealBreakers: ['销售性质'],
  skillsProficient: 'SQL — 实习中亿级数据取数\nExcel — 数据透视与经营报表\nTableau — 搭建过业务看板',
  skillsFamiliar: 'Python、Hive、Axure',
  skillsKnown: 'Spark、Hadoop',
  skillGaps: 'Python 机器学习\n大模型应用',
  internships: [{
    company: '美团', role: '数据运营实习生', background: '境外业务经营分析',
    responsibilities: '负责Keeta业务的经营数据监控与日报搭建，覆盖指标体系设计\n对GMV异动做拆解与归因分析\n搭建 DAU 预测模型',
    metrics: '看板被3个业务线使用', techStack: 'SQL, Hive, Tableau, Python',
    employmentType: '实习', start: '2024-03', isOngoing: true,
  }],
  projects: [],
};

const portrait = analyzePortrait(profile);
const { kept, excluded } = applyDealBreakers(jobs, profile);
const results = matchAll(kept, profile, portrait);

// ── 模拟筛选器 ──
function applyFilters(results, filters) {
  return results.filter(r => {
    if (filters.track?.length && !filters.track.includes(r.job.track)) return false;
    if (filters.company?.length && !filters.company.includes(r.job.company)) return false;
    if (filters.program?.length && !filters.program.includes(r.job.program)) return false;
    if (filters.empType?.length && !filters.empType.includes(r.job.employmentType)) return false;
    if (filters.location?.length) {
      const jobLocs = new Set((r.job.locations || []).map(normalizeLocation));
      const hit = filters.location.some(l => jobLocs.has(l));
      if (!hit) return false;
    }
    return true;
  });
}

// 1. 无筛选
const f0 = applyFilters(results, {});
console.log('no filter:', f0.length, '===', results.length);

// 2. 只保留 数据分析
const f1 = applyFilters(results, { track: ['数据分析'] });
console.log('filter 数据分析:', f1.length, 'all tracks:', [...new Set(f1.map(r=>r.job.track))]);

// 3. 只保留 字节跳动 + 北京
const f2 = applyFilters(results, { company: ['字节跳动'], location: ['北京'] });
console.log('filter 字节+北京:', f2.length, 'samples:', f2.slice(0,3).map(r=>`${r.job.company}|${r.job.title}|${r.job.locations}`));

// 4. 只保留 日常实习
const f3 = applyFilters(results, { program: ['日常实习'] });
console.log('filter 日常实习:', f3.length);

// 5. 多重筛选（数据分析 + 北京 + 2027届校园招聘）
const f4 = applyFilters(results, { track: ['数据分析'], location: ['北京'], program: ['2027届校园招聘'] });
console.log('filter 数据分析+北京+2027校招:', f4.length);

// ── 模拟配置面板重匹配 ──
const tempParams = {
  targetDirections: ['数据分析'],
  targetCities: ['北京'],
  graduationYear: '2027',
  dealBreakers: ['销售性质'],
  trackWeight: '强烈倾向互联网',
};
const merged = { ...profile, ...tempParams };
const { kept: k2, excluded: e2 } = applyDealBreakers(jobs, merged);
const results2 = matchAll(k2, merged, portrait);
console.log('reMatch 只投数据分析+北京+强烈互联网:', results2.length, 'excluded:', e2.length);
console.log('top3 after rematch:', results2.slice(0,3).map(r=>`${r.score} ${r.job.company}|${r.job.title}|${r.job.track}`));

// ── 模拟标记投递 ──
const appliedMap = {};
const mark = (jobId, status='interested') => { appliedMap[jobId] = { status, markedAt: new Date().toISOString() }; };
mark(results[0].job.id, 'interested');
mark(results[1].job.id, 'applied');
console.log('applied map:', Object.keys(appliedMap).length, 'entries');

// ── 模拟导出字段检查 ──
const exportJob = results[0];
const exportObj = {
  id: exportJob.job.id,
  company: exportJob.job.company,
  title: exportJob.job.title,
  score: exportJob.score,
  level: exportJob.level,
  reasons: exportJob.reasons,
  gaps: exportJob.gaps,
  url: exportJob.job.url,
  appliedStatus: appliedMap[exportJob.job.id]?.status || null,
};
console.log('export object keys:', Object.keys(exportObj).join(', '));

// ── filterOptions 动态提取 ──
const opts = { track: new Set(), company: new Set(), program: new Set(), location: new Set(), empType: new Set() };
results.forEach(r => {
  if (r.job.track) opts.track.add(r.job.track);
  if (r.job.company) opts.company.add(r.job.company);
  if (r.job.program) opts.program.add(r.job.program);
  if (r.job.employmentType) opts.empType.add(r.job.employmentType);
  (r.job.locations || []).forEach(l => { const nl = normalizeLocation(l); if (nl) opts.location.add(nl); });
});
console.log('filterOptions:', {
  track: [...opts.track],
  company: [...opts.company],
  program: [...opts.program],
  empType: [...opts.empType],
  locationCount: opts.location.size,
});

console.log('\nall checks passed');
