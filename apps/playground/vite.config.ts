import { defineConfig } from "vite-plus";
import solid from "@solidjs/vite-plugin";

const workspaceLinkedDependenciesViteMustNotPreBundle = ["@ui-sdk/core"];

export default defineConfig({
  plugins: [solid({ start: { nodeServer: true }, ssr: true })],
  optimizeDeps: { exclude: workspaceLinkedDependenciesViteMustNotPreBundle },
});
