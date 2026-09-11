#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "$0")/.." && pwd)"
project_file="$project_root/native/macos-widget/SalaryClockWidget.xcodeproj"
derived_data="$project_root/native/macos-widget/build"

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "Xcode is required to build the WidgetKit extension." >&2
  exit 1
fi

arguments=(
  -project "$project_file"
  -scheme WidgetHost
  -configuration Release
  -derivedDataPath "$derived_data"
  build
)

# For distributable widgets, set APPLE_TEAM_ID to a team that has the App Group
# enabled. Without it this still creates an unsigned development artifact.
if [[ -n "${APPLE_TEAM_ID:-}" ]]; then
  arguments=(DEVELOPMENT_TEAM="$APPLE_TEAM_ID" "${arguments[@]}")
else
  arguments=(CODE_SIGNING_ALLOWED=NO "${arguments[@]}")
fi

xcodebuild "${arguments[@]}"

extension="$derived_data/Build/Products/Release/Miku Salary Widget Host.app/Contents/PlugIns/SalaryClockWidget.appex"
test -d "$extension"
echo "Widget extension built: $extension"
