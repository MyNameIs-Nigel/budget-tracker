import { spawnSync } from "node:child_process";
import { browserTestEnvironment } from "./test-environment.mjs";

function runCommand(command, args, env) {
  const result = spawnSync(command, args, { env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(" ")} failed.`);
}

export function runBrowserTests(
  env = process.env,
  args = [],
  run = runCommand,
) {
  // Validate the target before migration or build, including in a clean checkout.
  const testEnv = browserTestEnvironment(env);
  run("npm", ["run", "db:migrate"], testEnv);
  run("npm", ["run", "build"], testEnv);
  run("npm", ["exec", "--", "playwright", "test", ...args], testEnv);
}

if (import.meta.main) runBrowserTests(process.env, process.argv.slice(2));
