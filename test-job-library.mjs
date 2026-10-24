import assert from 'node:assert/strict';
import { loadJobLibrary, resolveIntentionJob } from './src/job-library.js';

const calls = [];
const responses = {
  './jobs/jd-library.json': {
    ok: true,
    async json() {
      return { jobs: [
        { id: 'same', title: 'base', track: '数据分析' },
        { id: 'base-only', title: 'base only' }
      ] };
    }
  },
  './jobs/jd-library-givemeoc.json': {
    ok: true,
    async json() {
      return { jobs: [
        { id: 'same', title: 'enhanced', track: '商业分析' },
        { id: 'enhanced-only', title: 'enhanced only' }
      ] };
    }
  }
};
const fetchImpl = async url => {
  calls.push(url);
  if (url === './jobs/jd-library-givemeoc.json' && responses[url]) return responses[url];
  return responses[url] || { ok: false, status: 404 };
};

const jobs = await loadJobLibrary({ fetchImpl });
assert.deepEqual(jobs.map(job => job.id), ['same', 'base-only', 'enhanced-only']);
assert.equal(jobs.find(job => job.id === 'same').title, 'enhanced');
assert.equal(new Set(jobs.map(job => job.id)).size, jobs.length);
assert.deepEqual(calls, ['./jobs/jd-library.json', './jobs/jd-library-givemeoc.json']);

const optionalMissing = await loadJobLibrary({
  fetchImpl: async url => url === './jobs/jd-library.json'
    ? { ok: true, async json() { return { jobs: [{ id: 'base' }] }; } }
    : { ok: false, status: 404 }
});
assert.deepEqual(optionalMissing.map(job => job.id), ['base']);

await assert.rejects(() => loadJobLibrary({
  fetchImpl: async () => ({ ok: false, status: 500 })
}), /JD 库加载失败/);

const snapshot = { id: 'gone', title: 'snapshot title', descriptionType: 'position_listing' };
assert.deepEqual(resolveIntentionJob({ jobId: 'gone', jobSnapshot: snapshot }, []), snapshot);

const legacy = resolveIntentionJob({
  jobId: 'old-id',
  company: '旧公司',
  title: '旧岗位',
  track: '产品经理',
  locations: ['杭州'],
  program: '2027届秋招'
}, []);
assert.equal(legacy.id, 'old-id');
assert.equal(legacy.title, '旧岗位');
assert.equal(legacy.descriptionType, 'unavailable');
assert.deepEqual(legacy.keywords, []);
assert.deepEqual(legacy.responsibilities, []);

console.log('Job library tests passed.');
