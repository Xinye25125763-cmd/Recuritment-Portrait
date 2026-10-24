import { ExperienceMiner } from './src/experience-miner.js';

const { analyze, getQuestionTree, getNextQuestion, generateBullet, evaluateFiveDimensions, createSession, saveSession, loadSessions, addIntention, removeIntention, getIntentions, isIntention, saveToProfile, getAdoptedBullets, getMiningStats } = ExperienceMiner;

// Mock localStorage for Node.js environment
const localStorage = {
  data: {},
  getItem(key) { return this.data[key] || null; },
  setItem(key, val) { this.data[key] = val; },
  removeItem(key) { delete this.data[key]; }
};
global.localStorage = localStorage;

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`✅ ${msg}`); }
  else { failed++; console.error(`❌ ${msg}`); }
}

// ── Test Data ──
const profile = {
  name: '测试用户',
  skillList: [
    { name: 'SQL', level: '熟练' },
    { name: 'Python', level: '熟练' },
    { name: 'Tableau', level: '熟悉' },
    { name: 'AB测试', level: '了解' }
  ],
  internships: [
    {
      company: '美团',
      role: '数据分析实习生',
      highlights: ['独立设计活动效果评估指标体系', 'SQL处理亿级数据'],
      _mined: []
    },
    {
      company: '字节跳动',
      role: '商业分析实习生',
      highlights: ['搭建业务指标体系', '完成竞品分析报告'],
      _mined: []
    }
  ],
  projects: [
    {
      name: '用户增长分析',
      highlights: ['搭建指标体系', 'AB实验分析', '用户分群研究'],
      _mined: []
    }
  ]
};

const job = {
  id: 'A167767',
  company: '字节跳动',
  title: '经营分析 - 抖音电商',
  keywords: ['指标体系', 'AB实验', 'SQL', '用户增长', '商业分析', '数据挖掘', '竞品分析']
};

console.log('=== Experience Miner Smoke Test ===\n');

// 1. Test analyze()
console.log('--- 1. analyze() ---');
const analysis = analyze(job, profile, {});
assert(Array.isArray(analysis) && analysis.length === 7, `analyze returns 7 results (got ${analysis.length})`);

const tiers = { covered: 0, mineable: 0, missing: 0 };
analysis.forEach(a => { tiers[a.tier]++; });
console.log(`   Tiers: covered=${tiers.covered}, mineable=${tiers.mineable}, missing=${tiers.missing}`);

assert(tiers.covered >= 1, `covered >= 1 (got ${tiers.covered})`); // SQL covered; AB实验 skillList是'AB测试'未精确匹配'AB实验'
assert(tiers.mineable >= 2, `mineable >= 2 (got ${tiers.mineable})`); // 指标体系, 用户增长, 商业分析, 竞品分析, AB实验
assert(tiers.missing >= 1, `missing >= 1 (got ${tiers.missing})`); // 数据挖掘

const abResult = analysis.find(a => a.keyword === 'AB实验');
assert(abResult?.tier === 'mineable', `AB实验 tier=mineable (got ${abResult?.tier})`);
assert(abResult?.matchedExperiences?.length > 0, 'AB实验 matchedExperiences > 0');

const sqlResult = analysis.find(a => a.keyword === 'SQL');
assert(sqlResult?.tier === 'covered', `SQL tier=covered (got ${sqlResult?.tier})`);
assert(sqlResult?.source === 'skill', 'SQL source=skill');

const miningResult = analysis.find(a => a.keyword === '数据挖掘');
assert(miningResult?.tier === 'missing', `数据挖掘 tier=missing (got ${miningResult?.tier})`);

// 2. Test getQuestionTree()
console.log('\n--- 2. getQuestionTree() ---');
const abTree = getQuestionTree('AB实验');
assert(abTree?.steps?.length > 0, 'AB实验 question tree has steps');
assert(abTree.steps[0].id === 'has_experiment', 'AB实验 first step = has_experiment');

const defaultTree = getQuestionTree('不存在的keyword');
assert(defaultTree?.steps?.length > 0, 'default question tree exists');
assert(defaultTree.steps[0].id === 'has_relevant', 'default first step = has_relevant');

