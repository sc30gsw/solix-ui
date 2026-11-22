const channelTolerance = 2;
const lengthTolerance = 0.5;
const sentinel = "#010203";

function painted(colour: string): readonly number[] {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context === null) throw new Error("The browser gave no 2D canvas to read a colour on.");
  context.fillStyle = sentinel;
  context.fillStyle = colour;
  if (context.fillStyle === sentinel && colour.toLowerCase() !== sentinel) {
    throw new Error(`${colour}: the canvas cannot paint this colour, so it cannot be compared.`);
  }
  context.clearRect(0, 0, 1, 1);
  context.fillRect(0, 0, 1, 1);
  return [...context.getImageData(0, 0, 1, 1).data];
}

export function sameColour(actual: string, expected: string): boolean {
  const [one, other] = [painted(actual), painted(expected)];
  if (one[3] === 0 && other[3] === 0) return true;
  return one.every((channel, index) => Math.abs(channel - other[index]) <= channelTolerance);
}

export function sameLength(actual: string, expected: string): boolean {
  const [one, other] = [Number.parseFloat(actual), Number.parseFloat(expected)];
  return Number.isFinite(one) && Number.isFinite(other) && Math.abs(one - other) <= lengthTolerance;
}
