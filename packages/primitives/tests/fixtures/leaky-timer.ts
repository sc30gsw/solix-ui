export function createLeakyTimer(): () => void {
  return () => {
    setInterval(() => undefined, 1_000);
  };
}
