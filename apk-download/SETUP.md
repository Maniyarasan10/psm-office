# PSM Office APK release page

Static release site for the internal PSM Office Android app. It serves the signed
APK and explains the app, installation and daily use.

- Live site: https://maniyarasan10.github.io/psm-apk/
- Repository: https://github.com/Maniyarasan10/psm-apk

Current release: `1.0.0` (build `1`), universal APK, Android 7.0+, `59.9 MB`.

## What is in this folder

- `index.html` - the release page, including app details, setup steps, usage guide and FAQ.
- `psm-office.apk` - the signed release APK served by the page.
- `ce.png` - the PSM Office logo used in the header and footer.
- `SETUP.md` - this document.
- `.nojekyll` - tells GitHub Pages to serve the files without Jekyll processing.

The page checks `psm-office.apk` with a `HEAD` request. When the file is reachable,
the status pill reads **Ready to install** and the displayed size is read from the
server. The download buttons work even if the check is unavailable.

## Preview locally

Run a local HTTP server from the folder that contains `index.html`:

```powershell
python -m http.server 8765
```

Open `http://127.0.0.1:8765/` and confirm:

1. The page loads without console errors.
2. The status pill reads **Ready to install**.
3. **Download APK** saves `psm-office.apk` and the file opens on Android.

Opening `index.html` directly with `file://` also works, but the status check is
browser-dependent. Use the local server or the deployed site for final verification.

## Deploy on GitHub Pages

This repository is already configured to publish from the `main` branch at the
repository root.

1. Commit the updated site files.
2. Push to `main`.
3. Wait for the Pages build to finish, then open the live site and confirm the
   download works.

For a new repository, open **Settings → Pages**, choose **Deploy from a branch**,
select `main` and `/ (root)`, then save. Do not select `/docs`; `index.html` is at
the repository root.

## Build a new signed APK

### Local Gradle build

Prerequisites: Node.js, Android SDK, and the Android NDK required by the project.

```powershell
cd "C:\Users\Maniyarasan S\Desktop\Psm office\mobile"
npm install
cd android
.\gradlew.bat assembleRelease
```

The signed output is:

```text
mobile\android\app\build\outputs\apk\release\app-release.apk
```

Release signing uses `mobile\android\keystore.properties` (or the `PSM_KEYSTORE_*`
environment variables). Both the properties file and the keystore are gitignored.
Never commit or upload them.

`mobile\android\build.gradle` contains the project's CMake/clang workaround. Keep it
when rebuilding on Windows.

### EAS Build alternative

If the project is connected to Expo and signed in:

```powershell
cd "C:\Users\Maniyarasan S\Desktop\Psm office\mobile"
npx eas-cli build --platform android --profile preview
```

The `preview` profile in `eas.json` produces an internal-distribution APK.

## Publish a new version

1. Bump `versionCode` and `versionName` in `mobile\android\app\build.gradle`.
2. Build and verify the new APK.
3. Replace `psm-office.apk` in the release repository root.
4. Update the release values in `index.html`:
   - search for `1.0.0` and `Build 1`
   - replace the displayed SHA-256 checksums
   - update the `59.9 MB` fallback labels (the live value is read from the APK)
   - update the version in the status fallback text
5. Update the current release line at the top of this file.
6. Commit and push to `main`; GitHub Pages redeploys automatically.

Compute the checksum on Windows:

```powershell
Get-FileHash -Algorithm SHA256 .\psm-office.apk
```

To print the signing certificate hash, use `apksigner` from the Android SDK
build-tools:

```powershell
apksigner verify --print-certs .\psm-office.apk
```

Use the SHA-256 certificate digest shown by `apksigner` on the page.

## Notes

- GitHub Pages makes this release site and APK publicly reachable.
- The APK is under GitHub's 100 MB file limit but above the 50 MB recommendation.
- Install the new APK over the old one; users do not need to uninstall first when the
  signing key is unchanged.
- Do not claim the APK is available unless `psm-office.apk` is present beside
  `index.html` in the deployed repository.
