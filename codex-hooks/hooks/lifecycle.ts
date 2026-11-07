/** Defer todo prompts and bracket only a new chat's first jj run. No dependencies. */
export const JJ = "/opt/homebrew/bin/jj";
const decoder = new TextDecoder();

export interface HookEvent {
  hook_event_name: string;
  session_id: string;
  cwd: string;
  permission_mode?: string;
  source?: string;
  prompt?: string;
  turn_id?: string;
  stop_hook_active?: boolean;
  last_assistant_message?: string | null;
}

interface State {
  phase?: "pending" | "ignored" | "running" | "finished";
  root?: string;
  change?: string;
  initialDescription?: string;
}

type Output = Record<string, unknown>;

export async function jj(cwd: string, ...args: string[]): Promise<string> {
  const result = await new Deno.Command(JJ, {
    args: ["--no-pager", "--color=never", ...args],
    cwd,
    stdout: "piped",
    stderr: "piped",
    signal: AbortSignal.timeout(15_000),
  }).output();
  if (!result.success) {
    throw new Error(
      decoder.decode(result.stderr).trim() || "jj command failed",
    );
  }
  return decoder.decode(result.stdout).trim();
}

async function workingChange(cwd: string, snapshot = true) {
  const [change, empty] = (await jj(
    cwd,
    ...(!snapshot ? ["--ignore-working-copy"] : []),
    "log",
    "-r",
    "@",
    "--no-graph",
    "-T",
    'change_id ++ "\n" ++ empty',
  )).split("\n");
  if (!change || !["true", "false"].includes(empty)) {
    throw new Error("Unexpected jj working-change output");
  }
  return { change, empty: empty === "true" };
}

async function newIfCurrent(root: string, change: string): Promise<boolean> {
  try {
    // The intersection is evaluated by jj when the command executes. A stale
    // approval cannot create a child of a different working change or move it.
    await jj(root, "new", `${change} & @`);
    return true;
  } catch (error) {
    if ((await workingChange(root, false)).change !== change) return false;
    throw error;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}

async function jjWorkspace(cwd: string): Promise<string | undefined> {
  let directory = await Deno.realPath(cwd);
  // A nested Git-only repository must not inherit an ancestor's jj workspace.
  // Check the current folder and at most three parent folders.
  for (let depth = 0; depth <= 3; depth++) {
    if (await exists(`${directory}/.jj`)) {
      return await jj(cwd, "root", "--ignore-working-copy");
    }
    if (await exists(`${directory}/.git`)) return undefined;
    const parent = directory.slice(0, directory.lastIndexOf("/")) || "/";
    if (parent === directory) return undefined;
    directory = parent;
  }
  return undefined;
}

function block(reason: string): Output {
  return { continue: false, decision: "block", reason, stopReason: reason };
}

function context(message: string): Output {
  return {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: message,
    },
  };
}

function shellQuote(value: string): string {
  return "'" + value.replaceAll("'", "'\\''") + "'";
}

function describeContext(state: State): Output {
  if (!state.root || !state.change || !/^[k-z]{32}$/.test(state.change)) {
    throw new Error("Incomplete or invalid jj hook state");
  }
  const command = `${JJ} --repository ${shellQuote(state.root)}`;
  const revision = shellQuote(state.change);
  return context(
    "The jj lifecycle hook has prepared the first changeset for this chat. " +
      `The recorded change ID is ${state.change}. Before your final response, inspect ` +
      `${command} diff -r ${revision}. For changes you want finalized, write one short ` +
      "imperative title summarizing the actual changes, using " +
      `${command} describe -r ${revision} -m '<short title>'. ` +
      "The message must contain only that single short line. Do not add a description body, " +
      "explanation, paragraphs, bullets, or extra lines. " +
      "Always include this explicit repository and full change ID in jj diff/describe commands; " +
      "never use an implicit revision or @, since an approval may execute after the working change moves. " +
      "Do not copy the user prompt or your chat reply into the description. " +
      "For planning, read-only work, or another task you want to skip, leave the description empty. " +
      "An empty description, or a pre-existing description left unchanged, skips finalization without a reminder. " +
      "The hook runs jj new only after a description is written and while this is still the working change. " +
      "Do not run jj new yourself. Later turns and refinements must not automatically describe or create changes. " +
      "Explicit user requests to manage jj history take precedence.",
  );
}

