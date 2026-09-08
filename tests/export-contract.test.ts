import { describe, expect, it, vi } from 'vitest';
import { canCompositeProject, canExportFrames, regionCaptureAvailable } from '../src/export/capabilities';
import { introDirection, introLineLeft } from '../src/folia/introDirection';
import { dioramaLyricsSignature } from '../src/vendor/folia/components/visualizer/diorama/lyricsSignature';
import type { Line } from '../src/vendor/folia/types';
import { readPaintLayers, paintLayers } from '../src/folia/compositor';

vi.mock('../src/export/messages', () => ({ exportMessage: (key: string) => key }));

describe('export capability and media clock contract', () => {
  it('supports DOM templates and backgrounds in offline frame export', () => {
    for (const template of ['folia-fume', 'folia-diorama', 'folia-aurora', 'folia-tempera', 'folia-sonnet'] as const) {
      expect(canExportFrames({ template, background: 'latent' })).toBe(true);
      expect(canCompositeProject({ template, background: 'common' })).toBe(false);
      expect(canExportFrames({ template, background: 'aurora-nebula' })).toBe(true);
    }
    expect(canExportFrames({ template: 'folia-classic', background: 'latent' })).toBe(true);
    expect(canExportFrames({ template: 'folia-partita', background: 'common' })).toBe(true);
  });
  it('preflights the crop API as well as screen sharing', () => {
    const scope = { CropTarget: { fromElement() {} }, navigator: { mediaDevices: { getDisplayMedia() {} } } };
    expect(regionCaptureAvailable(scope as unknown as Window)).toBe(false);
    expect(regionCaptureAvailable({ ...scope, BrowserCaptureMediaStreamTrack: { prototype: { cropTo() {} } } } as unknown as Window)).toBe(true);
  });
  it('invalidates a Diorama scene for non-first text and word timing edits', () => {
    const original = [{ fullText: 'first', startTime: 0, endTime: 2, words: [] }, { fullText: 'second', startTime: 3, endTime: 5, words: [{ text: 'second', startTime: 3, endTime: 5 }] }] as Line[];
    const sig = dioramaLyricsSignature(original);
    expect(dioramaLyricsSignature(structuredClone(original))).toBe(sig);
    const edited = structuredClone(original); edited[1].words[0].startTime = 3.4;
    expect(dioramaLyricsSignature(edited)).not.toBe(sig);
    edited[1].words[0].startTime = 3; edited[1].fullText = 'replacement';
    expect(dioramaLyricsSignature(edited)).not.toBe(sig);
  });
  it('uses the first strong text direction and logical start for Arabic/Hebrew credits', () => {
    expect(introDirection('2026 — أغنية')).toBe('rtl');
    expect(introDirection('שלום')).toBe('rtl');
    expect(introDirection('Song أغنية')).toBe('ltr');
    expect(introLineLeft(720, 200, 60, 1, 'rtl')).toBe(460);
    expect(introLineLeft(720, 200, 60, 1, 'ltr')).toBe(60);
    expect(introLineLeft(720, 200, 60, 0, 'rtl')).toBe(260);
  });
});

describe('Canvas/DOM background composition', () => {
  it('preserves measured transforms, ancestor alpha/filter/blend and the solid veil in paint order', () => {
    type Node = { tagName: string; children: Node[]; parentElement: Node | null; ownerDocument: unknown; style: Record<string, string>; width: number; height: number; hasAttribute: (name: string) => boolean; getBoundingClientRect: () => { left: number; top: number; width: number; height: number }; getRootNode: () => object };
    const document = { defaultView: { getComputedStyle: (node: Node) => node.style } };
    const node = (tagName: string, style: Record<string, string> = {}, solid = false): Node => ({ tagName, children: [], parentElement: null, ownerDocument: document,
      style: { opacity: '1', display: 'block', visibility: 'visible', mixBlendMode: 'normal', filter: 'none', transform: 'none', backgroundColor: 'rgb(20, 30, 40)', ...style }, width: 640, height: 360,
      hasAttribute: name => solid && name === 'data-capture-solid', getBoundingClientRect: () => ({ left: -8, top: -4, width: 656, height: 368 }), getRootNode: () => ({}),
    });
    const root = node('DIV'), background = node('DIV', {}, true), mesh = node('CANVAS', { filter: 'saturate(1.2) brightness(0.94)' });
    const group = node('DIV', { opacity: '.55', mixBlendMode: 'soft-light' }), dither = node('CANVAS'), veil = node('DIV', { opacity: '.35' }, true), hidden = node('CANVAS', { display: 'none' });
    root.children = [background, mesh, group, veil, hidden]; root.children.forEach(child => { child.parentElement = root; }); group.children = [dither]; dither.parentElement = group;
    const layers = readPaintLayers(root as unknown as Element);
    expect(layers[2]).toMatchObject({ opacity: .55, blend: 'soft-light', x: -8, width: 656 });
    expect(layers[1].filter).toBe('saturate(1.2) brightness(0.94)');
    expect(layers[3]).toMatchObject({ opacity: .35, color: 'rgb(20, 30, 40)' });
    const drawn: unknown[] = [];
    const context = { globalAlpha: 1, globalCompositeOperation: 'source-over', filter: 'none', fillStyle: '', save() {}, restore() {},
      drawImage(...args: unknown[]) { drawn.push(['canvas', this.globalAlpha, this.globalCompositeOperation, this.filter, args.slice(1)]); },
      fillRect() { drawn.push(['solid', this.globalAlpha, this.fillStyle]); },
    };
    paintLayers(context as unknown as CanvasRenderingContext2D, layers);
    expect(drawn).toHaveLength(4);
    expect(drawn[2]).toEqual(['canvas', .55, 'soft-light', 'none', [-8, -4, 656, 368]]);
    expect(drawn[3]).toEqual(['solid', .35, 'rgb(20, 30, 40)']);
  });
});
