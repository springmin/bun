#!/usr/bin/env bun
// Prepare and open the focused OHOS upstream PR series.
//
//   bun scripts/ohos/upstream-prs.ts status
//   bun scripts/ohos/upstream-prs.ts check P1
//   bun scripts/ohos/upstream-prs.ts prepare P1 [--push]
//   bun scripts/ohos/upstream-prs.ts open P1 [--draft] [--force]
//
// `prepare` creates a worktree under $TMPDIR/ohos-upstream-prs/<id> from
// oven/main and applies the stored patch. `open` pushes the branch and runs
// `gh pr create`; it refuses while a dependency has no merged PR unless
// --force is given. Nothing is opened automatically.
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "../..");
const manifest: any = await Bun.file(join(ROOT, "docs/ohos-upstream-prs.json")).json();
const prs: any[] = manifest.prs;
const args = Bun.argv.slice(2);
const command = args[0];
const id = args[1];
const flags = new Set(args.slice(2).filter((arg: string) => arg.startsWith("--")));
const pr = prs.find((candidate: any) => candidate.id === id);
const baseRef = process.env.BUN_OHOS_UPSTREAM_REF ?? manifest.upstream.baseRef;

function run(cmd: string[], cwd = ROOT, allowFailure = false) {
  const child = Bun.spawnSync({ cmd, cwd, stdout: "pipe", stderr: "pipe" });
  const result = {
    code: child.exitCode ?? 1,
    out: child.stdout.toString(),
    err: child.stderr.toString(),
  };
  if (!allowFailure && result.code !== 0) {
    console.error(`$ ${cmd.join(" ")}\n${result.out}${result.err}`);
    process.exit(result.code || 1);
  }
  return result;
}

function pathOf(path: string | null) {
  return path ? (path.startsWith("/") ? path : join(ROOT, path)) : null;
}

function workDirOf(candidate: any) {
  return join(process.env.TMPDIR ?? "/tmp", "ohos-upstream-prs", candidate.id);
}

function requirePR() {
  if (!pr) {
    console.error(`unknown PR ${id ?? ""}; run \`status\``);
    process.exit(2);
  }
  return pr;
}

function requirePatch(candidate: any) {
  if (!candidate.patch) {
    console.error(`${candidate.id} has no patch yet (status: ${candidate.status})`);
    process.exit(2);
  }
  const patch = pathOf(candidate.patch);
  if (!patch || !existsSync(patch)) {
    console.error(`${candidate.id}: patch not found: ${candidate.patch}`);
    process.exit(2);
  }
  return patch;
}

function status() {
  console.log(`${manifest.upstream.repo}  RFC #${manifest.upstream.rfc}  base ${baseRef}\n`);
  for (const candidate of prs) {
    const patch = candidate.patch ? (existsSync(pathOf(candidate.patch)!) ? "patch" : "MISSING") : "-";
    const body = candidate.body ? (existsSync(pathOf(candidate.body)!) ? "body" : "MISSING") : "-";
    const deps = candidate.dependsOn.length ? candidate.dependsOn.join(",") : "-";
    const pr = candidate.pr ? `#${candidate.pr}` : "-";
    console.log(
      `${candidate.id.padEnd(4)} ${candidate.status.padEnd(18)} ${String(candidate.title).padEnd(68)} deps:${deps.padEnd(18)} ${patch} ${body} ${pr}`,
    );
  }
}

function check(candidate: any) {
  const patch = requirePatch(candidate);
  const dir = join(process.env.TMPDIR ?? "/tmp", `ohos-pr-check-${candidate.id}-${Date.now()}`);
  run(["git", "worktree", "add", "--detach", dir, baseRef]);
  const applied = run(["git", "apply", "--check", "--3way", patch], dir, true);
  run(["git", "worktree", "remove", "--force", dir], ROOT, true);
  if (applied.code !== 0) {
    console.error(`${candidate.id}: does not apply\n${applied.err}`);
    process.exit(1);
  }
  console.log(`${candidate.id}: applies on ${baseRef}`);
}

