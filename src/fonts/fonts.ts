import type { FontId, Project } from '../domain/model';

export const fontOptions: { id: FontId; label: string; family: string; source: string }[] = [
  { id: 'serif', label: '宋体 · 系统衬线', family: 'Songti SC', source: '系统' },
  { id: 'sans', label: '黑体 · 系统无衬线', family: 'PingFang SC', source: '系统' },
  { id: 'noto-serif-sc', label: 'Noto Serif SC', family: 'Noto Serif SC', source: 'Google' },
  { id: 'noto-sans-sc', label: 'Noto Sans SC', family: 'Noto Sans SC', source: 'Google' },
  { id: 'lxgw-wenkai', label: '霞鹜文楷', family: 'LXGW WenKai', source: 'Google' },
  { id: 'ma-shan-zheng', label: '马善政毛笔体', family: 'Ma Shan Zheng', source: 'Google' },
  { id: 'dm-sans', label: 'DM Sans', family: 'DM Sans', source: 'Google' },
  { id: 'playfair-display', label: 'Playfair Display', family: 'Playfair Display', source: 'Google' },
  { id: 'local', label: '本地字体', family: 'Verse Local Font', source: '本地' },
];

export const fallbackGoogleFonts = [
  'Nunito', 'Roboto', 'Open Sans', 'Montserrat', 'Poppins', 'Lato', 'Oswald', 'Raleway',
  'Merriweather', 'Playfair Display', 'Rubik', 'Inter', 'DM Sans', 'Bebas Neue', 'Anton',
  'Archivo Black', 'Noto Sans', 'Noto Sans SC', 'Noto Sans TC', 'Noto Sans JP', 'Noto Sans KR',
  'Noto Serif', 'Pacifico', 'Lobster', 'Caveat',
];

const preferredWeights: Record<string, number> = { Nunito: 800, Roboto: 700, 'Open Sans': 700, Montserrat: 800, Poppins: 700, Lato: 700, Oswald: 600, Raleway: 700, Merriweather: 700, 'Playfair Display': 700, Rubik: 800, Inter: 700, 'DM Sans': 700, 'Bebas Neue': 400, Anton: 400, 'Archivo Black': 400, 'Noto Sans': 700, 'Noto Sans SC': 700, 'Noto Sans TC': 700, 'Noto Sans JP': 700, 'Noto Sans KR': 700, 'Noto Serif': 700, Pacifico: 400, Lobster: 400, Caveat: 600 };

export const preferredFontWeight = (family: string) => preferredWeights[family] ?? 400;

const googleIds = new Set<FontId>(fontOptions.filter(option => option.source === 'Google').map(option => option.id));
const googleWeights: Partial<Record<FontId, string>> = {
  'noto-serif-sc': '400;600;700',
  'noto-sans-sc': '400;600;700',
  'lxgw-wenkai': '400',
  'ma-shan-zheng': '400',
  'dm-sans': '400;600;700',
  'playfair-display': '400;600;700',
};
const localFaces = new Map<string, FontFace>();

export function fontFamily(project: Pick<Project, 'font' | 'customFontName'>) {
  if (project.font === 'local') return project.customFontName || 'Verse Local Font';
  if (project.font === 'google') return project.customFontName || 'Nunito';
  return fontOptions.find(option => option.id === project.font)?.family ?? 'Songti SC';
}

export function fontStack(project: Pick<Project, 'font' | 'customFontName'>) {
  const family = fontFamily(project);
  const generic = project.font === 'serif' || project.font === 'noto-serif-sc' || project.font === 'playfair-display' ? 'serif' : 'sans-serif';
  return [family, 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', generic];
}

export async function ensureGoogleFont(family: string, weight = 400, previewOnly = false) {
  const id = `verse-google-font-${family.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${weight}-${previewOnly ? 'preview' : 'full'}`;
  let link = document.getElementById(id) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link'); link.id = id; link.rel = 'stylesheet'; link.crossOrigin = 'anonymous';
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@${weight}&display=swap${previewOnly ? `&text=${encodeURIComponent(family)}` : ''}`;
    document.head.appendChild(link);
  }
  await new Promise<void>(resolve => { if (link?.sheet) return resolve(); const done = () => resolve(); link?.addEventListener('load', done, { once: true }); link?.addEventListener('error', done, { once: true }); setTimeout(done, 5000); });
  await document.fonts.load(`${weight} 48px "${family}"`, family);
}

export async function ensureProjectFont(project: Pick<Project, 'font' | 'customFontName' | 'fontWeight'>) {
  if (!googleIds.has(project.font) && project.font !== 'google') return document.fonts.ready;
  const family = fontFamily(project);
  if (project.font === 'google') return ensureGoogleFont(family, project.fontWeight || preferredFontWeight(family));
  const id = `verse-google-font-${project.font}`;
  let link = document.getElementById(id) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@${googleWeights[project.font] ?? '400'}&display=swap`;
    document.head.appendChild(link);
  }
  await new Promise<void>(resolve => {
    if (link?.sheet) return resolve();
    const done = () => resolve();
    link?.addEventListener('load', done, { once: true });
    link?.addEventListener('error', done, { once: true });
    setTimeout(done, 5000);
  });
  const requestedWeight = googleWeights[project.font]?.includes('600') ? 600 : 400;
  await document.fonts.load(`${requestedWeight} 48px "${family}"`);
}

export async function installLocalFont(blob: Blob, family = 'Verse Local Font') {
  const previous = localFaces.get(family); if (previous) document.fonts.delete(previous);
  const buffer = await blob.arrayBuffer();
  const face = new FontFace(family, buffer);
  await face.load(); document.fonts.add(face); localFaces.set(family, face);
}
