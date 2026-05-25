import { TUTORIAL_STORAGE_KEY } from "@/tutorial/constants";

export function isTutorialCompleted(): boolean {
  try {
    return localStorage.getItem(TUTORIAL_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markTutorialCompleted(): void {
  try {
    localStorage.setItem(TUTORIAL_STORAGE_KEY, "1");
  } catch {
    /* ignore quota */
  }
}

export function clearTutorialCompleted(): void {
  try {
    localStorage.removeItem(TUTORIAL_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
