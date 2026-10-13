import { join } from "node:path";
import { run, type RunOptions, type RunResult } from "./proc.ts";

const CLI = join(import.meta.dir, "..", "..", "src", "cli.ts");

export async function runCps(args: string[], options: RunOptions): Promise<RunResult> {
  return run(["bun", CLI, ...args], options);
}
