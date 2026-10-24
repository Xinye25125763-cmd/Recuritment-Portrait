import assert from 'node:assert/strict';
import { matchJob } from './src/match-engine.js';

const profile = {
  targetDirections: ['数据分析'],
  targetCities: ['北京'],
  graduationYear: '2027',
  targetTracks: [],
  trackWeight: '两边都行',
  internships: [{
    role: '数据分析实习生',
    responsibilities: '使用 SQL 负责业务数据分析和指标监控，支持运营策略调整并完成复盘总结。'
  }],
  projects: []
};

const listing = {
  id: 'listing-only',
  company: '未知公司',
  companyType: '民企',
  title: '数据分析师',
  track: '数据分析',
  locations: ['北京'],
  program: '2027届秋招',
  source: 'givemeoc',
  descriptionType: 'position_listing',
  description: '数据分析师、产品经理、运营专员'
};

const result = matchJob(listing, profile);
assert.equal(result.dimScores.skills, null);
assert.equal(result.dimScores.experience, null);
assert.equal(result.dimScores.company, null);
assert.equal(result.dataCoverage, 50);
assert.equal(result.confidence, 'limited');
assert.deepEqual(result.gaps, []);
assert.equal(result.reasons.some(reason => reason.includes('资料有限')), true);

const fullJd = {
  ...listing,
  id: 'full-jd',
  company: '腾讯',
  companyType: undefined,
  descriptionType: 'full_jd',
  keywords: ['SQL', '指标体系'],
  responsibilities: ['负责业务数据分析和指标监控', '支持运营策略调整']
};
const complete = matchJob(fullJd, profile);
assert.equal(complete.dataCoverage, 100);
assert.equal(complete.confidence, 'complete');
assert.equal(typeof complete.dimScores.skills, 'number');
assert.equal(typeof complete.dimScores.experience, 'number');
assert.equal(typeof complete.dimScores.company, 'number');

console.log('Match data quality tests passed.');
