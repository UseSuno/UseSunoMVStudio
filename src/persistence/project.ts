import type { Project } from '../domain/model';
// Versioned persistence and portable project bundles never execute imported content.
export interface SavedProject { project: Project; audio: Blob | null; font?: Blob | null; cover?: Blob | null; monetPortrait?: Blob | null }
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => { const req = indexedDB.open('verse-studio', 1); req.onupgradeneeded = () => req.result.createObjectStore('projects'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
}
export async function saveLocal(saved: SavedProject) {
  const db = await database();
  try { await new Promise<void>((resolve, reject) => { const tx = db.transaction('projects', 'readwrite'); tx.objectStore('projects').put(saved, 'current'); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); }); } finally { db.close(); }
}
export async function loadLocal(): Promise<SavedProject | null> {
  const db = await database();
  try { return await new Promise((resolve, reject) => { const req = db.transaction('projects').objectStore('projects').get('current'); req.onsuccess = () => { try { if (!req.result) return resolve(null); resolve({ project: validateProject(req.result.project), audio: req.result.audio instanceof Blob ? req.result.audio : null, font: req.result.font instanceof Blob ? req.result.font : null, cover: req.result.cover instanceof Blob ? req.result.cover : null, monetPortrait: req.result.monetPortrait instanceof Blob ? req.result.monetPortrait : null }); } catch (err) { reject(err); } }; req.onerror = () => reject(req.error); }); } finally { db.close(); }
}
export function validateProject(value: unknown): Project {
  if (!value || typeof value !== 'object') throw new Error('无效的工程文件。');
  const p = value as Project;
  if (p.auroraBackground !== undefined && !['nebula','curtain'].includes(p.auroraBackground)) throw new Error('极光背景无效。');
  const finite = (n: unknown, min: number, max: number) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
  if ((p.version as number) !== 1 && (p.version as number) !== 2) throw new Error('此工程版本暂不支持。');
  if (typeof p.title !== 'string' || p.title.length > 300 || typeof p.artist !== 'string' || p.artist.length > 300 || typeof p.source !== 'string' || p.source.length > 1e6 || typeof p.audioName !== 'string') throw new Error('工程元数据无效。');
  if (!finite(p.duration, 0.1, 3600) || !finite(p.offset, -3600, 3600) || !finite(p.fontScale, 0.5, 1.7) || !finite(p.intensity, 0.3, 2) || !finite(p.seed, 0, 1e9)) throw new Error('工程参数超出支持范围。');
  const fonts = ['serif', 'sans', 'google', 'noto-serif-sc', 'noto-sans-sc', 'lxgw-wenkai', 'ma-shan-zheng', 'dm-sans', 'playfair-display', 'local'];
  if (!['article', 'flow', 'tilt', 'folia-fume', 'folia-classic', 'folia-partita', 'folia-cadenza', 'folia-tilt', 'folia-claddagh', 'folia-monet', 'folia-cappella', 'folia-diorama', 'folia-aurora', 'folia-curtain', 'folia-pendolo', 'folia-tempera', 'folia-sonnet', 'folia-still'].includes(p.template) || !['16:9', '9:16', '1:1'].includes(p.ratio) || !['paper', 'midnight', 'moss'].includes(p.palette) || !fonts.includes(p.font) || typeof p.estimatedReveal !== 'boolean') throw new Error('工程模板或画幅无效。');
  if (p.customFontName !== undefined && (typeof p.customFontName !== 'string' || p.customFontName.length > 200)) throw new Error('本地字体名称无效。');
  if (p.monetPortraitSource !== undefined && !['cover','custom'].includes(p.monetPortraitSource)) throw new Error('莫奈图片来源无效。');
  if (p.monetPortraitStyle !== undefined && !['square','rectangular'].includes(p.monetPortraitStyle)) throw new Error('莫奈图片比例无效。');
  if (p.monetPortraitOffsetX !== undefined && !finite(p.monetPortraitOffsetX, -500, 500)) throw new Error('莫奈图片偏移无效。');
  if (p.audioReactivity !== undefined && !['off','gentle','rhythmic'].includes(p.audioReactivity)) throw new Error('音乐响应模式无效。');
  if (p.audioReactivityAmount !== undefined && !finite(p.audioReactivityAmount, 0, 1)) throw new Error('音乐响应强度无效。');
  if (p.monetAudioVisualization !== undefined && typeof p.monetAudioVisualization !== 'boolean') throw new Error('莫奈频谱设置无效。');
  if (p.monetAudioStyle !== undefined && !['bar','line'].includes(p.monetAudioStyle)) throw new Error('莫奈频谱样式无效。');
  if (p.monetPortraitName !== undefined && (typeof p.monetPortraitName !== 'string' || p.monetPortraitName.length > 300)) throw new Error('莫奈图片名称无效。');
  if (p.monetPortraitMimeType !== undefined && typeof p.monetPortraitMimeType !== 'string') throw new Error('莫奈图片类型无效。');
  if (p.coverMimeType !== undefined && typeof p.coverMimeType !== 'string') throw new Error('封面图片类型无效。');
  if (!Array.isArray(p.lines) || p.lines.length > 2000) throw new Error('歌词行数超出限制。');
  if (p.temperaLayerImages !== undefined && (!Array.isArray(p.temperaLayerImages) || p.temperaLayerImages.length > 16 || p.temperaLayerImages.some(image => !image || typeof image.id !== 'string' || typeof image.name !== 'string' || (image.mimeType !== undefined && typeof image.mimeType !== 'string') || !['left','center','right','free'].includes(image.align) || !['top','center','bottom','free'].includes(image.verticalAlign) || !finite(image.scale, .1, 2) || !finite(image.opacity, 0, 1)))) throw new Error('凝彩图片池无效。');
  const ids = new Set<string>();
  for (const l of p.lines) {
    if (typeof l.id !== 'string' || ids.has(l.id) || typeof l.text !== 'string' || l.text.length > 2000 || !['untimed', 'manual', 'imported', 'estimated'].includes(l.precision)) throw new Error('歌词内容无效。');
    ids.add(l.id);
    if ((l.start !== null && !finite(l.start, 0, 7200)) || (l.end !== null && !finite(l.end, 0, 7200)) || (l.start !== null && l.end !== null && l.end <= l.start)) throw new Error('歌词时间范围无效。');
    if (!Array.isArray(l.words) || l.words.length > 2000 || l.words.some(w => typeof w.text !== 'string' || !finite(w.start, 0, 7200) || !finite(w.end, w.start, 7200))) throw new Error('逐字时间无效。');
    if (l.wordSegments !== undefined && (!Array.isArray(l.wordSegments) || l.wordSegments.length > 2000 || l.wordSegments.some(segment => typeof segment !== 'string') || l.wordSegments.join('') !== l.text)) throw new Error('歌词短语边界无效。');
  }
  const legacyBackground = p.template === 'folia-curtain' || (p.template === 'folia-aurora' && p.auroraBackground === 'curtain') ? 'aurora-curtain' : p.template === 'folia-aurora' ? 'aurora-nebula' : undefined;
  const background = legacyBackground ?? (['common', 'latent', 'aurora-nebula', 'aurora-curtain'].includes(p.background) ? p.background : 'latent');
  const migrated: Project = { ...p, version: 2, background, audioReactivity: p.audioReactivity ?? 'gentle', audioReactivityAmount: p.audioReactivityAmount ?? .7, temperaLayerImages: p.temperaLayerImages ?? [], monetPortraitSource: p.monetPortraitSource ?? 'cover', monetPortraitStyle: p.monetPortraitStyle ?? 'square', monetPortraitOffsetX: p.monetPortraitOffsetX ?? 0, monetAudioVisualization: p.monetAudioVisualization ?? true, monetAudioStyle: p.monetAudioStyle ?? 'bar', fontWeight: finite(p.fontWeight, 100, 900) ? p.fontWeight : 600 };
  if (p.template === 'folia-curtain') migrated.template = 'folia-aurora';
  delete migrated.auroraBackground;
  if (['article','flow','tilt'].includes(p.template)) migrated.template = ({ article: 'folia-fume', flow: 'folia-classic', tilt: 'folia-tilt' } as const)[p.template as 'article' | 'flow' | 'tilt'];
  return structuredClone(migrated);
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export async function downloadProject(project: Project, audio: Blob | null, includeAudio: boolean, font?: Blob | null, cover?: Blob | null, monetPortrait?: Blob | null) {
  const { zipSync, strToU8 } = await import('fflate');
  const files: Record<string, Uint8Array> = { 'project.json': strToU8(JSON.stringify(project)) };
  if (includeAudio && audio) files['audio.bin'] = new Uint8Array(await audio.arrayBuffer());
  if (font) files['font.bin'] = new Uint8Array(await font.arrayBuffer());
  if (cover) files['cover.bin'] = new Uint8Array(await cover.arrayBuffer());
  if (monetPortrait) files['monet-portrait.bin'] = new Uint8Array(await monetPortrait.arrayBuffer());
  const { getTemperaLayerImage } = await import('../vendor/folia/services/temperaLayerImages');
  await Promise.all(project.temperaLayerImages.map(async image => { const stored = await getTemperaLayerImage(image.id); if (stored?.blob) files[`tempera/${encodeURIComponent(image.id)}`] = new Uint8Array(await stored.blob.arrayBuffer()); }));
  const data = zipSync(files, { level: 0 }); downloadBlob(new Blob([data], { type: 'application/zip' }), `${project.title || '作品'}.lyricmv`);
}
export async function readProject(file: File): Promise<SavedProject> {
  if (file.size > 200 * 1024 * 1024) throw new Error('工程文件超过 200 MB，请使用较小的素材。');
  if (file.name.endsWith('.json')) return { project: validateProject(JSON.parse(await file.text())), audio: null };
  const { unzipSync, strFromU8 } = await import('fflate');
  let total = 0;
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: f => { total += f.originalSize; if (total > 250 * 1024 * 1024) throw new Error('工程解压大小超出限制。'); return f.name === 'project.json' || f.name === 'audio.bin' || f.name === 'font.bin' || f.name === 'cover.bin' || f.name === 'monet-portrait.bin' || f.name.startsWith('tempera/'); } });
  if (!files['project.json']) throw new Error('工程包缺少 project.json。');
  const project = validateProject(JSON.parse(strFromU8(files['project.json'])));
  const { saveTemperaLayerImage } = await import('../vendor/folia/services/temperaLayerImages');
  await Promise.all(project.temperaLayerImages.map(async image => { const bytes = files[`tempera/${encodeURIComponent(image.id)}`]; if (bytes) { const mimeType = image.mimeType || 'application/octet-stream'; await saveTemperaLayerImage({ id: image.id, name: image.name, mimeType, blob: new Blob([bytes], { type: mimeType }) }); } }));
  return { project, audio: files['audio.bin'] ? new Blob([files['audio.bin']]) : null, font: files['font.bin'] ? new Blob([files['font.bin']]) : null, cover: files['cover.bin'] ? new Blob([files['cover.bin']], { type: project.coverMimeType || 'application/octet-stream' }) : null, monetPortrait: files['monet-portrait.bin'] ? new Blob([files['monet-portrait.bin']], { type: project.monetPortraitMimeType || 'application/octet-stream' }) : null };
}
