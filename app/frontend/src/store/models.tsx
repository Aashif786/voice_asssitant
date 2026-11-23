import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { onDeviceLlama } from "@/src/services/ai/OnDeviceLlamaEngine";
import { isBackendConfigured } from "@/src/services/api";
import { modelService, type ModelInfo, type ModelState, type ModelType } from "@/src/services/models/ModelService";
import { speechRecognition } from "@/src/services/voice";

type Ctx = {
  models: ModelInfo[];
  llmModels: ModelInfo[];
  sttModels: ModelInfo[];
  installed: string[];
  selectedLlm: ModelInfo | null;
  selectedStt: ModelInfo | null;
  selected: ModelInfo | null; // Backward compatibility alias for selectedLlm
  progress: Record<string, number>;
  errors: Record<string, string>;
  stateOf: (id: string) => ModelState;
  download: (id: string) => void;
  remove: (id: string) => void;
  select: (id: string) => void;
  selectLlm: (id: string) => void;
  selectStt: (id: string | null) => void;
  refreshCatalogue: () => Promise<void>;
  discover: (query: string, type?: ModelType) => Promise<ModelInfo[]>;
};

const ModelsContext = createContext<Ctx | null>(null);

export function ModelsProvider({ children }: { children: ReactNode }) {
  const [models, setModels] = useState<ModelInfo[]>(() => modelService.catalogue());
  const [installed, setInstalled] = useState<string[]>([]);
  const [selectedLlmId, setSelectedLlmId] = useState<string | null>(null);
  const [selectedSttId, setSelectedSttId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const loadLlama = useCallback(
    (id: string | null) => {
      const m = id ? models.find((x) => x.id === id) ?? null : null;
      if (m && m.type === "llm" && m.requiresDownload) {
        onDeviceLlama.setModel(modelService.pathFor(m.id), m.name);
      } else {
        onDeviceLlama.setModel(null, m?.name);
      }
    },
    [models]
  );

  const applySttSelection = useCallback(
    (sttId: string | null) => {
      speechRecognition.setActiveModelId?.(sttId);
      if (!sttId) {
        speechRecognition.setModel(null);
        return;
      }
      const m = models.find((x) => x.id === sttId);
      if (m?.type === "stt" && m.requiresDownload) {
        speechRecognition.setModel(modelService.pathFor(m.id));
      } else {
        speechRecognition.setModel(null);
      }
    },
    [models]
  );

  const refreshCatalogue = useCallback(async () => {
    try {
      const updated = await modelService.syncFromBackend();
      setModels(updated);
      const state = await modelService.loadState();
      setInstalled(state.installed);
    } catch {
      /* ignore */
    }
  }, []);

  const discover = useCallback(async (query: string, type?: ModelType): Promise<ModelInfo[]> => {
    try {
      const results = await modelService.discoverFromProvider(query, type);
      setModels(modelService.catalogue());
      return results;
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    modelService.loadState().then(async (s) => {
      setModels(modelService.catalogue());
      setInstalled(s.installed);
      setSelectedLlmId(s.selectedLlm);
      setSelectedSttId(s.selectedStt);
      loadLlama(s.selectedLlm);
      applySttSelection(s.selectedStt);

      // Auto-select defaults if nothing selected
      const autoStt = s.selectedStt ?? "stt-system";
      if (!s.selectedLlm) {
        const defaultLlm = s.installed.find((id) => id.includes("qwen") || id.includes("smol")) ?? "qwen2.5-0.5b";
        setSelectedLlmId(defaultLlm);
        modelService.saveState({ selectedLlm: defaultLlm });
        loadLlama(defaultLlm);
      }
      if (!s.selectedStt) {
        setSelectedSttId(autoStt);
        modelService.saveState({ selectedStt: autoStt });
        applySttSelection(autoStt);
      }
    });
  }, [loadLlama, applySttSelection]);

  const selectLlm = useCallback(
    (id: string) => {
      setSelectedLlmId(id);
      modelService.saveState({ selectedLlm: id });
      loadLlama(id);
    },
    [loadLlama]
  );

  const selectStt = useCallback(
    (id: string | null) => {
      setSelectedSttId(id);
      modelService.saveState({ selectedStt: id });
      applySttSelection(id);
    },
    [applySttSelection]
  );

  const select = useCallback(
    (id: string) => {
      const m = models.find((x) => x.id === id);
      if (m?.type === "stt") {
        selectStt(id);
      } else {
        selectLlm(id);
      }
    },
    [models, selectLlm, selectStt]
  );

  const download = useCallback(
    (id: string) => {
      const targetModel = models.find((x) => x.id === id);
      if (!targetModel || !targetModel.requiresDownload) return;

      setErrors(({ [id]: _removed, ...rest }) => rest);
      setProgress((p) => ({ ...p, [id]: 0.01 }));

      modelService
        .download(id, (v) => setProgress((p) => ({ ...p, [id]: v })))
        .then(() => {
          setInstalled((cur) => {
            const next = [...new Set([...cur, id])];
            if (targetModel.type === "llm") {
              setSelectedLlmId((sel) => {
                const nextSel = sel ?? id;
                modelService.saveState({ installed: next, selectedLlm: nextSel });
                loadLlama(nextSel);
                return nextSel;
              });
            } else if (targetModel.type === "stt") {
              setSelectedSttId((sel) => {
                const nextSel = sel ?? id;
                modelService.saveState({ installed: next, selectedStt: nextSel });
                applySttSelection(nextSel);
                return nextSel;
              });
            }
            return next;
          });
        })
        .catch((e: Error) => setErrors((er) => ({ ...er, [id]: e.message })))
        .finally(() => setProgress(({ [id]: _removed, ...rest }) => rest));
    },
    [models, loadLlama, applySttSelection]
  );

  const remove = useCallback(
    (id: string) => {
      const targetModel = models.find((x) => x.id === id);
      if (!targetModel || !targetModel.requiresDownload) return;

      modelService.delete(id);
      setInstalled((cur) => {
        const next = cur.filter((x) => x !== id);
        if (selectedLlmId === id) {
          const nextLlm = next.find((x) => models.find((m) => m.id === x)?.type === "llm") ?? null;
          setSelectedLlmId(nextLlm);
          modelService.saveState({ installed: next, selectedLlm: nextLlm });
          loadLlama(nextLlm);
        }
        if (selectedSttId === id) {
          setSelectedSttId(null);
          modelService.saveState({ installed: next, selectedStt: null });
          applySttSelection(null);
        }
        return next;
      });
    },
    [models, selectedLlmId, selectedSttId, loadLlama, applySttSelection]
  );

  const stateOf = useCallback(
    (id: string): ModelState => {
      const m = models.find((x) => x.id === id);
      if (!m) return "unavailable";
      if (!m.requiresDownload) return "installed";
      if (progress[id] !== undefined) return "downloading";
      if (errors[id]) return "error";
      if (installed.includes(id)) return "installed";
      return "available";
    },
    [models, progress, errors, installed]
  );

  const selectedLlm = models.find((m) => m.id === selectedLlmId) ?? null;
  const selectedStt = models.find((m) => m.id === selectedSttId) ?? null;

  const value: Ctx = {
    models,
    llmModels: models.filter((m) => m.type === "llm"),
    sttModels: models.filter((m) => m.type === "stt"),
    installed,
    selectedLlm,
    selectedStt,
    selected: selectedLlm,
    progress,
    errors,
    stateOf,
    download,
    remove,
    select,
    selectLlm,
    selectStt,
    refreshCatalogue,
    discover,
  };

  return <ModelsContext.Provider value={value}>{children}</ModelsContext.Provider>;
}

export function useModels() {
  const c = useContext(ModelsContext);
  if (!c) throw new Error("useModels must be inside ModelsProvider");
  return c;
}
