import { spawnSync } from "node:child_process";

function runCommand(script) {
  const result = spawnSync("npm", ["run", script], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${script} failed; stopping build.`);
}

export function buildForVercel(env = process.env, run = runCommand) {
  // NODE_ENV is also production in preview and local Next.js builds.
  if (env.VERCEL_ENV === "production") {
    run("db:migrate");
  } else {
    console.log("Skipping automatic migrations outside Vercel production.");
  }
  run("build");
}

if (import.meta.main) buildForVercel();