async function handle(event: HookEvent, state: State): Promise<Output> {
  if (event.hook_event_name === "SessionStart") {
    if (!state.phase) {
      state.phase = ["startup", "fork"].includes(event.source ?? "")
        ? "pending"
        : "ignored";
    }
    return {};
  }

  if (event.hook_event_name === "UserPromptSubmit") {
    const prompt = event.prompt ?? "";
    if (prompt.trimStart().toLowerCase().startsWith("todo:")) {
      return block(
        "Saved as a todo. Send a message without the todo: prefix when ready to run.",
      );
    }
    if (event.permission_mode === "plan") {
      if (state.phase === "running") state.phase = "finished";
      return context(
        "Plan mode: skip all jj lifecycle actions, including jj describe and jj new.",
      );
    }
    if (state.phase === "finished") {
      return context(
        "The jj lifecycle for this chat is already completed or skipped. Do not automatically run jj describe " +
          "or jj new for follow-up turns or refinements. Explicit user requests to manage jj history take precedence.",
      );
    }
    if (state.phase === "running") return describeContext(state);
    // Missing markers and untracked resumed chats must not start automation
    // halfway through existing work. SessionStart is the only eligibility source.
    if (state.phase !== "pending") return {};
    const root = await jjWorkspace(event.cwd);
    if (!root) {
      state.phase = "ignored";
      return {};
    }
    let { change, empty } = await workingChange(root);
    if (!empty) {
      if (!await newIfCurrent(root, change)) {
        state.phase = "finished";
        return block(
          "jj setup skipped: the working change moved before jj new executed.",
        );
      }
      change = (await workingChange(root)).change;
    }
    Object.assign(state, {
      phase: "running",
      root,
      change,
      initialDescription: await jj(
        root,
        "--ignore-working-copy",
        "log",
        "-r",
        change,
        "--no-graph",
        "-T",
        "description",
      ),
    });
    return describeContext(state);
  }

  if (event.hook_event_name === "Stop" && state.phase === "running") {
    if (event.permission_mode === "plan") {
      state.phase = "finished";
      return {};
    }
    if (!state.root || !state.change) {
      throw new Error("Incomplete jj hook state");
    }
    const { change } = await workingChange(state.root, false);
    if (change !== state.change) {
      state.phase = "finished";
      return {
        systemMessage:
          "jj hook skipped finalization: the working change moved during this chat.",
      };
    }
    const description = await jj(
      state.root,
      "--ignore-working-copy",
      "log",
      "-r",
      state.change,
      "--no-graph",
      "-T",
      "description",
    );
    if (!description || description === state.initialDescription) {
      state.phase = "finished";
      return {};
    }
    const advanced = await newIfCurrent(state.root, state.change);
    state.phase = "finished";
    if (!advanced) {
      return {
        systemMessage:
          "jj finalization skipped: the working change moved before jj new executed.",
      };
    }
  }
  return {};
}

export async function runHook(
  event: HookEvent,
  stateDir: string,
): Promise<Output> {
  if (
    !["SessionStart", "UserPromptSubmit", "Stop"].includes(
      event.hook_event_name,
    )
  ) return {};
  if (!event.session_id) throw new Error("Hook event has no session_id");
  await Deno.mkdir(stateDir, { recursive: true, mode: 0o700 });
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(event.session_id),
  );
  const key = [...new Uint8Array(bytes)].map((b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
  const path = `${stateDir}/${key}.json`;
  // Serializes all hook processes, including different chats sharing a workspace.
  using lock = await Deno.open(`${stateDir}/lifecycle.lock`, {
    read: true,
    write: true,
    create: true,
    mode: 0o600,
  });
  await lock.lock(true);
  let state: State = {};
  try {
    state = JSON.parse(await Deno.readTextFile(path));
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
  const before = JSON.stringify(state);
  const output = await handle(event, state);
  if (JSON.stringify(state) !== before) {
    const staging = `${path}.next`;
    await Deno.writeTextFile(staging, JSON.stringify(state), { mode: 0o600 });
    using file = await Deno.open(staging, { write: true });
    await file.sync();
    await Deno.rename(staging, path);
  }
  return output;
}

if (import.meta.main) {
  let event: HookEvent | undefined;
  try {
    event = JSON.parse(await new Response(Deno.stdin.readable).text());
    const stateDir = Deno.env.get("CODEX_LIFECYCLE_STATE_DIR") ??
      `${import.meta.dirname}/state`;
    console.log(JSON.stringify(await runHook(event!, stateDir)));
  } catch (error) {
    // Exit 2 at Stop would start another agent turn, so report failures as
    // warnings. A failed prompt hook must block instead of running unprepared.
    const message = `Codex jj lifecycle hook failed: ${
      error instanceof Error ? error.message : error
    }`;
    const output = event?.hook_event_name === "UserPromptSubmit"
      ? block(message)
      : {};
    console.log(JSON.stringify({ ...output, systemMessage: message }));
  }
}
