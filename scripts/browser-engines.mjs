import { existsSync } from "node:fs";
import { chromium, firefox, webkit } from "playwright";

const engines = { chromium, firefox, webkit };

export const engineNames = Object.keys(engines);

export function browserType(name) {
  if (!engineNames.includes(name)) {
    throw new Error(
      `"${name}" is not a browser engine this project verifies. Use one of: ${engineNames.join(", ")}.`,
    );
  }
  return engines[name];
}

export function installedEngines() {
  return engineNames.filter((name) => existsSync(browserType(name).executablePath()));
}

export function enginesToVerify() {
  const installed = installedEngines();
  const missing = engineNames.filter((name) => !installed.includes(name));
  const everyEngineIsRequired = Boolean(process.env.CI);
  if (installed.length === 0 || (everyEngineIsRequired && missing.length > 0)) {
    throw new Error(
      `No Playwright browser is installed for: ${missing.join(", ")}. Run \`vp exec playwright install --with-deps ${missing.join(" ")}\`.`,
    );
  }
  return installed;
}
