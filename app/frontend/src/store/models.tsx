import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { onDeviceLlama } from "@/src/services/ai/OnDeviceLlamaEngine";
import { modelService, speechModel, type ModelInfo, type ModelState } from "@/src/services/models/ModelService";
import { speechRecognition } from "@/src/services/voice";

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

  const loadLlama = useCallback(
    (id: string | null) => {
      const m = id ? models.find((x) => x.id === id) ?? null : null;
      onDeviceLlama.setModel(m ? modelService.pathFor(m.id) : null, m?.name);
    },
    [models]
  );

  useEffect(() => {
    modelService.loadState().then((s) => {
      setInstalled(s.installed);
      setSelectedId(s.selected);
      loadLlama(s.selected);
    });
    // Point the STT engine at the on-device Whisper model if it's already downloaded.
    speechModel.isInstalled().then((ok) => {
      if (ok) speechRecognition.setModel(speechModel.path);
    });
  }, [loadLlama]);

  const persist = (i: string[], sel: string | null) => {
    setInstalled(i);
    setSelectedId(sel);
    modelService.saveState({ installed: i, selected: sel });
    loadLlama(sel);
  };

  const download = useCallback(
    (id: string) => {
      setErrors(({ [id]: _removed, ...rest }) => rest);
      setProgress((p) => ({ ...p, [id]: 0 }));
      modelService
        .download(id, (v) => setProgress((p) => ({ ...p, [id]: v })))
        .then(() => {
          setInstalled((cur) => {
            const next = [...new Set([...cur, id])];
            // Auto-select the first installed model so the assistant is immediately usable.
            setSelectedId((sel) => {
              const nextSel = sel ?? id;
              modelService.saveState({ installed: next, selected: nextSel });
              loadLlama(nextSel);
              return nextSel;
            });
            return next;
          });
        })
        .catch((e: Error) => setErrors((er) => ({ ...er, [id]: e.message })))
        .finally(() => setProgress(({ [id]: _removed, ...rest }) => rest));
    },
    [loadLlama]
  );

  const value: Ctx = {
    models,
    installed,
    progress,
    errors,
    selected: models.find((m) => m.id === selectedId) ?? null,
    stateOf: (id) =>
      progress[id] !== undefined ? "downloading" : errors[id] ? "error" : installed.includes(id) ? "installed" : "available",
    download,
    remove: (id) => {
      modelService.delete(id);
      persist(
        installed.filter((x) => x !== id),
        selectedId === id ? installed.filter((x) => x !== id)[0] ?? null : selectedId
      );
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
