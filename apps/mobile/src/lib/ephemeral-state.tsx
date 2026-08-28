import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';

interface EphemeralStateContextValue {
  isSaved(id: string, fallback?: boolean): boolean;
  isVisited(id: string, fallback?: boolean): boolean;
  toggleSaved(id: string, fallback?: boolean): void;
  toggleVisited(id: string, fallback?: boolean): void;
}

const EphemeralStateContext = createContext<EphemeralStateContextValue | null>(null);

/**
 * In-memory only. It gives the fixture/live shell coherent interactions today;
 * a future account adapter can replace this provider without changing cards or
 * screens. Nothing is written to AsyncStorage, SQLite, or Supabase here.
 */
export function EphemeralStateProvider({ children }: { children: ReactNode }) {
  const [savedOverrides, setSavedOverrides] = useState<Record<string, boolean>>({});
  const [visitedOverrides, setVisitedOverrides] = useState<Record<string, boolean>>({});
  const isSaved = useCallback((id: string, fallback = false) => savedOverrides[id] ?? fallback, [savedOverrides]);
  const isVisited = useCallback((id: string, fallback = false) => visitedOverrides[id] ?? fallback, [visitedOverrides]);
  const toggleSaved = useCallback((id: string, fallback = false) => setSavedOverrides((current) => ({ ...current, [id]: !(current[id] ?? fallback) })), []);
  const toggleVisited = useCallback((id: string, fallback = false) => setVisitedOverrides((current) => ({ ...current, [id]: !(current[id] ?? fallback) })), []);
  const value = useMemo(() => ({ isSaved, isVisited, toggleSaved, toggleVisited }), [isSaved, isVisited, toggleSaved, toggleVisited]);
  return <EphemeralStateContext.Provider value={value}>{children}</EphemeralStateContext.Provider>;
}

export function useEphemeralPlaceState(): EphemeralStateContextValue {
  const value = useContext(EphemeralStateContext);
  if (!value) throw new Error('useEphemeralPlaceState must be used inside EphemeralStateProvider');
  return value;
}
