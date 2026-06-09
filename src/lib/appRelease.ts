/** Injected at build time from `package.json` (see `vite.config.ts`). */
export const appVersion = __APP_VERSION__;

/** ISO timestamp of the last production build (Vercel) or dev server start. */
export const appBuildIso = __APP_BUILD_ISO__;

export type SemverParts = {
  major: number;
  minor: number;
  patch: number;
};

/** Parses `major.minor.patch` from the app version string. */
export function parseAppVersion(): SemverParts {
  const [major = "0", minor = "0", patch = "0"] = appVersion.split(".");
  return {
    major: parseInt(major, 10) || 0,
    minor: parseInt(minor, 10) || 0,
    patch: parseInt(patch, 10) || 0,
  };
}

export function formatAppBuildDate(locale: "fr" | "en"): string {
  const d = new Date(appBuildIso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
