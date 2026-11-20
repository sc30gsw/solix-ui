import { symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createServer, type HotPayload } from "vite-plus";
import { expect, test } from "vite-plus/test";
import { repositoryRoot } from "../../../scripts/repository.ts";
import { storyControls, storyControlsModule } from "../../../scripts/story-controls.ts";
import { inTemporaryTree } from "../../../tests/support/temporary-tree.ts";

const libraryWith = (values: string) => `import type { JSX } from "@solidjs/web";

type ProbeProps = {
  /** How loud it speaks. */
  tone?: ${values};
};

const defaults = { tone: "calm" } satisfies Partial<ProbeProps>;

function Probe(props: ProbeProps): JSX.Element {
  return <div>{props.tone ?? defaults.tone}</div>;
}

export { Probe };
`;

const servedWithin = 20_000;
const optionsOfTone = /"tone":\{"control":\{"type":"select"\},"options":(\[[^\]]*\])/;

test("the served controls follow the library's source outside the server's root: a change to a prop's type under a running server reaches the next load of the controls module, with no restart", async () => {
  await inTemporaryTree(
    {
      "app/package.json": JSON.stringify({ name: "watched", type: "module" }),
      "library/src/index.tsx": libraryWith('"calm"'),
    },
    async (root) => {
      symlinkSync(join(repositoryRoot, "node_modules"), join(root, "node_modules"), "dir");
      const entry = join(root, "library/src/index.tsx");
      const server = await createServer({
        root: join(root, "app"),
        configFile: false,
        logLevel: "silent",
        plugins: [storyControls(entry)],
        server: { middlewareMode: true, hmr: false },
      });
      const served = async () =>
        optionsOfTone.exec(
          (await server.transformRequest(storyControlsModule, { ssr: true }))?.code ?? "",
        )?.[1];
      try {
        expect(await served()).toBe('["calm"]');
        writeFileSync(entry, libraryWith('"calm" | "loud"'));
        await expect.poll(served, { timeout: servedWithin }).toBe('["calm","loud"]');
      } finally {
        await server.close();
      }
    },
  );
});

test("a change to the library's source outside the root of a running server with hot updates reloads the stories that import the controls module, so the open page shows the new controls", async () => {
  await inTemporaryTree(
    {
      "app/package.json": JSON.stringify({ name: "watched", type: "module" }),
      "library/src/index.tsx": libraryWith('"calm"'),
      "app/stories/Probe.stories.ts": `import { argTypesOf } from "${storyControlsModule}";\nexport { argTypesOf };\n`,
    },
    async (root) => {
      symlinkSync(join(repositoryRoot, "node_modules"), join(root, "node_modules"), "dir");
      const entry = join(root, "library/src/index.tsx");
      const server = await createServer({
        root: join(root, "app"),
        configFile: false,
        logLevel: "silent",
        plugins: [storyControls(entry)],
        server: { middlewareMode: true, ws: false },
      });
      const { client } = server.environments;
      const sent: HotPayload[] = [];
      const send = client.hot.send.bind(client.hot);
      client.hot.send = (payload: HotPayload) => {
        sent.push(payload);
        send(payload);
      };
      try {
        await client.transformRequest("/stories/Probe.stories.ts");
        await client.transformRequest(storyControlsModule);
        writeFileSync(entry, libraryWith('"calm" | "loud"'));
        await expect
          .poll(() => sent.map(({ type }) => type), { timeout: servedWithin })
          .toContain("full-reload");
      } finally {
        await server.close();
      }
    },
  );
});

test("each served control carries its prop's doc comment as its description and the literal its component's defaults object declares as its default, for the controls table", async () => {
  await inTemporaryTree(
    { "library/src/index.tsx": libraryWith('"calm" | "loud"') },
    async (root) => {
      symlinkSync(join(repositoryRoot, "node_modules"), join(root, "node_modules"), "dir");
      const server = await createServer({
        root,
        configFile: false,
        logLevel: "silent",
        plugins: [storyControls(join(root, "library/src/index.tsx"))],
        server: { middlewareMode: true, hmr: false },
      });
      try {
        const code =
          (await server.transformRequest(storyControlsModule, { ssr: true }))?.code ?? "";
        const tone = /"Probe":\{"tone":(\{.*?\}\}\})/.exec(code)?.[1] ?? "";
        expect(JSON.parse(tone)).toMatchObject({
          description: "How loud it speaks.",
          table: { defaultValue: { summary: '"calm"' } },
        });
      } finally {
        await server.close();
      }
    },
  );
});
