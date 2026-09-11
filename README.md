# Miku Salary

A Miku-themed, liquid-glass desktop salary clock for Malaysia. The design intentionally gives most of the screen to one large, continuously growing number.

## Included

- Windows Electron desktop app, packaged as an NSIS installer and a portable `.exe`.
- macOS Electron desktop app, packaged as a `.dmg` and a `.zip`.
- Native macOS WidgetKit extension for **small** and **medium** desktop widgets.
- MYR monthly salary, monthly payday, payout time and local start-time configuration.
- Actual-calendar-period calculation: a 28-, 29-, 30- or 31-day pay period has the correct hourly/second rate.
- A continuous all-time total that does not reset when the next pay period begins.
- Current-cycle earnings/progress, live hourly/minute/second rates, and countdown to the next payday.
- Locally persisted settings. On macOS, a small state file in the App Group container is shared with WidgetKit.

## Project layout

```text
src/shared/salary.ts                  Shared TypeScript calculation core
src/renderer/                         Shared minimal React UI (Windows + macOS)
src/main/                             Electron persistence / platform bridge
native/macos-widget/                  Xcode WidgetKit extension and host target
scripts/                              Packaging helpers
core-spec/                            Calendar and accumulation contract
tests/                                Boundary and continuity tests
```

The Windows and macOS desktop apps are the same Electron application and therefore execute the exact same TypeScript calculation code. WidgetKit must run as Swift code in a separate Apple extension process, so its small mirror is constrained by — and documented against — the shared calculation contract in [`core-spec/README.md`](core-spec/README.md).

## Run locally

Prerequisites: Node.js 20+ and npm. The desktop package is intended for Node 20/22 LTS; Node 24 works for source tooling but is not the primary Electron support target.

```bash
npm install
npm run dev
```

The app opens at `http://127.0.0.1:5173` only while developing. Packaged builds load the local renderer with no server involved.

## Verify

```bash
npm test
npm run build
```

The test suite covers the final-day-of-month rule, the exact payday boundary, a full-cycle salary, continuous totals across payday, and future start times.

## Build the Windows EXE

Run this from Windows after installing Node and the project dependencies:

```powershell
.\scripts\build-windows.ps1
```

Or run the individual command:

```powershell
npm ci
npm run test
npm run dist:win
```

Artifacts are written to `release/`:

- `Miku Salary-Setup-1.1.0.exe` — normal installer.
- `Miku Salary-Portable-1.1.0.exe` — directly runnable portable version.

Windows code signing is optional for building but recommended before public distribution, otherwise SmartScreen may show a reputation warning.

## Build the macOS DMG + Widget

This must be run on macOS 14+ with Xcode 15+ and Node 20/22 LTS. A Windows computer cannot produce a valid native WidgetKit extension or a trustworthy signed macOS DMG.

1. In Apple Developer, enable the App Group `group.com.mikusalary.app` for the signing identifier you will use. The existing bundle IDs are `com.mikusalary.app` and `com.mikusalary.app.widget`; change all three identifiers together if you use your own reverse-DNS identifier:
   - `src/shared/salary.ts` (`WIDGET_GROUP_ID`)
   - the three `.entitlements` files under `native/macos-widget/`
   - the two `PRODUCT_BUNDLE_IDENTIFIER` values in `native/macos-widget/SalaryClockWidget.xcodeproj/project.pbxproj`, plus `build.appId` in `package.json`.
2. Export the Apple team identifier, for example `export APPLE_TEAM_ID=ABCDE12345`. The same team needs access to that App Group.
3. Supply your normal Developer ID signing/notarization environment expected by `electron-builder` (`CSC_LINK`, `CSC_KEY_PASSWORD`, and Apple notarization credentials), then run:

   ```bash
   npm ci
   npm run test
   npm run dist:mac
   ```

`npm run native:widget` first builds the native extension. The `afterPack` hook places it in `Miku Salary.app/Contents/PlugIns/`; electron-builder then signs the final app bundle. The DMG and ZIP appear in `release/`.

For a local unsigned development build, omit `APPLE_TEAM_ID`. It can be built and inspected, but its App Group access and widget behaviour should not be treated as distribution-ready.

### Add the widget

After installing the signed macOS app, open it once and save the salary settings. Then use the macOS widget gallery, find **Miku Salary**, and choose Small or Medium. WidgetKit schedules refreshes; the extension asks for a fresh entry every minute, while the main app refreshes every second.

## Salary calculation

The app treats the configured payout date/time as the start of a new salary period. For each elapsed piece of a period:

```text
earned = monthly salary × elapsed seconds ÷ actual seconds in that pay period
```

The total sums every elapsed piece from the configured start time to now. That makes the figure continuous over payday; only the **current-cycle** panel resets. For a payday of 29, 30 or 31, any shorter month uses its last calendar day.

All dates are evaluated in the computer's local timezone, matching the entered `datetime-local` start time and payout time.

## Data and privacy

No account, telemetry, cloud storage or network service is required. The desktop setting is stored in Electron's per-user application data. On macOS, the app also writes a `widget-state.json` snapshot into its entitlement-protected App Group container so the WidgetKit extension can read it.

## Notes for release owners

Before public release, replace the generic bundle identifier with one registered to your Apple Developer account, set a real icon, code-sign the Windows executable, and sign/notarize the macOS app. WidgetKit and App Group entitlement validation specifically require macOS signing on Apple hardware.

## License and character notice

The source code is available under the MIT License; see [`LICENSE`](LICENSE). The Miku-themed character artwork in `src/renderer/assets/miku-clock-companion.png` is a fan-made project asset and is explicitly excluded from the MIT License; see [`NOTICE.md`](NOTICE.md). Hatsune Miku and related character elements belong to their respective rights holder. This project is unofficial and is not endorsed by or affiliated with Crypton Future Media.
