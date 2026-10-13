import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface FakeBinOptions {
  exitCode?: number;
  stdout?: string;
  stderr?: string;
}

export interface FakeBin {
  name: string;
  calls(): Promise<string[][]>;
}

export interface FakeBinDir {
  path: string;
  /** PATH with this dir first, so a fake shim shadows the real command; everything else still resolves. */
  env: { PATH: string };
  fakeBin(name: string, opts?: FakeBinOptions): Promise<FakeBin>;
}

export async function makeFakeBinDir(root: string): Promise<FakeBinDir> {
  const dir = join(root, "fake-bin");
  await mkdir(dir, { recursive: true });

  return {
    path: dir,
    env: { PATH: `${dir}:${process.env.PATH ?? ""}` },
    async fakeBin(name, opts = {}) {
      const exitCode = opts.exitCode ?? 0;
      const stdout = opts.stdout ?? "";
      const stderr = opts.stderr ?? "";
      const scriptPath = join(dir, name);
      const logPath = join(dir, `${name}.calls.jsonl`);

      // A tiny bun script, not a shell script: it needs to record argv as JSON, and bun is
      // the one interpreter this project guarantees is on PATH.
      const script = `#!/usr/bin/env bun
import { appendFileSync } from "node:fs";
appendFileSync(${JSON.stringify(logPath)}, JSON.stringify(process.argv.slice(2)) + "\\n");
process.stdout.write(${JSON.stringify(stdout)});
process.stderr.write(${JSON.stringify(stderr)});
process.exit(${exitCode});
`;
      await writeFile(scriptPath, script);
      await chmod(scriptPath, 0o755);

      return {
        name,
        async calls() {
          const file = Bun.file(logPath);
          if (!(await file.exists())) return [];
          const text = await file.text();
          return text
            .split("\n")
            .filter((line) => line.length > 0)
            .map((line) => JSON.parse(line) as string[]);
        },
      };
    },
  };
}
