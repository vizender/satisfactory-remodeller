import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type InputModality = "trackpad" | "mouse";
export type InputModalityPreference = "auto" | InputModality;

const STORAGE_KEY = "remodeller:input-modality";

const TRACKPAD_WHEEL_MAX_DELTA = 40;

type InputModalityContextValue = {
  preference: InputModalityPreference;
  setPreference: (value: InputModalityPreference) => void;
  /** Résolu pour React Flow (`auto` → heuristique ou défaut souris). */
  effective: InputModality;
};

const InputModalityContext = createContext<InputModalityContextValue | null>(
  null,
);

function readStoredPreference(): InputModalityPreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "trackpad" || v === "mouse" || v === "auto") return v;
  } catch {
    /* private mode */
  }
  return "auto";
}

function writeStoredPreference(value: InputModalityPreference) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
}

export function InputModalityProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<InputModalityPreference>(
    readStoredPreference,
  );
  const [detected, setDetected] = useState<InputModality>("mouse");
  const wheelSamples = useRef(0);

  const setPreference = useCallback((value: InputModalityPreference) => {
    setPreferenceState(value);
    writeStoredPreference(value);
  }, []);

  useEffect(() => {
    if (preference !== "auto") return;

    wheelSamples.current = 0;

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return;
      if (Math.abs(e.deltaY) >= TRACKPAD_WHEEL_MAX_DELTA) {
        setDetected("mouse");
        return;
      }
      if (e.deltaMode !== 0) return;

      wheelSamples.current += 1;
      if (wheelSamples.current >= 2) {
        setDetected("trackpad");
      }
    };

    window.addEventListener("wheel", onWheel, { passive: true });
    return () => window.removeEventListener("wheel", onWheel);
  }, [preference]);

  const effective: InputModality =
    preference === "auto" ? detected : preference;

  const value = useMemo(
    () => ({ preference, setPreference, effective }),
    [preference, setPreference, effective],
  );

  return (
    <InputModalityContext.Provider value={value}>
      {children}
    </InputModalityContext.Provider>
  );
}

export function useInputModality(): InputModalityContextValue {
  const ctx = useContext(InputModalityContext);
  if (!ctx) {
    throw new Error("useInputModality must be used within InputModalityProvider");
  }
  return ctx;
}

/** Props React Flow selon trackpad vs souris. */
export function reactFlowInteractionProps(modality: InputModality) {
  if (modality === "trackpad") {
    return {
      panOnScroll: true,
      zoomOnScroll: false,
      zoomOnPinch: true,
      panOnScrollSpeed: 0.85,
    } as const;
  }
  return {
    panOnScroll: false,
    zoomOnScroll: true,
    zoomOnPinch: true,
    panOnScrollSpeed: 0.5,
  } as const;
}
