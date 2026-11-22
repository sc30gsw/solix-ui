import { defineConfig } from "vite-plus";
import solid from "@solidjs/vite-plugin";
import { allowedRuntimeDependencyNames } from "../../scripts/runtime-dependencies.ts";
import { builtFromItsSources } from "../../scripts/source-digest.ts";

const dependenciesOfTheLinkedLibrariesViteMustNotPreBundle = allowedRuntimeDependencyNames();

export default defineConfig({
  plugins: [
    builtFromItsSources(),
    solid({ start: { nodeServer: true, middleware: "src/middleware.ts" }, ssr: true }),
  ],
  optimizeDeps: { exclude: dependenciesOfTheLinkedLibrariesViteMustNotPreBundle },
});
