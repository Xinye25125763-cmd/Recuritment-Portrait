const BASE_LIBRARY_URL = './jobs/jd-library.json';
const ENHANCED_LIBRARY_URL = './jobs/jd-library-givemeoc.json';

/**
 * 加载必需的内置岗位库和可选的本地增强库。
 * 增强库加载失败时继续使用内置库；同 ID 记录由增强库覆盖。
 */
export async function loadJobLibrary({
  fetchImpl = globalThis.fetch,
  baseUrl = BASE_LIBRARY_URL,
  enhancedUrl = ENHANCED_LIBRARY_URL,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('当前环境不支持 fetch');

  const baseResponse = await fetchImpl(baseUrl);
  if (!baseResponse.ok) throw new Error('JD 库加载失败 (HTTP ' + baseResponse.status + ')');
  const baseLibrary = await baseResponse.json();
  if (!Array.isArray(baseLibrary?.jobs)) throw new Error('JD 库格式错误：缺少 jobs 数组');

  const jobsById = new Map();
  for (const job of baseLibrary.jobs) {
    if (job?.id) jobsById.set(job.id, job);
  }

  try {
    const enhancedResponse = await fetchImpl(enhancedUrl);
    if (enhancedResponse.ok) {
      const enhancedLibrary = await enhancedResponse.json();
      if (Array.isArray(enhancedLibrary?.jobs)) {
        for (const job of enhancedLibrary.jobs) {
          if (job?.id) jobsById.set(job.id, job);
        }
      }
    }
  } catch {
    // 本地增强库可选，网络或文件缺失不影响内置库。
  }

  return [...jobsById.values()];
}

/**
 * 解析意向中的岗位。优先使用当前库记录，然后使用保存的岗位快照；
 * 旧版本没有快照时回退到现有元数据，并标注为不可评估的占位记录。
 */
export function resolveIntentionJob(intention, jobs = []) {
  const current = jobs.find(job => job.id === intention?.jobId);
  if (current) return current;

  if (intention?.jobSnapshot && typeof intention.jobSnapshot === 'object') {
    return { ...intention.jobSnapshot, id: intention.jobId || intention.jobSnapshot.id };
  }

  if (!intention?.jobId || !(intention.title || intention.company)) return null;
  return {
    id: intention.jobId,
    company: intention.company || '未知公司',
    title: intention.title || '岗位信息已缺失',
    track: intention.track || '',
    locations: Array.isArray(intention.locations) ? [...intention.locations] : [],
    program: intention.program || '',
    employmentType: intention.employmentType || '',
    sourceType: 'legacy_intention',
    descriptionType: 'unavailable',
    keywords: [],
    responsibilities: [],
  };
}

