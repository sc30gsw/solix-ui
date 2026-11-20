import type { Page } from "playwright";

const stylesheetsLateBy = 2_000;

const stylesheetLink = /<link rel="stylesheet" href="([^"]+)"[^>]*>/g;

function linkedByAScriptSoItBlocksNoScript(href: string): string {
  const link = `Object.assign(document.createElement("link"), { rel: "stylesheet", href: ${JSON.stringify(href)} })`;
  return `<script>document.currentScript.after(${link});</script>`;
}

export async function withItsStylesheetsLate(page: Page, url: string): Promise<void> {
  await page.route(url, async (route) => {
    const response = await route.fetch();
    const served = await response.text();
    const body = served.replace(stylesheetLink, (_, href: string) =>
      linkedByAScriptSoItBlocksNoScript(href),
    );
    if (body === served) {
      throw new Error(`${url}: the page links no stylesheet, so none can arrive late.`);
    }
    await route.fulfill({ response, body });
  });
  await page.route("**/*.css", async (route) => {
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, stylesheetsLateBy));
    await route.fulfill({ response });
  });
}
