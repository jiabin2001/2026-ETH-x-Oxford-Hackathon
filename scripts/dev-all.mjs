import { spawn } from "node:child_process";

const procs = [];

function run(cmd, args, name) {
  const p = spawn(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
  p.on("exit", (code) => {
    console.log(`[${name}] exited with code`, code);
    process.exitCode = code ?? 1;
  });
  procs.push(p);
}

run("npm", ["-w", "apps/middleware", "run", "dev"], "middleware");
run("npm", ["-w", "apps/dashboard", "run", "dev"], "dashboard");

process.on("SIGINT", () => {
  for (const p of procs) p.kill("SIGINT");
  process.exit(0);
});
