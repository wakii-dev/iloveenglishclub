#!/usr/bin/env node
/**
 * SF-8 security scan (plan T4 Step 3) — phần TỰ ĐỘNG của checkpoint:
 *   1. env không rò trong git  2. secret hardcode scan  3. .env.example hygiene
 *   4. exec-bit scan           5. npm audit vs allowlist accepted-risk
 *   6. inventory "use server" (anchor cho role-check code-read trong report)
 *
 * Allowlist accepted-risk (plan-critic P1: script phải TƯỜNG MINH — không
 * allowlist thì 6 vulns đã biết khiến script không bao giờ exit 0):
 *   - postcss trong next bundle (1117015, 1124252, 1130709, 1139510):
 *     build-time tooling — app không nhận CSS không tin cậy lúc runtime
 *     (React escape + không user-CSS); fix = Next 16 breaking → SF riêng.
 *   - esbuild dev-server (1102341, qua drizzle-kit @esbuild-kit): chỉ dev
 *     dependency tooling, không vào bundle prod.
 * Exit non-0 CHỈ khi finding NGOÀI allowlist.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";

const findings = [];
const note = (msg) => console.log(`  · ${msg}`);

function check(name, fn) {
  process.stdout.write(`[${name}] `);
  try {
    fn();
    console.log("PASS");
    return true;
  } catch (err) {
    console.log(`FAIL — ${String(err.message || err).split("\n")[0]}`);
    findings.push(name);
    return false;
  }
}

const sh = (cmd, args) =>
  execFileSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 120_000, // npm audit gọi network — treo không được giữ scan
  });
// npm audit exit≠0 khi CÓ vulns (chuẩn npm) — đọc stdout dù rc≠0
const shSoft = (cmd, args) => {
  try {
    return sh(cmd, args);
  } catch (err) {
    if (err.stdout) return err.stdout;
    throw err;
  }
};

// ---- 1. env files không trong git (trừ .env.example) ----
check("env-not-in-git", () => {
  const tracked = sh("git", ["ls-files"])
    .split("\n")
    .filter((f) => /^\.env/.test(f));
  const bad = tracked.filter((f) => f !== ".env.example");
  if (bad.length) throw new Error(`env tracked: ${bad.join(", ")}`);
  if (!tracked.includes(".env.example")) throw new Error(".env.example không tracked?");
  // .env.local phải bị ignore
  sh("git", ["check-ignore", ".env.local"]); // rc≠0 → throw
});

// ---- 2. secret hardcode trong code tracked ----
check("no-hardcoded-secrets", () => {
  const files = sh("git", ["ls-files"]).split("\n").filter((f) =>
    /\.(ts|tsx|mjs|js)$/.test(f) && f !== ".env.example",
  );
  const pattern =
    /(AUTH_SECRET|CLIENT_SECRET|READ_WRITE_TOKEN|ADMIN_PASSWORD|PRIVATE_KEY)\s*[:=]\s*["'][^"'$\s{]{8,}["']/;
  const hits = [];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    // bỏ dòng chỉ tham chiếu process.env / import.meta.env
    for (const [i, line] of src.split("\n").entries()) {
      if (pattern.test(line) && !/process\.env|import\.meta\.env/.test(line)) {
        hits.push(`${f}:${i + 1}`);
      }
    }
  }
  if (hits.length) throw new Error(`secret literal: ${hits.join(", ")}`);
});

// ---- 3. .env.example hygiene — secret keys phải RỖNG ----
check("env-example-no-real-values", () => {
  const lines = readFileSync(".env.example", "utf8").split("\n");
  const secretKeys = /^(AUTH_SECRET|GOOGLE_CLIENT_SECRET|BLOB_READ_WRITE_TOKEN|ADMIN_PASSWORD)=/;
  for (const [i, line] of lines.entries()) {
    if (secretKeys.test(line) && line.split("=")[1]?.trim().length > 0) {
      throw new Error(`.env.example:${i + 1} secret key có giá trị`);
    }
  }
});

// ---- 4. exec-bit scan (ngoài node_modules/.git/.next) ----
check("exec-bits", () => {
  const SKIP = new Set(["node_modules", ".git", ".next"]);
  const hits = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (SKIP.has(name)) continue;
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (st.mode & 0o111) hits.push(p);
    }
  };
  walk(".");
  // Whitelist hợp lệ: không có — repo này không cần file exec (node/playwright tự wrapper)
  if (hits.length) throw new Error(`exec-bit: ${hits.join(", ")}`);
});

// ---- 5. npm audit vs allowlist ----
check("npm-audit-vs-allowlist", () => {
  const ALLOW = new Set([
    1117015, // PostCSS XSS via unescaped </style> — build-time, trong next bundle
    1124252, // PostCSS sourceMappingURL file-read — build-time
    1130709, // PostCSS incomplete fix — build-time
    1139510, // PostCSS source map path traversal — build-time
    1102341, // esbuild dev-server request forgery — dev tooling (drizzle-kit)
  ]);
  const audit = JSON.parse(shSoft("npm", ["audit", "--json"])); // timeout ở sh()
  const outside = [];
  for (const [pkg, v] of Object.entries(audit.vulnerabilities ?? {})) {
    for (const via of v.via ?? []) {
      if (typeof via === "object" && !ALLOW.has(via.source)) {
        outside.push(`${pkg}: ${via.source} ${via.title?.slice(0, 60)} (${via.severity})`);
      }
    }
  }
  const total = audit.metadata?.vulnerabilities?.total ?? 0;
  note(`npm audit tổng ${total} vulns — allowlist ${ALLOW.size} advisory accepted-risk (postcss-trong-next + esbuild dev)`);
  if (outside.length) throw new Error(`ngoài allowlist: ${outside.join(" | ")}`);
});

// ---- 6. inventory Server Actions (thông tin — verdict code-read ở report) ----
console.log("[use-server-inventory] (thông tin)");
const actions = sh("grep", ["-rl", "--include=*.ts", "--", '"use server"', "src"]);
for (const f of actions.trim().split("\n")) {
  const exports = sh("grep", ["-E", "^export (async )?function", f])
    .split("\n")
    .filter(Boolean)
    .map((l) => l.replace(/^export (async )?function (\w+).*/, "$2"));
  note(`${f}: ${exports.join(", ")}`);
}

console.log(
  findings.length
    ? `\nSCAN: FAIL (${findings.join(", ")})`
    : "\nSCAN: PASS — mọi check PASS hoặc accepted-risk đã allowlist tường minh",
);
process.exit(findings.length ? 1 : 0);
