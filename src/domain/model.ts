// Serializable project contracts. Times are seconds at the editing boundary.
export type TemplateId = 'article' | 'flow' | 'tilt' | 'folia-fume' | 'folia-classic' | 'folia-partita' | 'folia-cadenza' | 'folia-tilt' | 'folia-claddagh' | 'folia-monet' | 'folia-cappella' | 'folia-diorama' | 'folia-aurora' | 'folia-curtain' | 'folia-pendolo' | 'folia-tempera' | 'folia-sonnet' | 'folia-still' | 'folia-astral' | 'folia-kyoto' | 'folia-chroma' | 'folia-elysium' | 'folia-syzygy' | 'folia-lumiere';
export type BackgroundId = 'common' | 'latent' | 'sora' | 'aurora-nebula' | 'aurora-curtain' | 'light-tide' | 'custom';
export type Precision = 'imported' | 'manual' | 'estimated' | 'untimed';
export type FontId = 'serif' | 'sans' | 'google' | 'noto-serif-sc' | 'noto-sans-sc' | 'lxgw-wenkai' | 'ma-shan-zheng' | 'dm-sans' | 'playfair-display' | 'local';
export interface Word { text: string; start: number; end: number }
export interface TemperaProjectImage { id: string; name: string; mimeType?: string; align: 'left' | 'center' | 'right' | 'free'; verticalAlign: 'top' | 'center' | 'bottom' | 'free'; scale: number; opacity: number }
export interface LyricLine { id: string; text: string; start: number | null; end: number | null; precision: Precision; words: Word[]; wordSegments?: string[] }
export interface Project {
  /** Legacy import field; migrated to the curtain template when loading. */
  auroraBackground?: 'nebula' | 'curtain';
  version: 2; title: string; artist: string; duration: number;
  template: TemplateId; background: BackgroundId; ratio: '16:9' | '9:16' | '1:1'; palette: 'paper' | 'midnight' | 'moss';
  font: FontId; customFontName?: string; fontWeight: number; fontScale: number; intensity: number; offset: number; estimatedReveal: boolean; autoIntro: boolean;
  audioReactivity: 'off' | 'gentle' | 'rhythmic'; audioReactivityAmount: number;
  temperaLayerImages: TemperaProjectImage[];
  coverMimeType?: string; monetPortraitSource: 'cover' | 'custom'; monetPortraitName?: string; monetPortraitMimeType?: string;
  monetPortraitStyle: 'square' | 'rectangular'; monetPortraitOffsetX: number;
  monetAudioVisualization: boolean; monetAudioStyle: 'bar' | 'line';
  customBackgroundName?: string; customBackgroundMimeType?: string; customBackgroundType?: 'image' | 'video' | 'gif';
  customBackgroundBlur?: number; customBackgroundDim?: number;
  lines: LyricLine[]; source: string; audioName: string; seed: number;
}
export const templates: { id: TemplateId; name: string; english: string; description: string; number: string }[] = [
  { id: 'folia-fume', name: '浮名', english: 'Fume · Folia', description: '整篇文字世界，连续镜头追焦', number: '01' },
  { id: 'folia-classic', name: '流光', english: 'Classic · Folia', description: '自由词语，逐字余辉', number: '02' },
  { id: 'folia-cadenza', name: '心象', english: 'Cadenza · Folia', description: '空间排字，碎片光束', number: '03' },
  { id: 'folia-partita', name: '云阶', english: 'Partita · Folia', description: '错落分栏，词组推进', number: '04' },
  { id: 'folia-tilt', name: '倾诉', english: 'Tilt · Folia', description: '倾斜重心，片段强调', number: '05' },
  { id: 'folia-claddagh', name: '回环', english: 'Claddagh · Folia', description: '字符轨道，椭圆环绕', number: '06' },
  { id: 'folia-monet', name: '莫奈', english: 'Monet · Folia', description: '海报构图，流动歌词', number: '07' },
  { id: 'folia-cappella', name: '群唱', english: 'Cappella · Folia', description: '聊天气泡，多人对唱', number: '08' },
  { id: 'folia-diorama', name: '镜台', english: 'Diorama · Folia', description: '三维歌词，镜头穿行', number: '09' },
  { id: 'folia-aurora', name: '极光', english: 'Aurora Traverse · Studio', description: '逐字生成空间路径，镜头连续穿越', number: '10' },
  { id: 'folia-pendolo', name: '时计', english: 'Pendolo · Folia', description: '钟表轮盘，弧线流转', number: '11' },
  { id: 'folia-tempera', name: '凝彩', english: 'Tempera · Folia', description: '逐字构图，印刷拼贴', number: '12' },
  { id: 'folia-sonnet', name: '商籁', english: 'Sonnet · Folia', description: '日系字效，镜头导演', number: '13' },
  { id: 'folia-still', name: '静帧', english: 'Still · Folia', description: '留白海报，低耗呈现', number: '14' },
  { id: 'folia-astral', name: '星轨', english: 'Astral · Studio', description: '三维空间景深，天体漂移与微距拉焦', number: '15' },
  { id: 'folia-kyoto', name: '京调', english: 'Kyoto · Studio', description: '先锋 MG 视效，反转色块与几何律动', number: '16' },
  { id: 'folia-chroma', name: '丹青', english: 'Chroma · Studio', description: '叠层艺术画纸，矿物颜料印刷拼贴', number: '17' },
  { id: 'folia-elysium', name: '灵境', english: 'Elysium · Folia Craft', description: '三维字域画卷，连续追焦穿梭，商籁字效与空间印迹融合', number: '18' },
  { id: 'folia-syzygy', name: '朔望', english: 'Syzygy · Folia Craft', description: '非线性平面海报排印，多景深微视差与星尘微粒动效', number: '19' },
  { id: 'folia-lumiere', name: '绘光', english: 'Lumiere · Folia', description: '舞台光束、体积雾效与线稿图解的歌词视效', number: '20' },
];
export const backgrounds: { id: BackgroundId; name: string; description: string }[] = [
  { id: 'custom', name: '自定义画面', description: '上传自定义图片、动态 GIF 或视频作为背景' },
  { id: 'light-tide', name: '光潮', description: '主题色晕与缓缓起伏的折射光带' },
  { id: 'latent', name: '流体织光', description: '低频流动的封面色场' },
  { id: 'sora', name: '空境星空', description: '极简流动的深空星辉，画面静谧纯粹' },
  { id: 'common', name: '主题空间', description: '几何与主题色背景' },
  { id: 'aurora-nebula', name: '极光星云', description: '快速流动的柔光星云' },
  { id: 'aurora-curtain', name: '极光光幕', description: '连续摆动的竖向光帘' },
];
export const palettes = {
  paper: { bg: '#e9e4d9', ink: '#29302b', accent: '#ae563e', muted: '#aaa698' },
  midnight: { bg: '#191e24', ink: '#f0e7d6', accent: '#d5b47d', muted: '#62686c' },
  moss: { bg: '#233e36', ink: '#ece8d8', accent: '#c8df91', muted: '#6f8979' },
};
export const demoSource = `[00:02.00]风把远方写成了诗
[00:07.00]We follow the light through the city
[00:12.00]風にのせて この歌を届けよう
[00:17.00]별빛 아래 우리 함께 걸어요
[00:24.00]Kita melangkah mengikuti cahaya
[00:29.00]Wir tragen die Träume durch die Nacht
[00:34.00]La música nos lleva hacia el mar
[00:39.00]让每一种语言 都唱出心中的光`;
export function defaultProject(lines: LyricLine[]): Project {
  return { version: 2, title: 'Demo', artist: 'Demo', duration: 46, template: 'folia-fume', background: 'latent', ratio: '16:9', palette: 'midnight', font: 'serif', fontWeight: 600, fontScale: 1, intensity: 1, offset: 0, estimatedReveal: false, autoIntro: true, audioReactivity: 'gentle', audioReactivityAmount: .7, temperaLayerImages: [], monetPortraitSource: 'cover', monetPortraitStyle: 'square', monetPortraitOffsetX: 0, monetAudioVisualization: true, monetAudioStyle: 'bar', lines, source: demoSource, audioName: '', seed: 42 };
}
export function dimensions(ratio: Project['ratio'], height = 720): [number, number] {
  if (ratio === '9:16') return [Math.round(height * 9 / 16 / 2) * 2, height];
  return [ratio === '1:1' ? height : Math.round(height * 16 / 9 / 2) * 2, height];
}
export const clamp = (x: number, min = 0, max = 1) => Math.min(max, Math.max(min, x));
export const ease = (x: number) => { const t = clamp(x); return t * t * (3 - 2 * t); };
export function timeLabel(t: number) { const s = Math.max(0, t); return `${Math.floor(s / 60).toString().padStart(2, '0')}:${Math.floor(s % 60).toString().padStart(2, '0')}.${Math.floor((s % 1) * 10)}`; }
export function activeLine(lines: LyricLine[], t: number) {
  return lines.findLastIndex(l => l.start !== null && l.end !== null && t >= l.start && t < l.end);
}