function prepare(candidate: any, push: boolean) {
  const patch = requirePatch(candidate);
  const dir = workDirOf(candidate);
  if (existsSync(dir)) {
    console.error(`${candidate.id}: ${dir} already exists; remove it or use a fresh TMPDIR`);
    process.exit(1);
  }
  if (run(["git", "rev-parse", "--verify", `refs/heads/${candidate.branch}`], ROOT, true).code === 0) {
    console.error(`${candidate.id}: branch ${candidate.branch} already exists`);
    process.exit(1);
  }
  run(["git", "worktree", "add", "-b", candidate.branch, dir, baseRef]);
  const applied = run(["git", "apply", "--3way", patch], dir, true);
  if (applied.code !== 0) {
    run(["git", "worktree", "remove", "--force", dir], ROOT, true);
    console.error(`${candidate.id}: patch does not apply\n${applied.err}`);
    process.exit(1);
  }
  run(["git", "add", "-A"], dir);
  run(
    [
      "git",
      "commit",
      "-m",
      candidate.title,
      "-m",
      `Prepared from docs/ohos-upstream-prs.json; PR body: ${candidate.body ?? "(not written yet)"}.`,
    ],
    dir,
  );
  if (push) run(["git", "push", "-u", "origin", candidate.branch], dir);
  console.log(`${candidate.id}: prepared at ${dir}${push ? " and pushed" : ""}`);
  if (!candidate.body) console.log(`${candidate.id}: no PR body yet; write docs/ohos-pr-drafts/${candidate.id}.md before open`);
}

function dependencyIsOpen(dependency: any) {
  // The RFC is a decision, not a merged PR: P1 needs an explicit --force
  // (after a maintainer has answered) rather than passing this check.
  if (!dependency || dependency === "RFC") return true;
  const dep = prs.find((candidate: any) => candidate.id === dependency);
  if (!dep?.pr) return true;
  const response = run(
    ["gh", "pr", "view", String(dep.pr), "-R", manifest.upstream.repo, "--json", "state,mergedAt"],
    ROOT,
    true,
  );
  if (response.code !== 0) return true;
  try {
    const json = JSON.parse(response.out);
    return json.state !== "MERGED";
  } catch {
    return true;
  }
}

function open(candidate: any) {
  if (candidate.status === "submitted") {
    console.log(`${candidate.id}: already submitted${candidate.pr ? ` as #${candidate.pr}` : ""}`);
    return;
  }
  if (candidate.status === "prepared-webkit") {
    console.log(`${candidate.id}: submit the WebKit patch in oven-sh/WebKit, not from Bun`);
    return;
  }
  if (!["prepared", "prepared-no-test"].includes(candidate.status)) {
    console.error(`${candidate.id}: status is ${candidate.status}; finish/split it first`);
    process.exit(2);
  }
  if (candidate.status === "prepared-no-test" && !flags.has("--force")) {
    console.error(`${candidate.id}: no focused test yet; add one, or use --force only after maintainers agree`);
    process.exit(2);
  }
  const dir = workDirOf(candidate);
  if (!existsSync(dir)) {
    console.error(`${candidate.id}: run \`prepare ${candidate.id}\` first`);
    process.exit(2);
  }
  const body = candidate.body ? pathOf(candidate.body) : null;
  if (!body || !existsSync(body)) {
    console.error(`${candidate.id}: write ${candidate.body ?? `docs/ohos-pr-drafts/${candidate.id}.md`} first`);
    process.exit(2);
  }
  if (!flags.has("--force")) {
    const blocked = candidate.dependsOn.filter((dependency: string) => dependencyIsOpen(dependency));
    if (blocked.length) {
      console.error(`${candidate.id}: dependencies not merged: ${blocked.join(", ")} (use --force to override)`);
      process.exit(2);
    }
  }
  run(["git", "push", "-u", "origin", candidate.branch], dir);
  const cmd = [
    "gh",
    "pr",
    "create",
    "-R",
    manifest.upstream.repo,
    "--head",
    `${manifest.upstream.fork}:${candidate.branch}`,
    "--base",
    manifest.upstream.base,
    "--title",
    candidate.title,
    "--body-file",
    body,
  ];
  if (flags.has("--draft")) cmd.push("--draft");
  const created = run(cmd, ROOT, true);
  if (created.code !== 0) {
    console.error(created.err);
    process.exit(created.code);
  }
  console.log(created.out.trim());
}

switch (command) {
  case "status":
    status();
    break;
  case "check":
    check(requirePR());
    break;
  case "prepare":
    prepare(requirePR(), flags.has("--push"));
    break;
  case "open":
    open(requirePR());
    break;
  case "series": {
    const ordered: string[] = [];
    const visit = (candidate: any, seen: Set<string>) => {
      if (seen.has(candidate.id)) return;
      seen.add(candidate.id);
      for (const dependency of candidate.dependsOn) {
        const dep = prs.find((item: any) => item.id === dependency);
        if (dep) visit(dep, seen);
      }
      ordered.push(`${candidate.id.padEnd(4)} ${candidate.title}`);
    };
    const seen = new Set<string>();
    for (const candidate of prs) visit(candidate, seen);
    console.log(ordered.join("\n"));
    break;
  }
  default:
    console.error("usage: bun scripts/ohos/upstream-prs.ts status|check|prepare|open|series <id> [--push] [--draft] [--force]");
    process.exit(2);
}
