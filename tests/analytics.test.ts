import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAnalyticsConfig, initAnalytics, initClarity, initGA4 } from '../src/analytics';

describe('analytics module', () => {
  let createdScripts: HTMLScriptElement[] = [];
  let appendedElements: HTMLElement[] = [];
  let fakeHead: any;
  let fakeBody: any;
  let fakeDocument: any;
  let fakeWindow: any;

  beforeEach(() => {
    createdScripts = [];
    appendedElements = [];

    fakeHead = {
      appendChild: vi.fn((node: any) => {
        appendedElements.push(node);
        return node;
      }),
    };

    fakeBody = {
      appendChild: vi.fn((node: any) => {
        appendedElements.push(node);
        return node;
      }),
    };

    fakeDocument = {
      head: fakeHead,
      body: fakeBody,
      createElement: vi.fn((tag: string) => {
        const attributes = new Map<string, string>();
        const el: any = {
          tagName: tag.toUpperCase(),
          async: false,
          src: '',
          setAttribute: (name: string, value: string) => attributes.set(name, value),
          getAttribute: (name: string) => attributes.get(name) ?? null,
        };
        if (tag.toLowerCase() === 'script') {
          createdScripts.push(el);
        }
        return el;
      }),
      querySelector: vi.fn((selector: string) => {
        if (selector.includes('data-analytics="ga4"')) {
          return createdScripts.find(s => s.getAttribute('data-analytics') === 'ga4') || null;
        }
        if (selector.includes('data-analytics="clarity"')) {
          return createdScripts.find(s => s.getAttribute('data-analytics') === 'clarity') || null;
        }
        return null;
      }),
      getElementsByTagName: vi.fn((tag: string) => {
        if (tag.toLowerCase() === 'script') {
          return createdScripts;
        }
        return [];
      }),
    };

    fakeWindow = {
      top: null as any,
      self: null as any,
    };
    fakeWindow.top = fakeWindow;
    fakeWindow.self = fakeWindow;

    vi.stubGlobal('document', fakeDocument);
    vi.stubGlobal('window', fakeWindow);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('initGA4', () => {
    it('rejects empty or invalid GA4 measurement IDs', () => {
      expect(initGA4('')).toBe(false);
      expect(initGA4('   ')).toBe(false);
      expect(initGA4('UA-1234567')).toBe(false);
      expect(initGA4('G-invalid!symbols')).toBe(false);
      expect(createdScripts.length).toBe(0);
    });

    it('injects Google Analytics 4 tag with valid ID', () => {
      const success = initGA4('G-ABC123XYZ');
      expect(success).toBe(true);
      expect(createdScripts.length).toBe(1);
      const script = createdScripts[0];
      expect(script.src).toBe('https://www.googletagmanager.com/gtag/js?id=G-ABC123XYZ');
      expect(script.getAttribute('data-analytics')).toBe('ga4');
      expect(fakeWindow.dataLayer).toBeDefined();
      expect(typeof fakeWindow.gtag).toBe('function');

      // Duplicate invocation should not re-inject
      const duplicateSuccess = initGA4('G-ABC123XYZ');
      expect(duplicateSuccess).toBe(true);
      expect(createdScripts.length).toBe(1);
    });
  });

  describe('initClarity', () => {
    it('rejects empty or invalid Clarity project IDs', () => {
      expect(initClarity('')).toBe(false);
      expect(initClarity('   ')).toBe(false);
      expect(initClarity('invalid project id with spaces')).toBe(false);
      expect(initClarity('id#special!')).toBe(false);
      expect(createdScripts.length).toBe(0);
    });

    it('injects Microsoft Clarity tag with valid project ID', () => {
      const success = initClarity('9a8b7c6d5e');
      expect(success).toBe(true);
      expect(createdScripts.length).toBe(1);
      const script = createdScripts[0];
      expect(script.src).toBe('https://www.clarity.ms/tag/9a8b7c6d5e');
      expect(script.getAttribute('data-analytics')).toBe('clarity');
      expect(typeof fakeWindow.clarity).toBe('function');

      // Duplicate invocation should not re-inject
      const duplicateSuccess = initClarity('9a8b7c6d5e');
      expect(duplicateSuccess).toBe(true);
      expect(createdScripts.length).toBe(1);
    });
  });

  describe('initAnalytics', () => {
    it('ignores if inside iframe', () => {
      fakeWindow.top = {};
      fakeWindow.self = {};
      initAnalytics({ gaId: 'G-XYZ123', clarityId: 'clarity123' });
      expect(createdScripts.length).toBe(0);
    });

    it('does not inject when no analytics IDs are configured', () => {
      initAnalytics({ gaId: '', clarityId: '' });
      expect(createdScripts.length).toBe(0);
      expect(fakeWindow.__studioAnalyticsInitialized).toBe(true);
    });

    it('injects both providers when both are configured', () => {
      initAnalytics({ gaId: 'G-TEST12345', clarityId: 'claritytest123' });
      expect(createdScripts.length).toBe(2);
      expect(createdScripts.some(s => s.getAttribute('data-analytics') === 'ga4')).toBe(true);
      expect(createdScripts.some(s => s.getAttribute('data-analytics') === 'clarity')).toBe(true);
      expect(fakeWindow.__studioAnalyticsInitialized).toBe(true);
    });
  });

  describe('getAnalyticsConfig', () => {
    it('returns empty IDs when environment is not set', () => {
      const config = getAnalyticsConfig();
      expect(config).toHaveProperty('gaId');
      expect(config).toHaveProperty('clarityId');
    });
  });
});
