export type FencedBlock = {
  fence: string;
  info: string;
  lines: string[];
  closed: boolean;
};

export type Section = { heading: string; prose: string[]; blocks: FencedBlock[] };

export type Markdown = {
  sections: Section[];
  blocks: FencedBlock[];
  prose: string[];
  lines: string[];
};

const opening = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)/;
const secondLevelHeading = /^## (.*?)\s*$/;

function closes(line: string, { fence }: FencedBlock): boolean {
  const run = new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`);
  return run.test(line);
}

export function parseMarkdown(text: string): Markdown {
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  const blocks: FencedBlock[] = [];
  const prose: string[] = [];
  const sections: Section[] = [];
  let open: FencedBlock | undefined;
  for (const line of lines) {
    if (open !== undefined) {
      if (closes(line, open)) {
        open.closed = true;
        open = undefined;
      } else {
        open.lines.push(line);
      }
      continue;
    }
    const fence = opening.exec(line);
    if (fence !== null) {
      open = { fence: fence[1], info: fence[2], lines: [], closed: false };
      blocks.push(open);
      sections.at(-1)?.blocks.push(open);
      continue;
    }
    prose.push(line);
    const heading = secondLevelHeading.exec(line);
    if (heading !== null) sections.push({ heading: heading[1], prose: [], blocks: [] });
    else sections.at(-1)?.prose.push(line);
  }
  return { sections, blocks, prose, lines };
}
