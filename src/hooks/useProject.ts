import { useCallback, useRef, useState } from 'react';
import type { Project } from '../domain/model';
// Keep bounded project snapshots for reversible editing, separate from audio buffers.
export function useProject(initial: Project) {
  const [project, setProject] = useState(initial);
  const past = useRef<Project[]>([]), future = useRef<Project[]>([]);
  const current = useRef(project); current.current = project;
  const [, refresh] = useState(0);
  const commit = useCallback((next: Project | ((p: Project) => Project)) => {
    const value = typeof next === 'function' ? next(current.current) : next;
    past.current = [...past.current.slice(-79), current.current]; future.current = []; current.current = value; setProject(value);
  }, []);
  const replace = useCallback((value: Project) => { past.current = []; future.current = []; current.current = value; setProject(value); }, []);
  const undo = useCallback(() => { const prev = past.current.pop(); if (prev) { future.current.push(current.current); current.current = prev; setProject(prev); refresh(n => n + 1); } }, []);
  const redo = useCallback(() => { const next = future.current.pop(); if (next) { past.current.push(current.current); current.current = next; setProject(next); refresh(n => n + 1); } }, []);
  return { project, commit, replace, undo, redo, canUndo: past.current.length > 0, canRedo: future.current.length > 0 };
}
