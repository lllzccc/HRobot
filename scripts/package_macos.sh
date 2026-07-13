#!/bin/bash
set -euo pipefail

VERSION="${1:?Usage: package_macos.sh VERSION ARCH [OUTPUT_DIR]}"
ARCH="${2:?Usage: package_macos.sh VERSION ARCH [OUTPUT_DIR]}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT_DIR="${3:-$ROOT/release-dist}"
BUILD_ROOT="${RUNNER_TEMP:-/tmp}/hrobot-macos-${VERSION}-${ARCH}-$$"
RESOURCE_ROOT="$BUILD_ROOT/resources"
DIST_ROOT="$BUILD_ROOT/dist"
WORK_ROOT="$BUILD_ROOT/work"
DMG_ROOT="$BUILD_ROOT/dmg"
APP_PATH="$DIST_ROOT/Hrobot.app"
DMG_NAME="hrobot-mac-${ARCH}-${VERSION}.dmg"
APP_PID=""

cleanup() {
  if [[ -n "$APP_PID" ]]; then
    /bin/kill "$APP_PID" >/dev/null 2>&1 || true
  fi
  rm -rf "$BUILD_ROOT"
}
trap cleanup EXIT

mkdir -p "$RESOURCE_ROOT/assets/brand" "$RESOURCE_ROOT/assets/avatars" "$OUTPUT_DIR"
cp "$ROOT/index.html" "$RESOURCE_ROOT/index.html"
printf '{\n  "name": "Hrobot",\n  "version": "%s"\n}\n' "$VERSION" > "$RESOURCE_ROOT/app_version.json"
cp -R "$ROOT/static" "$RESOURCE_ROOT/static"
cp -R "$ROOT/scripts" "$RESOURCE_ROOT/scripts"
cp -R "$ROOT/assets/fonts" "$RESOURCE_ROOT/assets/fonts"
find "$ROOT/assets/avatars" -maxdepth 1 -type f -exec cp {} "$RESOURCE_ROOT/assets/avatars/" \;
for name in hrobot-buddy-avatar.svg hrobot-logo-dark.png hrobot-report-watermark.png; do
  cp "$ROOT/assets/brand/$name" "$RESOURCE_ROOT/assets/brand/$name"
done

python3 -m pip install -r "$ROOT/requirements.txt" pyinstaller
python3 -m PyInstaller \
  --noconfirm \
  --clean \
  --windowed \
  --name Hrobot \
  --osx-bundle-identifier com.hrobot.desktop \
  --distpath "$DIST_ROOT" \
  --workpath "$WORK_ROOT" \
  --specpath "$WORK_ROOT" \
  --add-data "$RESOURCE_ROOT/index.html:." \
  --add-data "$RESOURCE_ROOT/app_version.json:." \
  --add-data "$RESOURCE_ROOT/static:static" \
  --add-data "$RESOURCE_ROOT/assets:assets" \
  --add-data "$RESOURCE_ROOT/scripts:scripts" \
  "$ROOT/server.py"

test -d "$APP_PATH"
/usr/bin/codesign --force --deep --sign - "$APP_PATH"
/usr/bin/codesign --verify --deep --strict "$APP_PATH"

"$APP_PATH/Contents/MacOS/Hrobot" --host 127.0.0.1 --port 8767 &
APP_PID=$!
for _ in $(seq 1 30); do
  if /usr/bin/curl -fsS "http://127.0.0.1:8767/index.html" >/dev/null; then
    break
  fi
  /bin/sleep 1
done
/usr/bin/curl -fsS "http://127.0.0.1:8767/api/app/update" >/dev/null
/bin/kill "$APP_PID" >/dev/null 2>&1 || true
wait "$APP_PID" >/dev/null 2>&1 || true
APP_PID=""

mkdir -p "$DMG_ROOT"
cp -R "$APP_PATH" "$DMG_ROOT/Hrobot.app"
ln -s /Applications "$DMG_ROOT/Applications"
/usr/bin/hdiutil create \
  -volname "Hrobot ${VERSION}" \
  -srcfolder "$DMG_ROOT" \
  -ov \
  -format UDZO \
  "$OUTPUT_DIR/$DMG_NAME"

/usr/bin/shasum -a 256 "$OUTPUT_DIR/$DMG_NAME"
echo "Created $OUTPUT_DIR/$DMG_NAME"
