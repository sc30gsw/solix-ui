import { spawn } from "node:child_process";

const gracePeriod = 5_000;
const groupAlreadyGone = "ESRCH";

if (process.platform === "win32") {
  process.stderr.write(
    "tests/support/server-supervisor.ts stops a server by its POSIX process group, which Windows does not have. Run the tests on Linux or macOS, or in WSL.\n",
  );
  process.exit(1);
}

const [program, ...args] = process.argv.slice(2);
const server = spawn(program, args, { stdio: ["ignore", "inherit", "inherit"], detached: true });

function signalTheServer(signal: NodeJS.Signals): void {
  try {
    process.kill(-Number(server.pid), signal);
  } catch (error) {
    if (Reflect.get(Object(error), "code") !== groupAlreadyGone) throw error;
  }
}

let stopping = false;

function stop(): void {
  if (stopping) return;
  stopping = true;
  signalTheServer("SIGTERM");
  setTimeout(() => {
    signalTheServer("SIGKILL");
    process.exit(1);
  }, gracePeriod);
}

process.stdin.on("end", stop);
process.stdin.resume();
for (const signal of ["SIGINT", "SIGHUP", "SIGTERM"] as const) process.on(signal, stop);
server.on("exit", (code) => {
  signalTheServer("SIGKILL");
  process.exit(code ?? 1);
});
