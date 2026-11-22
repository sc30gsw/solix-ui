export type FencedBlock = {
  fence: string;
  info: string;
  lines: string[];
  closed: boolean;
};

export type Section = { level: 1 | 2; heading: string; prose: string[]; blocks: FencedBlock[] };

export type Markdown = { sections: Section[]; blocks: FencedBlock[]; lines: string[] };

const opening = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)/;
const heading = /^(#{1,2}) (.*?)\s*$/;
const commentStart = "<!--";
const commentEnd = "-->";

function closes(line: string, { fence }: FencedBlock): boolean {
  return new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`).test(line);
}

function outsideComments(line: string, inComment: boolean): { text: string; inComment: boolean } {
  let text = "";
  let rest = line;
  let inside = inComment;
  for (;;) {
    const marker = inside ? commentEnd : commentStart;
    const at = rest.indexOf(marker);
    if (at === -1) return { text: inside ? text : text + rest, inComment: inside };
    if (!inside) text += rest.slice(0, at);
    rest = rest.slice(at + marker.length);
    inside = !inside;
  }
}

export function parseMarkdown(text: string): Markdown {
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  const blocks: FencedBlock[] = [];
  const sections: Section[] = [];
  let open: FencedBlock | undefined;
  let inComment = false;
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
    const outside = outsideComments(line, inComment);
    const wasInComment = inComment;
    inComment = outside.inComment;
    const fence = wasInComment ? null : opening.exec(outside.text);
    if (fence !== null) {
      open = { fence: fence[1], info: fence[2], lines: [], closed: false };
      blocks.push(open);
      sections.at(-1)?.blocks.push(open);
      continue;
    }
    const title = heading.exec(outside.text);
    if (title !== null) {
      sections.push({ level: title[1] === "#" ? 1 : 2, heading: title[2], prose: [], blocks: [] });
    } else if (outside.text.trim() !== "" || outside.text === line) {
      sections.at(-1)?.prose.push(outside.text);
    }
  }
  return { sections, blocks, lines };
}
