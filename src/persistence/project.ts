import type { Project } from '../domain/model';
// Versioned persistence and portable project bundles never execute imported content.
export interface SavedProject { project: Project; audio: Blob | null; font?: Blob | null }
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => { const req = indexedDB.open('verse-studio', 1); req.onupgradeneeded = () => req.result.createObjectStore('projects'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
}
export async function saveLocal(saved: SavedProject) {
  const db = await database();
  try { await new Promise<void>((resolve, reject) => { const tx = db.transaction('projects', 'readwrite'); tx.objectStore('projects').put(saved, 'current'); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); }); } finally { db.close(); }
}
export async function loadLocal(): Promise<SavedProject | null> {
  const db = await database();
  try { return await new Promise((resolve, reject) => { const req = db.transaction('projects').objectStore('projects').get('current'); req.onsuccess = () => { try { if (!req.result) return resolve(null); resolve({ project: validateProject(req.result.project), audio: req.result.audio instanceof Blob ? req.result.audio : null, font: req.result.font instanceof Blob ? req.result.font : null }); } catch (err) { reject(err); } }; req.onerror = () => reject(req.error); }); } finally { db.close(); }
}
export function validateProject(value: unknown): Project {
  if (!value || typeof value !== 'object') throw new Error('无效的工程文件。');
  const p = value as Project;
  if (p.auroraBackground !== undefined && !['nebula','curtain'].includes(p.auroraBackground)) throw new Error('极光背景无效。');
  const finite = (n: unknown, min: number, max: number) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
  if (p.version !== 1) throw new Error('此工程版本暂不支持。');
  if (typeof p.title !== 'string' || p.title.length > 300 || typeof p.artist !== 'string' || p.artist.length > 300 || typeof p.source !== 'string' || p.source.length > 1e6 || typeof p.audioName !== 'string') throw new Error('工程元数据无效。');
  if (!finite(p.duration, 0.1, 3600) || !finite(p.offset, -3600, 3600) || !finite(p.fontScale, 0.5, 1.7) || !finite(p.intensity, 0.3, 2) || !finite(p.seed, 0, 1e9)) throw new Error('工程参数超出支持范围。');
  const fonts = ['serif', 'sans', 'google', 'noto-serif-sc', 'noto-sans-sc', 'lxgw-wenkai', 'ma-shan-zheng', 'dm-sans', 'playfair-display', 'local'];
  if (!['article', 'flow', 'tilt', 'folia-fume', 'folia-classic', 'folia-partita', 'folia-cadenza', 'folia-tilt', 'folia-claddagh', 'folia-monet', 'folia-cappella', 'folia-diorama', 'folia-aurora', 'folia-curtain'].includes(p.template) || !['16:9', '9:16', '1:1'].includes(p.ratio) || !['paper', 'midnight', 'moss'].includes(p.palette) || !fonts.includes(p.font) || typeof p.estimatedReveal !== 'boolean') throw new Error('工程模板或画幅无效。');
  if (p.customFontName !== undefined && (typeof p.customFontName !== 'string' || p.customFontName.length > 200)) throw new Error('本地字体名称无效。');
  if (!Array.isArray(p.lines) || p.lines.length > 2000) throw new Error('歌词行数超出限制。');
  const ids = new Set<string>();
  for (const l of p.lines) {
    if (typeof l.id !== 'string' || ids.has(l.id) || typeof l.text !== 'string' || l.text.length > 2000 || !['untimed', 'manual', 'imported', 'estimated'].includes(l.precision)) throw new Error('歌词内容无效。');
    ids.add(l.id);
    if ((l.start !== null && !finite(l.start, 0, 7200)) || (l.end !== null && !finite(l.end, 0, 7200)) || (l.start !== null && l.end !== null && l.end <= l.start)) throw new Error('歌词时间范围无效。');
    if (!Array.isArray(l.words) || l.words.length > 2000 || l.words.some(w => typeof w.text !== 'string' || !finite(w.start, 0, 7200) || !finite(w.end, w.start, 7200))) throw new Error('逐字时间无效。');
  }
  const migrated = { ...p, fontWeight: finite(p.fontWeight, 100, 900) ? p.fontWeight : 600 };
  if (p.template === 'folia-aurora' && p.auroraBackground === 'curtain') migrated.template = 'folia-curtain';
  delete migrated.auroraBackground;
  if (['article','flow','tilt'].includes(p.template)) migrated.template = ({ article: 'folia-fume', flow: 'folia-classic', tilt: 'folia-tilt' } as const)[p.template as 'article' | 'flow' | 'tilt'];
  return structuredClone(migrated);
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export async function downloadProject(project: Project, audio: Blob | null, includeAudio: boolean, font?: Blob | null) {
  const { zipSync, strToU8 } = await import('fflate');
  const files: Record<string, Uint8Array> = { 'project.json': strToU8(JSON.stringify(project)) };
  if (includeAudio && audio) files['audio.bin'] = new Uint8Array(await audio.arrayBuffer());
  if (font) files['font.bin'] = new Uint8Array(await font.arrayBuffer());
  const data = zipSync(files, { level: 0 }); downloadBlob(new Blob([data], { type: 'application/zip' }), `${project.title || '作品'}.lyricmv`);
}
export async function readProject(file: File): Promise<SavedProject> {
  if (file.size > 200 * 1024 * 1024) throw new Error('工程文件超过 200 MB，请使用较小的素材。');
  if (file.name.endsWith('.json')) return { project: validateProject(JSON.parse(await file.text())), audio: null };
  const { unzipSync, strFromU8 } = await import('fflate');
  let total = 0;
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: f => { total += f.originalSize; if (total > 250 * 1024 * 1024) throw new Error('工程解压大小超出限制。'); return f.name === 'project.json' || f.name === 'audio.bin' || f.name === 'font.bin'; } });
  if (!files['project.json']) throw new Error('工程包缺少 project.json。');
  return { project: validateProject(JSON.parse(strFromU8(files['project.json']))), audio: files['audio.bin'] ? new Blob([files['audio.bin']]) : null, font: files['font.bin'] ? new Blob([files['font.bin']]) : null };
}
