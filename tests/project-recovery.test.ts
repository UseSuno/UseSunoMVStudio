import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultProject } from '../src/domain/model';
import { ProjectHistory } from '../src/domain/projectHistory';
import { clearProjectDraft, recoverProjectDraft, writeProjectDraft } from '../src/persistence/draft';
import { buildProjectArchive, readProject, validateProject } from '../src/persistence/project';
import { unzipSync } from 'fflate';

afterEach(() => vi.unstubAllGlobals());
function storage() {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
}
describe('project recovery and portable assets', () => {
  it.each(['common', 'latent', 'aurora-nebula', 'aurora-curtain'] as const)('preserves the current Aurora background %s through recovery and project archives', async background => {
    storage();
    const base = { ...defaultProject([]), template: 'folia-aurora' as const, background };
    expect(validateProject(JSON.parse(JSON.stringify(base))).background).toBe(background);
    const next = { ...base, title: 'Last edit' }; writeProjectDraft(base, next);
    expect(recoverProjectDraft(validateProject(base))).toEqual(next);
    const blob = await buildProjectArchive(base, null, false);
    const restored = await readProject(new File([blob], 'background.lyricmv'));
    expect(restored.project.background).toBe(background);
  });
  it('still migrates version one Aurora projects without independent backgrounds', () => {
    expect(validateProject({ ...defaultProject([]), version: 1, template: 'folia-aurora' }).background).toBe('aurora-nebula');
    expect(validateProject({ ...defaultProject([]), version: 1, template: 'folia-curtain' }).background).toBe('aurora-curtain');
  });
  it('undoes replacement and deletion of the actual portrait and font bytes', async () => {
    const h = new ProjectHistory(defaultProject([]));
    const original = new Blob(['original']), replacement = new Blob(['replacement']), font = new Blob(['font']);
    h.commit(p => ({ ...p, monetPortraitName: 'original' }), { monetPortrait: original });
    h.commit(p => ({ ...p, monetPortraitName: 'replacement', font: 'local' }), { monetPortrait: replacement, font });
    h.undo(); expect(h.current.project.monetPortraitName).toBe('original');
    expect(h.current.assets.monetPortrait).toBe(original); expect(h.current.assets.font).toBeNull();
    h.redo(); expect(await h.current.assets.monetPortrait?.text()).toBe('replacement'); expect(h.current.assets.font).toBe(font);
    h.commit(p => ({ ...p, monetPortraitName: undefined }), { monetPortrait: null });
    h.undo(); expect(h.current.assets.monetPortrait).toBe(replacement);
  });
  it('keeps asset references on normal lyric edits and discards redo after branching', () => {
    const h = new ProjectHistory(defaultProject([])), cover = new Blob(['cover']);
    h.commit(p => ({ ...p, title: 'First' }), { cover });
    h.commit(p => ({ ...p, title: 'Second' }));
    expect(h.current.assets.cover).toBe(cover);
    h.undo(); h.commit(p => ({ ...p, title: 'Branch' })); h.redo(); expect(h.current.project.title).toBe('Branch');
    h.replace(defaultProject([])); expect(h.past).toHaveLength(0);
  });
  it('recovers a last edit only against its matching durable baseline', () => {
    storage(); const base = defaultProject([]), next = { ...base, title: 'Unsaved final edit' };
    expect(writeProjectDraft(base, next)).toBe(true);
    expect(recoverProjectDraft(base).title).toBe(next.title);
    const other = { ...base, title: 'Edited in timestamp or another project' };
    expect(recoverProjectDraft(other)).toBe(other);
    clearProjectDraft(base); expect(recoverProjectDraft(base).title).toBe(next.title);
    clearProjectDraft(next); expect(recoverProjectDraft(base)).toBe(base);
  });
  it('falls back safely when recovery storage is full or the draft is corrupt', () => {
    vi.stubGlobal('localStorage', { getItem: () => '{broken', setItem: () => { throw Error('quota'); } });
    const p = defaultProject([]); expect(writeProjectDraft(p, p)).toBe(false); expect(recoverProjectDraft(p)).toBe(p);
  });
  it('omits a font unless explicitly supplied and preserves case-insensitive JSON import', async () => {
    const p = { ...defaultProject([]), font: 'local' as const, customFontName: 'Licensed font' };
    const omitted = await buildProjectArchive(p, null, false, null);
    expect(unzipSync(new Uint8Array(await omitted.arrayBuffer()))['font.bin']).toBeUndefined();
    const included = await buildProjectArchive(p, null, false, new Blob(['font bytes']));
    expect(unzipSync(new Uint8Array(await included.arrayBuffer()))['font.bin']).toBeDefined();
    const imported = await readProject(new File([JSON.stringify(p)], 'PROJECT.JSON'));
    expect(imported.project.title).toBe(p.title);
  });
});
