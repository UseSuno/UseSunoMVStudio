import { useCallback, useState } from 'react';
import type { Project } from '../domain/model';
import { ProjectHistory, type ProjectAssets } from '../domain/projectHistory';

export function useProject(initial: Project) {
  const [history] = useState(() => new ProjectHistory(initial));
  const [snapshot, setSnapshot] = useState(history.current);
  const commit = useCallback((next: Project | ((p: Project) => Project), assets?: Partial<ProjectAssets>) => setSnapshot(history.commit(next, assets)), [history]);
  const replace = useCallback((value: Project, assets?: ProjectAssets) => setSnapshot(history.replace(value, assets)), [history]);
  const undo = useCallback(() => setSnapshot(history.undo()), [history]);
  const redo = useCallback(() => setSnapshot(history.redo()), [history]);
  return { ...snapshot, commit, replace, undo, redo, canUndo: history.past.length > 0, canRedo: history.future.length > 0 };
}
