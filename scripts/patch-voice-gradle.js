const fs = require("fs");
const path = require("path");

const gradlePath = path.join(
  __dirname,
  "..",
  "node_modules",
  "@react-native-voice",
  "voice",
  "android",
  "build.gradle"
);

if (!fs.existsSync(gradlePath)) {
  console.log("[patch-voice-gradle] Skipped: @react-native-voice/voice not installed.");
  process.exit(0);
}

const original = fs.readFileSync(gradlePath, "utf8");

let patched = original;
patched = patched.replace(
  /def DEFAULT_SUPPORT_LIB_VERSION = "28\.0\.0"/g,
  'def DEFAULT_SUPPORT_LIB_VERSION = "1.7.0"'
);
patched = patched.replace(
  /def supportVersion = rootProject\.hasProperty\('supportLibVersion'\) \? rootProject\.supportLibVersion : DEFAULT_SUPPORT_LIB_VERSION/g,
  "def supportVersion = DEFAULT_SUPPORT_LIB_VERSION"
);
patched = patched.replace(
  /implementation "com\.android\.support:appcompat-v7:\$\{supportVersion\}"/g,
  'implementation "androidx.appcompat:appcompat:${supportVersion}"'
);

if (patched === original) {
  console.log("[patch-voice-gradle] No changes needed.");
  process.exit(0);
}

fs.writeFileSync(gradlePath, patched, "utf8");
console.log("[patch-voice-gradle] Applied AndroidX compatibility patch.");
