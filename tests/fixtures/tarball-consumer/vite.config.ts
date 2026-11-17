import solid from "@solidjs/vite-plugin";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [solid({ start: { nodeServer: true }, ssr: true })],
});
