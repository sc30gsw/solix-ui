import { defineConfig } from "vite-plus";
import solid from "@solidjs/vite-plugin";
import { allowedRuntimeDependencies } from "../../scripts/runtime-dependencies.ts";

const dependenciesOfTheLinkedLibrariesViteMustNotPreBundle = allowedRuntimeDependencies().flatMap(
  ({ dependency, seam }) => (seam === undefined ? [] : [dependency]),
);

export default defineConfig({
  plugins: [solid({ start: { nodeServer: true }, ssr: true })],
  optimizeDeps: { exclude: dependenciesOfTheLinkedLibrariesViteMustNotPreBundle },
});
