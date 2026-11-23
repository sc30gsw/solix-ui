import { SpecError } from "#/spec/format.ts";

export const channelTolerance = 2;
const lengthTolerance = 0.5;
const grounds = ["#ffffff", "#000000"] as const;

function painted(colour: string, ground: string): readonly number[] {
  if (!CSS.supports("color", colour)) {
    throw new SpecError(`${colour}: the engine reads no colour from it, so it cannot be compared.`);
  }
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context === null) throw new SpecError("The engine gave no 2D canvas to paint a colour on.");
  context.fillStyle = ground;
  context.fillRect(0, 0, 1, 1);
  context.fillStyle = colour;
  context.fillRect(0, 0, 1, 1);
  return [...context.getImageData(0, 0, 1, 1).data];
}

export function sameColour(actual: string, expected: string): boolean {
  return grounds.every((ground) => {
    const [one, other] = [painted(actual, ground), painted(expected, ground)];
    return one.every((channel, index) => Math.abs(channel - other[index]) <= channelTolerance);
  });
}

export function sameLength(actual: string, expected: string): boolean {
  const [one, other] = [Number.parseFloat(actual), Number.parseFloat(expected)];
  return Number.isFinite(one) && Number.isFinite(other) && Math.abs(one - other) <= lengthTolerance;
}
