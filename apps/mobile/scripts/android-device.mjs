import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const packageName = "app.sharebook.dogfood";
const mainActivity = `${packageName}/.MainActivity`;

function listDeviceSerials() {
  const output = execFileSync("adb", ["devices"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
  return output
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter(([, state]) => state === "device")
    .map(([serial]) => serial);
}

function getTargetSerial() {
  const configured = process.env.SHAREBOOK_ANDROID_SERIAL || process.env.ANDROID_SERIAL;
  if (configured) return configured;
  const serials = listDeviceSerials();
  if (serials.length <= 1) return serials[0] ?? "";
  return serials.find((serial) => /^\d+\.\d+\.\d+\.\d+:\d+$/.test(serial)) ?? serials[0];
}

function runAdb(args, options = {}) {
  const { targetDevice = true, ...execOptions } = options;
  const adbArgs = targetDevice && args[0] !== "devices" ? ["-s", getTargetSerial(), ...args] : args;
  return execFileSync("adb", adbArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...execOptions
  }).trim();
}

function printHelp() {
  console.log(`Usage: npm run device -- <command>

Commands:
  status                 Show connected devices and basic phone info
  pair <host:port> <code>
                         Pair with Android Wireless debugging
  connect <host:port>    Connect to a paired Android device over Wi-Fi
  disconnect [host:port] Disconnect from a Wi-Fi Android device
  launch                 Launch the native Sharebook app
  install [apk]          Install the native APK, defaults to the debug build
  reverse                Route phone localhost:8081 to this Mac for Metro
  screenshot [path]      Save a phone screenshot, defaults to /private/tmp/sharebook-phone.png
  logs                   Print current Sharebook app logs
  logs:clear             Clear Android logs before a test
  share-text <text>      Send an Android ACTION_SEND text intent to Sharebook
  share-url <url>        Send an Android ACTION_SEND URL intent to Sharebook
`);
}

function requireValue(name, value) {
  if (value) return value;
  console.error(`Missing ${name}.`);
  process.exit(1);
}

function getPid() {
  try {
    return runAdb(["shell", "pidof", packageName]);
  } catch {
    return "";
  }
}

const [command, ...rest] = process.argv.slice(2);

try {
  switch (command) {
    case "status": {
      const devices = runAdb(["devices"]);
      console.log(devices);
      const connected = devices
        .split("\n")
        .slice(1)
        .some((line) => /\tdevice$/.test(line));
      if (!connected) {
        console.log("No authorized Android device is connected.");
        break;
      }
      const model = runAdb(["shell", "getprop", "ro.product.model"]);
      const android = runAdb(["shell", "getprop", "ro.build.version.release"]);
      console.log(`Phone: ${model || "unknown"} (Android ${android || "unknown"})`);
      break;
    }

    case "pair": {
      const address = requireValue("host:port", rest[0]);
      const code = requireValue("pairing code", rest[1]);
      console.log(runAdb(["pair", address, code], { targetDevice: false }));
      break;
    }

    case "connect": {
      const address = requireValue("host:port", rest[0]);
      console.log(runAdb(["connect", address], { targetDevice: false }));
      break;
    }

    case "disconnect": {
      console.log(runAdb(["disconnect", ...rest], { targetDevice: false }));
      break;
    }

    case "launch": {
      console.log(runAdb(["shell", "am", "start", "-n", mainActivity]));
      break;
    }

    case "install": {
      const apkPath = resolve(
        rest[0] ?? "android/app/build/outputs/apk/debug/app-debug.apk"
      );
      console.log(runAdb(["install", "-r", apkPath], { maxBuffer: 20 * 1024 * 1024 }));
      break;
    }

    case "reverse": {
      runAdb(["reverse", "tcp:8081", "tcp:8081"]);
      console.log("Reversed tcp:8081 to the Mac for Metro.");
      break;
    }

    case "screenshot": {
      const outPath = resolve(rest[0] ?? "/private/tmp/sharebook-phone.png");
      const result = spawnSync("adb", ["-s", getTargetSerial(), "exec-out", "screencap", "-p"], {
        encoding: null,
        maxBuffer: 20 * 1024 * 1024
      });
      if (result.status !== 0) {
        throw new Error(result.stderr?.toString() || "Could not capture screenshot.");
      }
      writeFileSync(outPath, result.stdout);
      console.log(outPath);
      break;
    }

    case "logs": {
      const pid = getPid();
      if (!pid) {
        console.error("Sharebook is not running. Run `npm run device -- launch` first.");
        process.exit(1);
      }
      console.log(runAdb(["logcat", "-d", "--pid", pid], { maxBuffer: 20 * 1024 * 1024 }));
      break;
    }

    case "logs:clear": {
      runAdb(["logcat", "-c"]);
      console.log("Cleared Android logs.");
      break;
    }

    case "share-text":
    case "share-url": {
      const value = requireValue(command === "share-url" ? "url" : "text", rest.join(" "));
      console.log(
        runAdb([
          "shell",
          "am",
          "start",
          "-a",
          "android.intent.action.SEND",
          "-t",
          "text/plain",
          "--es",
          "android.intent.extra.TEXT",
          value,
          "-n",
          mainActivity
        ])
      );
      break;
    }

    default:
      printHelp();
      process.exit(command ? 1 : 0);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
