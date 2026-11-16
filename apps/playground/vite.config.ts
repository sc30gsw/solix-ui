import { defineConfig } from "vite-plus";
import solid from "@solidjs/vite-plugin";
import { allowedRuntimeDependencies } from "../../scripts/runtime-dependencies.ts";

const dependenciesOfTheLinkedLibrariesViteMustNotPreBundle = allowedRuntimeDependencies().map(
  ({ dependency }) => dependency,
);

export default defineConfig({
  plugins: [solid({ start: { nodeServer: true }, ssr: true })],
  optimizeDeps: { exclude: dependenciesOfTheLinkedLibrariesViteMustNotPreBundle },
});
