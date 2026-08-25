/**
 * Lab 2 — verify the repo's `.claude/` configuration actually loads.
 *
 *   bun run lab2:verify
 *
 * The deliverable of Exercise 2 is configuration, not runtime code, which makes
 * it uniquely easy to get wrong and believe you got right: a skill with a typo
 * in its frontmatter simply doesn't appear, silently. This script asserts what
 * the session actually discovered.
 *
 * The `system` message with subtype `init` arrives near the start of every
 * stream and carries what was loaded: skills, the command surface, MCP server
 * status. One turn is enough to read it, so this run is cheap.
 */

import { query, resolveSettings } from "@anthropic-ai/claude-agent-sdk";
import { MODEL, requireApiKey, subprocessEnv } from "../../src/config/env.ts";
import { startRunLog } from "../../src/runtime/log.ts";

const EXPECTED_SKILLS = ["exam-drill", "domain-review", "sdk-doc", "new-lab"];
const EXPECTED_COMMANDS = ["study-plan"];
const EXPECTED_MCP_SERVERS = ["docs"];

interface Check {
  label: string;
  ok: boolean;
  detail: string;
}

const checks: Check[] = [];
const record = (label: string, ok: boolean, detail: string) =>
  checks.push({ label, ok, detail });

async function readInitMessage(): Promise<Record<string, any> | null> {
  let init: Record<string, any> | null = null;

  try {
    for await (const message of query({
      // One cheap turn. We want the init banner, not an answer.
      prompt: "Reply with the single word: ready",
      options: {
        model: MODEL,
        // Explicit, and both sources are present on purpose. Setting
        // settingSources without "user" and "project" is the most common
        // reason skills silently fail to load in an SDK session.
        settingSources: ["user", "project"],
        skills: "all",
        cwd: process.cwd(),
        env: subprocessEnv(),
        maxTurns: 1,
        maxBudgetUsd: 0.25,
      },
    })) {
      const msg = message as unknown as Record<string, any>;
      if (msg["type"] === "system" && msg["subtype"] === "init") {
        init = msg;
      }
    }
  } catch (error) {
    // A one-shot query() throws after yielding its error result. If we already
    // captured init, that is everything this script needed.
    if (!init) throw error;
    console.error(`  (query ended with an error after init: ${describe(error)})`);
  }

  return init;
}

async function main() {
  const log = startRunLog({ dir: import.meta.dir, label: "verify" });
  requireApiKey();

  console.log("Verifying .claude/ configuration…\n");
  const init = await readInitMessage();

  if (!init) {
    console.error("No system:init message arrived. The session never started.");
    // A session that never started is exactly the run worth re-reading, so
    // close explicitly rather than letting the exit handler default it.
    log.close({ status: "failed" });
    process.exit(1);
  }

  // ── Skills (Task 3.2) ────────────────────────────────────────────────────
  // Only *user-invocable* skills appear here. A skill with
  // `user-invocable: false` still loads and stays available to Claude, but is
  // absent from this array — so a miss is not automatically a failure.
  const skills: string[] = init["skills"] ?? [];
  for (const name of EXPECTED_SKILLS) {
    record(`skill /${name}`, skills.includes(name), skills.includes(name) ? "loaded" : "MISSING");
  }

  // ── Command surface (Task 3.2) ───────────────────────────────────────────
  // Mixes built-ins, bundled skills, our skills, and .claude/commands/ files.
  const commands: string[] = init["slash_commands"] ?? [];
  for (const name of EXPECTED_COMMANDS) {
    const present = commands.includes(name);
    record(`command /${name}`, present, present ? "loaded" : "MISSING");
  }
  record(
    "command file and skill do not collide",
    !EXPECTED_SKILLS.some((s) => EXPECTED_COMMANDS.includes(s)),
    "a .claude/commands/ file shadows a same-named skill; the name appears once",
  );

  // ── MCP servers (Task 2.4) ───────────────────────────────────────────────
  const servers: { name: string; status: string }[] = init["mcp_servers"] ?? [];
  for (const name of EXPECTED_MCP_SERVERS) {
    const server = servers.find((s) => s.name === name);
    record(
      `mcp server "${name}"`,
      server?.status === "connected",
      server ? `status=${server.status}` : "not configured",
    );
  }
  const github = servers.find((s) => s.name === "github");
  record(
    'mcp server "github" gated on ${GITHUB_TOKEN}',
    true,
    github
      ? `status=${github.status} — expected "failed" unless GITHUB_TOKEN is set, which is the point: the reference is committed, the token is not`
      : "not connected (GITHUB_TOKEN unset)",
  );

  // ── Effective settings (alpha API — tolerate its absence) ────────────────
  try {
    const resolved = (await resolveSettings({
      cwd: process.cwd(),
      settingSources: ["user", "project"],
    })) as unknown as Record<string, any>;

    const permissions = resolved?.["permissions"] ?? {};
    const deny: string[] = permissions["deny"] ?? [];
    record(
      "deny rules cover .env",
      deny.some((r) => r.includes(".env")),
      `${deny.length} deny rules resolved`,
    );
    record(
      "ask rules exist",
      (permissions["ask"] ?? []).length > 0,
      `${(permissions["ask"] ?? []).length} ask rules resolved`,
    );
  } catch (error) {
    record("resolveSettings()", false, `unavailable in this SDK build: ${describe(error)}`);
  }

  // ── Report ───────────────────────────────────────────────────────────────
  console.log();
  let failed = 0;
  for (const check of checks) {
    if (!check.ok) failed++;
    console.log(`  ${check.ok ? "✓" : "✗"} ${check.label.padEnd(46)} ${check.detail}`);
  }

  console.log(`\n  skills discovered:  ${skills.join(", ") || "(none)"}`);
  console.log(`  commands available: ${commands.length} (${commands.slice(0, 12).join(", ")}…)`);
  console.log(`  mcp servers:        ${servers.map((s) => `${s.name}=${s.status}`).join(", ") || "(none)"}`);

  console.log(
    failed === 0
      ? "\nAll configuration checks passed."
      : `\n${failed} check(s) failed. See labs/02-claude-code-config/README.md § Troubleshooting.`,
  );

  // Path-scoped rules cannot be verified from init — they load lazily, when
  // Claude reads a matching file. README.md describes the manual check.
  console.log(
    "\nNot covered here: path-scoped rules in .claude/rules/ load on demand when\n" +
      "Claude reads a matching file, so they never appear in system:init. Verify\n" +
      "them by hand — see the README.",
  );

  // Before process.exit — it does not flush anything still pending.
  log.record({ checks, failed, skills, commands, mcpServers: servers });
  log.close({ status: failed === 0 ? "ok" : "failed" });

  process.exit(failed === 0 ? 0 : 1);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Only run when executed directly. Tests import named helpers from this
// module, and a bare top-level `await main()` would fire the whole lab.
if (import.meta.main) await main();
