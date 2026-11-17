import { defineConfig } from "vite-plus";
import solid from "@solidjs/vite-plugin";
import { allowedRuntimeDependencyNames } from "../../scripts/runtime-dependencies.ts";

const dependenciesOfTheLinkedLibrariesViteMustNotPreBundle = allowedRuntimeDependencyNames();

export default defineConfig({
  plugins: [solid({ start: { nodeServer: true }, ssr: true })],
  optimizeDeps: { exclude: dependenciesOfTheLinkedLibrariesViteMustNotPreBundle },
});
