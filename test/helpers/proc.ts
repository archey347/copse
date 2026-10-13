export interface RunOptions {
  cwd: string;
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
}

export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const DEFAULT_TIMEOUT_MS = 10_000;

// An override of undefined removes the variable, so a test can unset what test/setup.ts set.
function withoutUndefined(env: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined));
}

// The only Bun.spawn call in tests: without an explicit env, Bun would ignore test/setup.ts.
export async function run(cmd: string[], options: RunOptions): Promise<RunResult> {
  const { cwd, env, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  const proc = Bun.spawn(cmd, {
    cwd,
    env: withoutUndefined({ ...process.env, ...env }),
    // Not "inherit": a step that wrongly reads stdin should see EOF, not the test runner's tty.
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });

  // Subprocess.killed is also true after a normal exit, so it can't tell a timeout apart.
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, timeoutMs);
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    if (timedOut) {
      throw new Error(`command timed out after ${timeoutMs}ms: ${cmd.join(" ")}`);
    }

    return { exitCode, stdout, stderr };
  } finally {
    clearTimeout(timer);
  }
}
