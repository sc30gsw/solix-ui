const gitVariable = /^GIT_/;

export function gitVariablesIn(environment: NodeJS.ProcessEnv): string[] {
  return Object.keys(environment).filter((name) => gitVariable.test(name));
}

export function setup(): void {
  for (const name of gitVariablesIn(process.env)) Reflect.deleteProperty(process.env, name);
}