// 3. Test getNextQuestion()
console.log('\n--- 3. getNextQuestion() ---');
const session = createSession('A167767', '经营分析', 'AB实验', 'intern_0', 'internship');
const q1 = getNextQuestion(session, 'AB实验', profile);
assert(q1?.id === 'has_experiment', 'q1 id = has_experiment');
assert(q1?.type === 'choice', 'q1 type = choice');
assert(q1?.question.includes('对照组实验'), 'q1 question includes 对照组实验');

// Simulate answering q1
session.qaLog.push({ stepId: 'has_experiment', answer: '做过对照实验', type: 'choice' });
const q2 = getNextQuestion(session, 'AB实验', profile);
assert(q2?.id === 'metrics', 'q2 id = metrics');
assert(q2?.type === 'text', 'q2 type = text');

// Simulate answering remaining questions
session.qaLog.push({ stepId: 'metrics', answer: '转化率', type: 'text' });
session.qaLog.push({ stepId: 'sample_size', answer: '5万用户', type: 'text' });
session.qaLog.push({ stepId: 'result', answer: '策略A 12% vs 策略B 8%', type: 'text' });
session.qaLog.push({ stepId: 'impact', answer: '驱动策略迭代上线', type: 'text' });
const qNull = getNextQuestion(session, 'AB实验', profile);
assert(qNull === null, 'all questions answered -> null');

// 4. Test generateBullet()
console.log('\n--- 4. generateBullet() ---');
const bullet = generateBullet(session, 'AB实验', profile.internships[0]);
assert(bullet.length > 20, `bullet length > 20 (got ${bullet.length})`);
assert(bullet.includes('5万'), 'bullet includes 5万');
assert(bullet.includes('策略A 12% vs 策略B 8%'), 'bullet preserves the user-provided result without inventing an uplift');
console.log(`   Generated: ${bullet}`);

// 5. Test evaluateFiveDimensions()
console.log('\n--- 5. evaluateFiveDimensions() ---');
const eval5 = evaluateFiveDimensions(bullet, 'AB实验', job);
assert(eval5.total > 0, 'five dim total > 0');
assert(eval5.max === 100, 'five dim max = 100');
assert(eval5.level, 'five dim has level');
assert(eval5.relevance.score >= 10, 'relevance score >= 10');
assert(eval5.quantification.score >= 10, 'quantification score >= 10');
assert(eval5.impact.score >= 10, 'impact score >= 10');
assert(eval5.professionalism.score >= 10, 'professionalism score >= 10');
assert(eval5.readability.score >= 10, 'readability score >= 10');
console.log(`   Total: ${eval5.total}/100 (${eval5.level})`);
console.log(`   Relevance: ${eval5.relevance.score}, Quantification: ${eval5.quantification.score}, Impact: ${eval5.impact.score}, Professionalism: ${eval5.professionalism.score}, Readability: ${eval5.readability.score}`);

// 6. Test session management
console.log('\n--- 6. Session Management ---');
const s2 = createSession('A167767', '经营分析', '指标体系', 'intern_0', 'internship');
s2.qaLog.push({ stepId: 'has_metrics', answer: '从零搭建过', type: 'choice' });
s2.qaLog.push({ stepId: 'metrics_scope', answer: '10个核心指标，分三层', type: 'text' });
s2.qaLog.push({ stepId: 'metrics_tool', answer: 'SQL + Tableau', type: 'text' });
s2.qaLog.push({ stepId: 'metrics_impact', answer: '帮助运营发现活动ROI偏低', type: 'text' });
s2.generatedBullets.push(generateBullet(s2, '指标体系', profile.internships[0]));
s2.isAdopted = true;

saveSession(session);
saveSession(s2);

const loaded = loadSessions('A167767');
assert(loaded.length === 2, `loadSessions returns 2 (got ${loaded.length})`);
assert(loaded.some(s => s.keyword === 'AB实验'), 'loaded includes AB实验 session');
assert(loaded.some(s => s.keyword === '指标体系'), 'loaded includes 指标体系 session');

