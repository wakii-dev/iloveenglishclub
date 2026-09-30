/**
 * Audio mirror Vercel Blob → Git (backup + serve tĩnh từ build).
 * List store prefix `audio/` → so với public/audio (size) → tải file
 * thiếu/đổi → git commit + push. Chạy tay (`npm run audio:sync`) hoặc
 * GitHub Actions cron (.github/workflows/audio-sync.yml) — CÙNG script này.
 *
 * DRY-RUN mặc định: chỉ LIỆT KÊ sẽ tải gì. Thực chạy: `--apply`.
 * File local thừa (không có trên store) giữ nguyên — fixtures repo không bị
 * xoá. Playback KHÔNG đổi: seeded rows (path tương đối) → static, uploaded
 * rows (URL CDN) → Blob.
 *
 * Chạy: node scripts/audio-sync.ts [--apply]  (BLOB_READ_WRITE_TOKEN từ
 * .env.local — `vercel env pull --environment development`; CI: secret)
 */
import { execFileSync } from "node:child_process";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { list } from "@vercel/blob";
import dotenv from "dotenv";
import { AUDIO_PREFIX, planSync } from "../src/lib/admin/audio-sync.ts";

dotenv.config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");
const PUBLIC_DIR = path.resolve("public");
const AUDIO_DIR = path.join(PUBLIC_DIR, AUDIO_PREFIX);

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error(
    "BLOB_READ_WRITE_TOKEN thiếu — chạy `vercel env pull --environment development` rồi thử lại",
  );
  process.exit(2);
}

/** Đệ quy public/audio → { "audio/b/u/l/01.mp3": size } (path-style Blob). */
async function localSizes(): Promise<Record<string, number>> {
  const sizes: Record<string, number> = {};
  let entries: string[];
  try {
    entries = await readdir(AUDIO_DIR, { recursive: true });
  } catch {
    return sizes; // thư mục chưa tồn tại → local rỗng
  }
  for (const rel of entries) {
    const st = await stat(path.join(AUDIO_DIR, rel)).catch(() => null);
    if (!st?.isFile()) continue;
    sizes[`${AUDIO_PREFIX}${rel.split(path.sep).join("/")}`] = st.size;
  }
  return sizes;
}

/** List toàn bộ store (paginated qua cursor) — chỉ trả entry prefix audio/. */
async function listAudio() {
  const all: Array<{ pathname: string; size: number; url: string }> = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: AUDIO_PREFIX, cursor });
    all.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return all;
}

async function main() {
  const listed = await listAudio();
  const urlByPath = new Map(listed.map((e) => [e.pathname, e.url]));
  const plan = planSync(listed, await localSizes());

  if (plan.toDownload.length === 0) {
    console.log(
      `Không có gì mới — ${plan.unchanged} file đã khớp (store: ${listed.length} entry).`,
    );
    return;
  }

  console.log(
    `${APPLY ? "TẢI" : "SẼ TẢI"} ${plan.toDownload.length} file (unchanged: ${plan.unchanged}):`,
  );
  for (const f of plan.toDownload) console.log(`  ${f.pathname} (${f.size}B)`);
  if (!APPLY) {
    console.log("\nDry-run — chạy lại với --apply để tải + commit + push.");
    return;
  }

  let committed = 0;
  for (const f of plan.toDownload) {
    const dest = path.join(PUBLIC_DIR, f.pathname);
    await mkdir(dest.slice(0, dest.lastIndexOf(path.sep)), { recursive: true });
    const res = await fetch(urlByPath.get(f.pathname)!); // access=public → GET
    if (!res.ok) {
      throw new Error(`Tải ${f.pathname} thất bại: HTTP ${res.status}`);
    }
    await writeFile(dest, Buffer.from(await res.arrayBuffer()));
    committed += 1;
  }
  console.log(`Đã tải ${committed} file vào public/${AUDIO_PREFIX}`);

  execFileSync("git", ["add", path.join("public", AUDIO_PREFIX)]);
  const staged = execFileSync("git", ["diff", "--cached", "--name-only"], {
    encoding: "utf8",
  }).trim();
  if (!staged) {
    console.log("Không có thay đổi sau khi tải — bỏ commit.");
    return;
  }
  execFileSync(
    "git",
    [
      "commit",
      "-m",
      `chore(audio): mirror ${committed} file từ Vercel Blob (audio-sync)`,
    ],
    { stdio: "pipe" },
  );
  execFileSync("git", ["push"], { stdio: "pipe" });
  console.log(`Commit + push xong:\n${staged.split("\n").map((l) => `  ${l}`).join("\n")}`);
}

main().catch((error) => {
  console.error("[audio-sync] lỗi:", error);
  process.exit(1);
});
