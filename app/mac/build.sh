#!/bin/sh
# Builds Paper.app into ~/Applications, and the website into ~/Paper/site.
# Run again after changing index.html or Paper.swift.
set -e
cd "$(dirname "$0")"

APP="$HOME/Applications/Paper.app"
SITE="$HOME/Paper/site"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp Info.plist "$APP/Contents/Info.plist"
cp ../index.html "$APP/Contents/Resources/index.html"
cp -R ../assets "$APP/Contents/Resources/assets"

# one app for both Apple silicon and Intel Macs
for arch in arm64 x86_64; do
  swiftc -O -swift-version 5 -target "$arch-apple-macos13.0" -framework Cocoa -framework WebKit Paper.swift -o "$TMP/Paper-$arch"
done
lipo -create "$TMP/Paper-arm64" "$TMP/Paper-x86_64" -output "$APP/Contents/MacOS/Paper"

swiftc -swift-version 5 -framework Cocoa icon.swift -o "$TMP/icon"
"$TMP/icon" "$TMP/Paper.iconset"
iconutil -c icns "$TMP/Paper.iconset" -o "$APP/Contents/Resources/Paper.icns"

xattr -cr "$APP"
codesign --force --sign - "$APP"
echo "Built $APP"

# the website: the same page, plus the app to download
mkdir -p "$SITE"
cp ../index.html "$SITE/index.html"
rm -rf "$SITE/assets" && cp -R ../assets "$SITE/assets"
rm -f "$SITE/Paper.zip"
ditto -c -k --norsrc --noextattr --noacl --keepParent "$APP" "$SITE/Paper.zip"
echo "Built $SITE"
