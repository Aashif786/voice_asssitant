import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { modelService, type ModelInfo, type ModelState } from "@/src/services/models/ModelService";

type Ctx = {
  models: ModelInfo[];
  installed: string[];
  selected: ModelInfo | null;
  progress: Record<string, number>;
  errors: Record<string, string>;
  stateOf: (id: string) => ModelState;
  download: (id: string) => void;
  remove: (id: string) => void;
  select: (id: string) => void;
};

const ModelsContext = createContext<Ctx | null>(null);

export function ModelsProvider({ children }: { children: ReactNode }) {
  const [installed, setInstalled] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const models = modelService.catalogue();

  useEffect(() => {
    modelService.loadState().then((s) => { setInstalled(s.installed); setSelectedId(s.selected); });
  }, []);

  const persist = (i: string[], s: string | null) => { setInstalled(i); setSelectedId(s); modelService.saveState({ installed: i, selected: s }); };

  const download = useCallback((id: string) => {
    setErrors(({ [id]: _, ...rest }) => rest);
    setProgress((p) => ({ ...p, [id]: 0 }));
    modelService.download(id, (v) => setProgress((p) => ({ ...p, [id]: v })))
      .then(() => setInstalled((cur) => { const next = [...new Set([...cur, id])]; modelService.saveState({ installed: next, selected: selectedId }); return next; }))
      .catch((e: Error) => setErrors((er) => ({ ...er, [id]: e.message })))
      .finally(() => setProgress(({ [id]: _, ...rest }) => rest));
  }, [selectedId]);

  const value: Ctx = {
    models, installed, progress, errors,
    selected: models.find((m) => m.id === selectedId) ?? null,
    stateOf: (id) => (progress[id] !== undefined ? "downloading" : errors[id] ? "error" : installed.includes(id) ? "installed" : "available"),
    download,
    remove: (id) => {
      modelService.delete(id);
      persist(installed.filter((x) => x !== id), selectedId === id ? null : selectedId);
    },
    select: (id) => persist(installed, id),
  };
  return <ModelsContext.Provider value={value}>{children}</ModelsContext.Provider>;
}

export function useModels() {
  const c = useContext(ModelsContext);
  if (!c) throw new Error("useModels must be inside ModelsProvider");
  return c;
}
