import { breakpointWidths } from "../../packages/core/src/style-prop-table.ts";

const pixelsPerEm = 16;

function pixelsOf(width: string): number {
  const ems = /^(\d+(?:\.\d+)?)em$/.exec(width);
  if (ems === null) {
    throw new Error(
      `${width}: a breakpoint width is written in em, so the widths that separate the breakpoints can be worked out.`,
    );
  }
  return Number(ems[1]) * pixelsPerEm;
}

const breakpointsByWidth = Object.entries(breakpointWidths)
  .map(([name, width]) => ({ name, pixels: pixelsOf(width) }))
  .sort((a, b) => a.pixels - b.pixels);

export const breakpointNames: readonly string[] = breakpointsByWidth.map(({ name }) => name);

export const separatingWidths: readonly number[] = breakpointsByWidth
  .slice(1)
  .map(({ pixels }, at) => Math.round((breakpointsByWidth[at].pixels + pixels) / 2));

export function breakpointsAlikeAt(width: number): string[][] {
  const reached = breakpointsByWidth.filter(({ pixels }) => pixels <= width);
  const beyond = breakpointsByWidth.filter(({ pixels }) => pixels > width);
  return [reached, beyond]
    .map((side) => side.map(({ name }) => name))
    .filter((side) => side.length > 1);
}
