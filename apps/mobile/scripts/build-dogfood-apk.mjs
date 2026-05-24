import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] == null) process.env[key] = value;
  }
}

loadEnvFile(resolve(".env"));
loadEnvFile(resolve(".env.local"));

const requiredEnv = [
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY",
  "EXPO_PUBLIC_SHAREBOOK_API_URL"
];

const missing = requiredEnv.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

const apiUrl = process.env.EXPO_PUBLIC_SHAREBOOK_API_URL ?? "";
if (/localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\./.test(apiUrl)) {
  console.error(
    "EXPO_PUBLIC_SHAREBOOK_API_URL must be a reachable HTTPS URL for dogfood builds."
  );
  console.error(`Current value: ${apiUrl}`);
  process.exit(1);
}

const androidDir = resolve("android");
const gradle = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
const result = spawnSync(gradle, ["assembleRelease"], {
  cwd: androidDir,
  env: process.env,
  stdio: "inherit"
});

if (result.status !== 0) process.exit(result.status ?? 1);

const apkPath = resolve(androidDir, "app/build/outputs/apk/release/app-release.apk");
if (!existsSync(apkPath)) {
  console.error("Release build finished, but the APK was not found at the expected path.");
  process.exit(1);
}

console.log(`Dogfood APK ready: ${apkPath}`);
