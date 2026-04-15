import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const promptsFile = path.join(process.cwd(), ".codex", "operator", "evals", "prompts.json");
const outputDir = path.join(process.cwd(), ".workflow", "reports", "codex-evals");
mkdirSync(outputDir, { recursive: true });

const prompts = existsSync(promptsFile)
  ? JSON.parse(readFileSync(promptsFile, "utf8"))
  : [
      { id: "review", prompt: "Review the current repository and name the top 3 risks." },
      { id: "release", prompt: "List the remaining release blockers and missing migration notes." },
    ];

const results = prompts.map((entry) => {
  const run = spawnSync("codex", ["exec", "--json", "--full-auto", entry.prompt], {
    cwd: process.cwd(),
    env: { ...process.env, CODEX_HOME: path.join(process.cwd(), ".codex") },
    encoding: "utf8",
  });
  const file = path.join(outputDir, `${entry.id}.jsonl`);
  writeFileSync(file, run.stdout || "");
  return { id: entry.id, status: run.status === 0 ? "pass" : "warn", file };
});

writeFileSync(path.join(outputDir, "summary.json"), JSON.stringify({ results }, null, 2));
console.log(JSON.stringify({ results }, null, 2));
