import { afterAll, expect, it, vi } from 'vitest';

vi.stubGlobal('document', { documentElement: { lang: 'en', dir: 'ltr' } });
vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
vi.stubGlobal('window', { localStorage });
afterAll(() => vi.unstubAllGlobals());

it('loading Folia stores preserves Studio translations and the selected language', async () => {
  const { default: i18n, languages } = await import('../src/i18n');
  if (!i18n.isInitialized) await new Promise(resolve => i18n.on('initialized', resolve));
  await i18n.changeLanguage('zh-TW');
  const supported = [...i18n.options.supportedLngs as string[]];
  const before = i18n.t('folia.loading');
  await import('../src/vendor/folia/stores/usePlayerChromeSettingsStore');
  expect(i18n.language).toBe('zh-TW');
  expect(i18n.options.supportedLngs).toEqual(supported);
  expect(i18n.t('folia.loading')).toBe(before);
  expect(before).toBe('正在載入 Folia 動畫…');
  expect(languages.map(([code]) => code)).toEqual(['en', 'id', 'hi', 'pt-BR', 'fil', 'de', 'ur', 'ru', 'vi', 'zh-CN', 'zh-TW']);
  for (const [language] of languages) {
    await i18n.changeLanguage(language);
    expect(i18n.t('folia.loading')).not.toBe('folia.loading');
    expect(i18n.t('ui.waitingForMusic')).toBe('...');
    expect(i18n.exists('lyrics.clear')).toBe(true);
    expect(i18n.exists('export.instrumental')).toBe(true);
    expect(i18n.exists('export.layeredNotice')).toBe(true);
    expect(i18n.exists('export.settingsTitle')).toBe(true);
    expect(i18n.getResource(language, 'translation', 'about.sourceRepository')).toBeTruthy();
    for (const key of ['captureStandard', 'captureLayered', 'captureNative', 'captureDirect', 'captureWorker', 'layeredNotice', 'nativeNotice', 'directNotice', 'workerNotice', 'recordingLabel']) {
      expect(i18n.getResource(language, 'translation', `export.${key}`)).toBeTruthy();
    }
    if (!['en', 'zh-CN', 'zh-TW'].includes(language)) {
      expect(i18n.resolvedLanguage).toBe(language);
      // A translated language shows its own copy; the rest fall back to English.
      expect(i18n.t('folia.loading')).toBe(i18n.getResource(language, 'translation', 'folia.loading') || i18n.t('folia.loading', { lng: 'en' }));
      expect(document.documentElement.lang).toBe(language);
      expect(document.documentElement.dir).toBe(language === 'ur' ? 'rtl' : 'ltr');
    }
  }
  expect(i18n.exists('notifications.progressBarHidden', { lng: 'en' })).toBe(true);
});

it('restores the saved Urdu locale and renders Urdu with RTL layout', async () => {
  vi.resetModules();
  vi.stubGlobal('localStorage', { getItem: (key: string) => key === 'verse-studio-language' ? 'ur' : null, setItem: () => {}, removeItem: () => {} });
  vi.stubGlobal('window', { localStorage });
  const { default: i18n } = await import('../src/i18n');
  if (!i18n.isInitialized) await new Promise(resolve => i18n.on('initialized', resolve));
  expect(i18n.resolvedLanguage).toBe('ur');
  expect(i18n.t('menu.file')).toBe('فائل');
  expect(i18n.t('folia.loading')).toBe('Folia اینیمیشن لوڈ ہو رہی ہے…');
  expect(i18n.t('definitely.missing.key')).toBe('definitely.missing.key');
  expect(document.documentElement.lang).toBe('ur');
  expect(document.documentElement.dir).toBe('rtl');
});
