import type { Project } from './model';

export type ProjectAssets = { font: Blob | null; cover: Blob | null; monetPortrait: Blob | null };
export type EditorSnapshot = { project: Project; assets: ProjectAssets };
export const emptyProjectAssets = (): ProjectAssets => ({ font: null, cover: null, monetPortrait: null });

/** Blob references are retained, not copied, so undo restores the actual selected media. */
export class ProjectHistory {
  current: EditorSnapshot;
  past: EditorSnapshot[] = [];
  future: EditorSnapshot[] = [];
  constructor(project: Project) { this.current = { project, assets: emptyProjectAssets() }; }
  commit(next: Project | ((project: Project) => Project), assets?: Partial<ProjectAssets>) {
    this.past = [...this.past.slice(-79), this.current]; this.future = [];
    this.current = { project: typeof next === 'function' ? next(this.current.project) : next, assets: assets ? { ...this.current.assets, ...assets } : this.current.assets };
    return this.current;
  }
  replace(project: Project, assets: ProjectAssets = this.current.assets) {
    this.past = []; this.future = []; this.current = { project, assets }; return this.current;
  }
  undo() { const previous = this.past.pop(); if (previous) { this.future.push(this.current); this.current = previous; } return this.current; }
  redo() { const next = this.future.pop(); if (next) { this.past.push(this.current); this.current = next; } return this.current; }
}
