const gitVariable = /^GIT_/;

export function setup(): void {
  for (const name of Object.keys(process.env).filter((each) => gitVariable.test(each))) {
    Reflect.deleteProperty(process.env, name);
  }
}