// 7. Test intention management
console.log('\n--- 7. Intention Management ---');
const intentionJob = { id: 'J001', company: '字节', companyType: '央国企', title: '测试', track: '数据分析', locations: ['北京'], program: '校招', source: 'givemeoc', sourceListing: '数据分析师', descriptionType: 'position_listing', _matchScore: 80, _matchLevel: 'strong' };
addIntention(intentionJob);
assert(isIntention('J001'), 'isIntention J001 = true');
assert(!isIntention('J999'), 'isIntention J999 = false');

const intentions = getIntentions();
assert(intentions.length === 1, `getIntentions returns 1 (got ${intentions.length})`);
assert(intentions[0].jobId === 'J001', 'intention jobId = J001');
assert(intentions[0].jobSnapshot?.title === '测试', 'intention stores job snapshot for later recovery');
assert(intentions[0].jobSnapshot?.sourceListing === '数据分析师', 'snapshot retains source position fragment');

removeIntention('J001');
assert(!isIntention('J001'), 'after remove, isIntention J001 = false');
assert(getIntentions().length === 0, 'after remove, intentions = 0');

// 8. Test saveToProfile
console.log('\n--- 8. saveToProfile() ---');
const testProfile = JSON.parse(JSON.stringify(profile)); // deep copy
const updated = saveToProfile(s2, testProfile);
assert(updated !== null, 'saveToProfile returns profile');
assert(updated.internships[0]._mined.length === 1, 'internship has 1 mined bullet');
assert(updated.internships[0]._mined[0].keyword === '指标体系', 'mined keyword = 指标体系');
assert(updated.internships[0]._mined[0].bullet.length > 0, 'mined bullet has content');
console.log(`   Mined bullet: ${updated.internships[0]._mined[0].bullet}`);

// 9. Test getAdoptedBullets
console.log('\n--- 9. getAdoptedBullets() ---');
const bullets = getAdoptedBullets(updated);
assert(bullets.length === 1, `getAdoptedBullets returns 1 (got ${bullets.length})`);
assert(bullets[0].keyword === '指标体系', 'adopted bullet keyword = 指标体系');

// 10. Test getMiningStats
console.log('\n--- 10. getMiningStats() ---');
const stats = getMiningStats(updated);
assert(stats.totalSessions === 2, `stats.totalSessions = 2 (got ${stats.totalSessions})`);
assert(stats.completed === 1, `stats.completed = 1 (got ${stats.completed})`); // only s2 is adopted
assert(stats.totalBullets > 0, 'stats.totalBullets > 0');
console.log(`   Stats: ${JSON.stringify(stats)}`);

// 11. Test deduplication in generateBullet
console.log('\n--- 11. deduplicateBullet() ---');
const dupSession = createSession('job-dup', '测试岗位', '商业分析', 'intern_0', 'internship');
dupSession.qaLog = [
  { stepId: 'has_biz', question: 'q', answer: '做过，有明确的商业目标', at: '2024-01-01' },
  { stepId: 'biz_scope', question: 'q', answer: '市场规模和竞品动态', at: '2024-01-01' },
  { stepId: 'biz_method', question: 'q', answer: '对比分析和趋势分析', at: '2024-01-01' },
  { stepId: 'biz_result', question: 'q', answer: '发现了新的增长点，预计带来1000万营收', at: '2024-01-01' }
];
const dupBullet = generateBullet(dupSession, '商业分析', profile.internships[0]);
assert(!dupBullet.includes('发现了新的增长点，预计带来1000万营收，发现了新的增长点'), 'dedup: no exact duplicate');
assert(dupBullet.includes('发现了新的增长点，预计带来1000万营收'), 'dedup: keeps one copy');
console.log(`   Dedup bullet: ${dupBullet}`);

// Summary
console.log('\n=== Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(failed === 0 ? '✅ All tests passed!' : `❌ ${failed} test(s) failed`);
if (failed > 0) process.exitCode = 1;

// Clean up
global.localStorage = undefined;
