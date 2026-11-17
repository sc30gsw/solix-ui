const variablesOfTheTestRunner = /^(VITEST|VITE_|TEST$|MODE$|NODE_ENV$)/;

export function withoutTestRunnerVariables(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !variablesOfTheTestRunner.test(name)),
  );
}
