import assert from 'node:assert/strict';
import { ExperienceMiner } from './src/experience-miner.js';

const { createSession, generateBullet } = ExperienceMiner;
const experience = { company: '测试公司', role: '数据分析实习生', highlights: [] };

const empty = createSession('job-empty', '数据分析师', '指标体系', 'intern_0', 'internship');
assert.equal(generateBullet(empty, '指标体系', experience), '');

const partial = createSession('job-partial', '数据分析师', 'AB实验', 'intern_0', 'internship');
partial.qaLog = [
  { stepId: 'has_experiment', answer: '做过对照实验' },
  { stepId: 'metrics', answer: '转化率' },
  { stepId: 'result', answer: '实验组转化率下降7%' }
];
const partialBullet = generateBullet(partial, 'AB实验', experience);
assert.match(partialBullet, /转化率下降7%/);
assert.doesNotMatch(partialBullet, /提升|显著|基准|一定规模|核心指标|相关团队|支撑业务决策/);

const complete = createSession('job-complete', '数据分析师', 'AB实验', 'intern_0', 'internship');
complete.qaLog = [
  { stepId: 'has_experiment', answer: '做过对照实验' },
  { stepId: 'metrics', answer: '转化率' },
  { stepId: 'sample_size', answer: '5万名用户' },
  { stepId: 'result', answer: '实验组转化率下降7%' },
  { stepId: 'impact', answer: '据此调整活动规则' }
];
const completeBullet = generateBullet(complete, 'AB实验', experience);
assert.match(completeBullet, /5万名用户/);
assert.match(completeBullet, /实验组转化率下降7%/);
assert.match(completeBullet, /据此调整活动规则/);
assert.doesNotMatch(completeBullet, /提升|显著|基准/);

console.log('Experience Miner honesty tests passed.');
