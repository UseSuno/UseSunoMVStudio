import { afterAll, describe, expect, it, vi } from 'vitest';

const mockContext = {
  measureText: (text: string) => ({ width: text.length * 10 }),
  font: '',
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  drawImage: vi.fn(),
  setTransform: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  beginPath: vi.fn(),
  rect: vi.fn(),
  clip: vi.fn(),
  fillText: vi.fn(),
  globalAlpha: 1,
  fillStyle: '',
  textAlign: 'left',
};

const mockCanvas = {
  getContext: () => mockContext,
  width: 1280,
  height: 720,
};

const mockDoc = {
  documentElement: { lang: 'en', dir: 'ltr' },
  createElement: (tagName: string) => {
    if (tagName === 'canvas') return mockCanvas;
    return {
      tagName: tagName.toUpperCase(),
      style: {},
      appendChild: () => {},
      ownerDocument: mockDoc,
      children: [],
      querySelectorAll: () => [],
    };
  },
};

vi.stubGlobal('document', mockDoc);
vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
vi.stubGlobal('window', { localStorage, document: mockDoc });
afterAll(() => vi.unstubAllGlobals());

describe('Transparent lyric layer export pipeline', () => {
  it('draws on transparent canvas without background fill when transparent is true in 2D renderer', async () => {
    const { drawFrame } = await import('../src/renderer/draw');
    const { compileProject } = await import('../src/renderer/compile');

    const clearRect = vi.fn();
    const fillRect = vi.fn();
    const fillText = vi.fn();
    const setTransform = vi.fn();
    const save = vi.fn();
    const restore = vi.fn();
    const beginPath = vi.fn();
    const rect = vi.fn();
    const clip = vi.fn();
    const translate = vi.fn();

    const ctx = {
      clearRect,
      fillRect,
      fillText,
      setTransform,
      save,
      restore,
      beginPath,
      rect,
      clip,
      translate,
      globalAlpha: 1,
      fillStyle: '',
      textAlign: 'left',
      font: '',
    } as unknown as CanvasRenderingContext2D;

    const project = {
      id: 'test',
      title: '透明歌词测试',
      artist: 'Artist',
      font: 'sans-serif',
      fontSize: 32,
      fontScale: 1,
      fontWeight: 'bold',
      lineHeight: 1.5,
      template: 'article',
      palette: 'paper',
      ratio: '16:9',
      duration: 10,
      offset: 0,
      seed: 42,
      background: 'color',
      backgroundColor: '#ffffff',
      backgroundBlur: 0,
      lines: [{ id: '1', text: '第一行歌词', start: 1, end: 4, words: [] }],
    } as any;

    const plan = compileProject(project, [0.5, 0.8], 720);

    // Test with transparent = true
    drawFrame(ctx, plan, 2, true);
    expect(clearRect).toHaveBeenCalledWith(0, 0, 1280, 720);
    // Background fillRect should not be called with full canvas bounds when transparent
    const bgFill = fillRect.mock.calls.some(([x, y, w, h]) => x === 0 && y === 0 && w === 1280 && h === 720);
    expect(bgFill).toBe(false);

    // Reset and test with transparent = false (default)
    clearRect.mockClear();
    fillRect.mockClear();
    drawFrame(ctx, plan, 2, false);
    expect(clearRect).not.toHaveBeenCalled();
    const solidBgFill = fillRect.mock.calls.some(([x, y, w, h]) => x === 0 && y === 0 && w === 1280 && h === 720);
    expect(solidBgFill).toBe(true);
  });

  it('provides comprehensive internationalized keys for transparent export in en, zh-CN and zh-TW', async () => {
    const { default: i18n } = await import('../src/i18n');
    const keys = [
      'export.contentTitle',
      'export.contentFull',
      'export.fullDesc',
      'export.contentTransparent',
      'export.transparentTitle',
      'export.transparentDesc',
      'export.transparentWebMOnly',
      'export.alphaTag',
      'export.alphaBadge',
      'export.webmOnlyShort',
      'export.transparentRequiresFrames',
      'inspector.noMediaPrompt',
      'export.untitledWork',
      'export.thanksForListening',
    ];
    for (const lang of ['en', 'zh-CN', 'zh-TW']) {
      await i18n.changeLanguage(lang);
      for (const key of keys) {
        const val = i18n.t(key);
        expect(val).toBeTruthy();
        expect(val).not.toBe(key);
        if (lang === 'en') {
          // English translations must not contain Chinese characters
          expect(/[\u4e00-\u9fff]/.test(val)).toBe(false);
        }
      }
    }
  });

  it('generates the dedicated _lyrics_alpha.webm artifact filename in transparent export mode', () => {
    const project = { title: '我的歌曲' };
    const getArtifactFilename = (title: string, format: string, transparent: boolean) =>
      transparent ? `${title}_lyrics_alpha.webm` : `${title}.${format}`;

    expect(getArtifactFilename(project.title, 'webm', true)).toBe('我的歌曲_lyrics_alpha.webm');
    expect(getArtifactFilename(project.title, 'mp4', false)).toBe('我的歌曲.mp4');
  });
});
