export const seedVariable = "SOLIX_PROPERTY_SEED";

export function seedOfThisRun(): string | undefined {
  return import.meta.env.SOLIX_PROPERTY_SEED;
}

const integer = /^-?\d+$/;

export function seedFrom(given: string | undefined): number | undefined {
  if (given === undefined || given.trim() === "") return undefined;
  if (!integer.test(given.trim())) {
    throw new Error(
      `${seedVariable} is ${JSON.stringify(given)}. Set it to an integer seed, or leave it unset.`,
    );
  }
  return Number(given.trim());
}

export function seedNotice(given: string | undefined): string | undefined {
  const seed = seedFrom(given);
  return seed === undefined
    ? undefined
    : `${seedVariable} is ${seed}, so every generated property of this run draws from seed ${seed}. Unset it to draw at random.`;
}
