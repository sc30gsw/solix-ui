import solid from "@solidjs/vite-plugin";
import stylex from "@stylexjs/unplugin";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [stylex.vite(), solid()],
});
