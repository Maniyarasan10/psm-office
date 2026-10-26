# PSM Office APK download setup

This page is a static release landing page for the Android APK. It is not an upload service and does not add the APK file for you.

## 1. Prerequisites

1. Confirm the Expo app exists at `mobile/` and the project name is `PSM Office` with package `com.psm.office`.
2. Install the EAS CLI in the project if you do not already have it:
   ```bash
   cd "C:\Users\Maniyarasan S\Desktop\Psm office\mobile"
   npm install -g eas-cli
   ```
   Or use `npx eas-cli` directly without global installation.
3. Make sure you are signed in to Expo and your project is connected to the correct account.

## 2. Build the APK

1. Open a terminal in `mobile/`.
2. Run the preview build command:
   ```bash
   cd "C:\Users\Maniyarasan S\Desktop\Psm office\mobile"
   npx eas-cli build --platform android --profile preview
   ```
3. Wait for EAS to complete the Android build. The output is an APK for the preview profile and internal distribution.
4. Download the generated APK from the EAS console or build results page.

## 3. Publish the release page

1. Copy the downloaded APK into this folder and rename it to exactly:
   ```text
   psm-office.apk
   ```
2. Place the file beside `index.html` in:
   ```text
   C:\Users\Maniyarasan S\Desktop\Psm office\apk-download
   ```
3. Open [Netlify Drop](https://app.netlify.com/drop) and sign in or create a Netlify account.
4. Drag the complete `apk-download` folder onto the deploy area. If your browser asks, allow access to the folder.
5. Wait for Netlify to finish publishing, then open the generated site URL and confirm the download button says **Ready**.
6. Share that public site URL with Android users. Keep the folder structure intact: the page reads `psm-office.apk` from the same deployment.
7. Do not claim the APK is present unless the file is actually there and the page is served from the same deployment.

## 4. Update the APK later

1. Build a new APK using the same EAS command above.
2. Replace the old `psm-office.apk` in the deployment folder with the new file.
3. Return to Netlify Drop and drag the full updated `apk-download` folder onto the deploy area again.
4. After the redeploy is complete, open the site URL and refresh to ensure the new file is served and the button is active.

## 5. User download and install steps

1. Open the public release page in the browser.
2. Tap the active Download APK button.
3. Save the file to the Android device.
4. Open the downloaded file from the browser or Files app.
5. If Android asks for permission to install apps from this source, allow it.
6. Confirm the install and then open the PSM Office app.
7. Sign in with the correct user account.

## Important note

This is static file hosting, not an in-page upload system. The page does not upload the APK to the public site. The owner must build the APK with EAS, place `psm-office.apk` in the same folder as `index.html`, and redeploy the whole folder whenever the version changes.
