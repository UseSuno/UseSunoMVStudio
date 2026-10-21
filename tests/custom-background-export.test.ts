import { describe, expect, it, vi } from 'vitest';
import { canCompositeProject, canExportFrames, recommendsFrameExport } from '../src/export/capabilities';
import { readPaintLayers, paintLayers } from '../src/folia/compositor';

vi.mock('../src/export/messages', () => ({ exportMessage: (key: string) => key }));

describe('Custom Background Export Capabilities', () => {
  it('supports custom background in offline frame export for all Folia templates', () => {
    const templates = [
      'folia-fume',
      'folia-classic',
      'folia-cadenza',
      'folia-partita',
      'folia-tilt',
      'folia-claddagh',
      'folia-monet',
      'folia-cappella',
      'folia-diorama',
      'folia-aurora',
      'folia-curtain',
      'folia-pendolo',
      'folia-tempera',
      'folia-sonnet',
      'folia-still',
      'folia-astral',
      'folia-kyoto',
      'folia-chroma',
      'folia-elysium',
      'folia-syzygy',
      'folia-lumiere',
    ] as const;

    for (const template of templates) {
      expect(canExportFrames({ template, background: 'custom' })).toBe(true);
      // Custom backgrounds are DOM/media based, so they must never use canvas-only direct composite
      expect(canCompositeProject({ template, background: 'custom' })).toBe(false);
    }
  });

  it('does not falsely recommend direct offline export for custom background', () => {
    expect(recommendsFrameExport({ template: 'folia-fume', background: 'custom' })).toBe(false);
    expect(recommendsFrameExport({ template: 'folia-tilt', background: 'custom' })).toBe(false);
  });
});

describe('Custom Background Canvas Paint Layers Composition', () => {
  it('correctly captures custom background canvas layer with full opacity and positioning in paint order', () => {
    type Node = {
      tagName: string;
      children: Node[];
      parentElement: Node | null;
      ownerDocument: unknown;
      style: Record<string, string>;
      width: number;
      height: number;
      hasAttribute: (name: string) => boolean;
      getBoundingClientRect: () => { left: number; top: number; width: number; height: number };
      getRootNode: () => object;
    };

    const document = { defaultView: { getComputedStyle: (node: Node) => node.style } };
    const createNode = (tagName: string, style: Record<string, string> = {}, solid = false): Node => ({
      tagName,
      children: [],
      parentElement: null,
      ownerDocument: document,
      style: {
        opacity: '1',
        display: 'block',
        visibility: 'visible',
        mixBlendMode: 'normal',
        filter: 'none',
        transform: 'none',
        backgroundColor: '#080c19',
        ...style,
      },
      width: 1280,
      height: 720,
      hasAttribute: name => solid && name === 'data-capture-solid',
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
      getRootNode: () => ({}),
    });

    // Structure of FoliaHost with custom background during export:
    // root (DIV)
    //   -> background wrapper (DIV)
    //        -> custom bg container (DIV, data-capture-solid)
    //             -> custom bg canvas (CANVAS, display: block)
    //   -> renderer (DIV)
    //        -> visualizer canvas (CANVAS, display: block)
    const root = createNode('DIV');
    const bgWrapper = createNode('DIV');
    const customBgContainer = createNode('DIV', {}, true);
    const customBgCanvas = createNode('CANVAS', { display: 'block' });
    const renderer = createNode('DIV');
    const visualizerCanvas = createNode('CANVAS', { display: 'block' });

    root.children = [bgWrapper, renderer];
    bgWrapper.parentElement = root;
    renderer.parentElement = root;

    bgWrapper.children = [customBgContainer];
    customBgContainer.parentElement = bgWrapper;

    customBgContainer.children = [customBgCanvas];
    customBgCanvas.parentElement = customBgContainer;

    renderer.children = [visualizerCanvas];
    visualizerCanvas.parentElement = renderer;

    const layers = readPaintLayers(root as unknown as Element);

    // 1. Solid background layer from customBgContainer
    expect(layers[0]).toMatchObject({
      source: undefined,
      color: '#080c19',
      width: 1280,
      height: 720,
      opacity: 1,
    });

    // 2. Custom background canvas layer
    expect(layers[1]).toMatchObject({
      source: customBgCanvas,
      width: 1280,
      height: 720,
      opacity: 1,
    });

    // 3. Visualizer canvas layer
    expect(layers[2]).toMatchObject({
      source: visualizerCanvas,
      width: 1280,
      height: 720,
      opacity: 1,
    });

    // Verify paintLayers renders in exact back-to-front order
    const drawn: unknown[] = [];
    const context = {
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      filter: 'none',
      fillStyle: '',
      save() {},
      restore() {},
      drawImage(...args: unknown[]) {
        drawn.push(['canvas', args[0], this.globalAlpha, args.slice(1)]);
      },
      fillRect() {
        drawn.push(['solid', this.fillStyle, this.globalAlpha]);
      },
    };

    paintLayers(context as unknown as CanvasRenderingContext2D, layers);

    expect(drawn).toHaveLength(3);
    // First: solid backdrop
    expect(drawn[0]).toEqual(['solid', '#080c19', 1]);
    // Second: custom background canvas (rendered BEHIND visualizer canvas)
    expect(drawn[1]).toEqual(['canvas', customBgCanvas, 1, [0, 0, 1280, 720]]);
    // Third: visualizer canvas (rendered ON TOP OF custom background)
    expect(drawn[2]).toEqual(['canvas', visualizerCanvas, 1, [0, 0, 1280, 720]]);
  });

  it('validates customBackgroundDuration in project serialization', async () => {
    const { defaultProject } = await import('../src/domain/model');
    const { validateProject } = await import('../src/persistence/project');
    const valid = {
      ...defaultProject([]),
      background: 'custom' as const,
      customBackgroundDuration: 15,
    };
    expect(() => validateProject(valid)).not.toThrow();

    expect(() => validateProject({ ...valid, customBackgroundDuration: 0 })).not.toThrow();
    expect(() => validateProject({ ...valid, customBackgroundDuration: 30 })).not.toThrow();
    expect(() => validateProject({ ...valid, customBackgroundDuration: -5 })).toThrow();
  });

  it('exports trimVideo helper correctly', async () => {
    const { trimVideo } = await import('../src/background/trimVideo');
    expect(typeof trimVideo).toBe('function');
  });
});
