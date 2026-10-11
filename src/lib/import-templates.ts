"use client";

import { useCallback, useEffect, useState } from "react";

export interface ImportTemplate {
  id: string;
  name: string;
  kind: "SEALED" | "SINGLE";
  game: string;
  sealedStatus: string; // Sealed: IN_STOCK | IN_TRANSIT | PRE_ORDER | ON_HOLD
  condition: "RAW" | "GRADED"; // Single
  rawGrade: string; // Single/Raw: S | A | B | ""
  gradingCompany: string; // Single/Graded: tên hãng (PSA, BGS...) hoặc ""
  grade: string; // Điểm số (10, 9.5...) hoặc ""
}

const STORAGE_KEY = "cardnest.importTemplates.v1";

export const DEFAULT_TEMPLATES: ImportTemplate[] = [
  {
    id: "preset-pokemon-single-psa10",
    name: "Pokémon TCG - Single - PSA 10",
    kind: "SINGLE",
    game: "Pokémon",
    sealedStatus: "IN_STOCK",
    condition: "GRADED",
    rawGrade: "",
    gradingCompany: "PSA",
    grade: "10",
  },
  {
    id: "preset-onepiece-sealed-box",
    name: "One Piece TCG - Sealed Booster Box",
    kind: "SEALED",
    game: "One Piece",
    sealedStatus: "IN_STOCK",
    condition: "RAW",
    rawGrade: "",
    gradingCompany: "",
    grade: "",
  },
  {
    id: "preset-pokemon-raw-s",
    name: "Pokémon TCG - Single - Raw hạng S",
    kind: "SINGLE",
    game: "Pokémon",
    sealedStatus: "IN_STOCK",
    condition: "RAW",
    rawGrade: "S",
    gradingCompany: "",
    grade: "",
  },
];

function read(): ImportTemplate[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as ImportTemplate[];
    }
  } catch {
    // localStorage unavailable or corrupted — fall back to the defaults.
  }
  return DEFAULT_TEMPLATES;
}

function write(list: ImportTemplate[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Ignore quota / private-mode errors; templates just won't persist.
  }
}

export function useImportTemplates() {
  // Loaded after mount so server and first client render match (no hydration mismatch).
  const [templates, setTemplates] = useState<ImportTemplate[]>([]);

  useEffect(() => {
    setTemplates(read());
  }, []);

  const save = useCallback((template: Omit<ImportTemplate, "id">) => {
    const created: ImportTemplate = { ...template, id: `tpl-${Date.now()}` };
    setTemplates((prev) => {
      const next = [...prev, created];
      write(next);
      return next;
    });
    return created;
  }, []);

  const remove = useCallback((id: string) => {
    setTemplates((prev) => {
      const next = prev.filter((t) => t.id !== id);
      write(next);
      return next;
    });
  }, []);

  return { templates, save, remove };
}
