import { render } from "@solidjs/web";
import { App } from "#/src/App.tsx";

const root = document.getElementById("root");
if (root) render(() => <App />, root);
