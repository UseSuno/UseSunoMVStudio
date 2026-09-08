import type { Project } from '../domain/model';
import { validateProject } from './project';

const key = 'verse-studio-project-draft-v1';
/** Recover metadata only when the durable project still matches its exact baseline. */
export function writeProjectDraft(base: Project, project: Project): boolean {
  try { localStorage.setItem(key, JSON.stringify({ base, project })); return true; } catch { return false; }
}
export function recoverProjectDraft(base: Project): Project {
  try {
    const draft = JSON.parse(localStorage.getItem(key) || 'null');
    return draft && JSON.stringify(draft.base) === JSON.stringify(base) ? validateProject(draft.project) : base;
  } catch { return base; }
}
export function clearProjectDraft(project: Project) {
  try {
    const draft = JSON.parse(localStorage.getItem(key) || 'null');
    if (draft && JSON.stringify(draft.project) === JSON.stringify(project)) localStorage.removeItem(key);
  } catch { /* IndexedDB remains the durable copy when recovery storage is unavailable. */ }
}
