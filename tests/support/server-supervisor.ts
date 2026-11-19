import { spawn } from "node:child_process";

const [program, ...args] = process.argv.slice(2);
const server = spawn(program, args, { stdio: ["ignore", "inherit", "inherit"] });

function stopTheGroup(): void {
  process.kill(-process.pid, "SIGTERM");
}

process.stdin.on("end", stopTheGroup);
process.stdin.resume();
for (const signal of ["SIGINT", "SIGHUP"] as const) process.on(signal, stopTheGroup);
server.on("exit", (code) => {
  process.exitCode = code ?? 1;
  stopTheGroup();
});
