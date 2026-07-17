import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

const ROOT = join(__dirname, "..");
const WORKFLOWS = join(ROOT, ".github", "workflows");

function workflow(name: string): string {
  return readFileSync(join(WORKFLOWS, name), "utf8");
}

function jobBlock(source: string, jobName: string): string {
  const lines = source.split("\n");
  const start = lines.findIndex((line) => line === `  ${jobName}:`);
  expect(start, `${jobName} job が存在すること`).toBeGreaterThanOrEqual(0);
  const end = lines.findIndex(
    (line, index) =>
      index > start && /^ {2}[A-Za-z0-9_-]+:\s*$/.test(line),
  );
  return lines.slice(start, end < 0 ? undefined : end).join("\n");
}

describe("公開ワークフローの退行防止", () => {
  it("CI は本番ビルド後に公開前監査を実行する", () => {
    const source = workflow("ci.yml");
    const build = source.indexOf("run: npm run build");
    const staticAudit = source.indexOf("run: npm run audit:static-links");
    const audit = source.indexOf("run: npm run audit:prepublish");
    expect(build).toBeGreaterThanOrEqual(0);
    expect(staticAudit).toBeGreaterThan(build);
    expect(audit).toBeGreaterThan(staticAudit);
  });

  it("CodeQLのJavaScript解析も静的一覧を生成してリンク監査する", () => {
    const source = workflow("codeql.yml");
    const install = source.indexOf("run: npm ci --ignore-scripts");
    const build = source.indexOf("run: npm run build");
    const staticAudit = source.indexOf("run: npm run audit:static-links");
    expect(install).toBeGreaterThanOrEqual(0);
    expect(build).toBeGreaterThan(install);
    expect(staticAudit).toBeGreaterThan(build);
    expect(source).toContain("if: matrix.language == 'javascript-typescript'");
  });

  it("Pages は全ゲートを順番に通過してからartifactをアップロードする", () => {
    const source = workflow("deploy-pages.yml");
    const commands = [
      "run: npm ci --ignore-scripts",
      "run: npm run lint",
      "run: npm run typecheck",
      "run: npm test",
      "run: npm run build",
      "run: npm run audit:static-links",
      "run: npm audit --audit-level=high",
      "run: npm run audit:prepublish",
    ];
    const positions = commands.map((command) => source.indexOf(command));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));

    const upload = source.search(
      /uses:\s*actions\/upload-pages-artifact@[0-9a-f]{40}/,
    );
    expect(upload).toBeGreaterThan(positions.at(-1) ?? -1);
  });

  it("Pages書き込み権限はdeploy jobだけにある", () => {
    const files = readdirSync(WORKFLOWS).filter((name) =>
      /\.ya?ml$/.test(name),
    );
    const occurrences: string[] = [];
    for (const name of files) {
      const lines = workflow(name).split("\n");
      lines.forEach((line, index) => {
        if (/^\s*pages:\s*write\s*$/.test(line)) {
          occurrences.push(`${name}:${index + 1}`);
        }
      });
    }
    expect(occurrences).toHaveLength(1);
    expect(jobBlock(workflow("deploy-pages.yml"), "deploy")).toMatch(
      /^\s*pages:\s*write\s*$/m,
    );
    expect(jobBlock(workflow("deploy-pages.yml"), "build")).not.toMatch(
      /^\s*pages:\s*write\s*$/m,
    );
  });

  it("すべてのGitHub Actions参照を40桁コミットSHAへ固定する", () => {
    const files = readdirSync(WORKFLOWS).filter((name) =>
      /\.ya?ml$/.test(name),
    );
    const references: string[] = [];
    for (const name of files) {
      workflow(name)
        .split("\n")
        .forEach((line, index) => {
          const match = line.match(/uses:\s*([^\s#]+)/);
          if (!match?.[1]) return;
          const ref = match[1];
          references.push(ref);
          expect(
            ref,
            `${basename(name)}:${index + 1} の参照をSHA固定すること`,
          ).toMatch(/@[0-9a-f]{40}$/);
        });
    }
    expect(references.length).toBeGreaterThan(0);
  });
});
