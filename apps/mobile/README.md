# Sharebook Mobile

Android-first React Native dogfood app for Phase 0A.

## Why This Exists

The web app remains the eval and feedback dashboard. This app exists to remove the dogfood bottleneck of sending phone captures to a Mac before uploading them.

## Setup

1. Copy the environment template:

   ```sh
   cp apps/mobile/.env.example apps/mobile/.env
   ```

2. Fill:

   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - `EXPO_PUBLIC_SHAREBOOK_API_URL`

   For dogfood builds, `EXPO_PUBLIC_SHAREBOOK_API_URL` should be the deployed Sharebook web/API URL, such as `https://sharebook.vercel.app`. Local LAN URLs are only for nearby development.

3. Start the web backend:

   ```sh
   npm run dev
   ```

4. Build/run Android:

   ```sh
   npm run android
   ```

## Dogfood Modes

### Native installed app

This is the target path for real 0A dogfooding. The app is installed on the phone and receives Android share-sheet payloads as Sharebook. It should not depend on Expo Go.

For walking-around dogfooding, the phone also needs an API URL it can reach away from the Mac. `http://192.168.x.x:3000` only works on the same Wi-Fi network. Use one of these before relying on outdoor testing:

- deploy the web app/API to a stable preview or production URL
- expose the local web server through a tunnel with a stable HTTPS URL
- put the phone and Mac on a private network/VPN that works away from home Wi-Fi

The installed debug APK still expects Metro unless built with a bundled JS payload. For field dogfooding, prefer a release/internal build once the first native loop is working.

Build the local release APK with embedded JavaScript:

```sh
npm run build:mobile:dogfood
```

Install the generated APK:

```sh
npm run device -- install apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```

The dogfood build script refuses local API URLs because the app needs to work away from the Mac.

### Magic-link auth

Mobile uses the same Supabase magic-link account as the web dashboard. To preserve access to existing web eval data, sign in with the same email address you used on web.

Supabase setup required:

- Configure custom SMTP, preferably Resend, to avoid the built-in email sender's low hourly limit.
- Add `sharebook://**` to Supabase Auth redirect URLs.
- Add the deployed web callback URL, such as `https://sharebook.vercel.app/auth/callback`.

### Nearby wireless debugging

Wireless ADB is useful while the phone and Mac are on the same Wi-Fi. It lets Codex launch the app, capture screenshots, read logs, install APKs, and simulate text/URL shares without a USB cable. It does not help once the phone leaves the network.

On Android, enable Developer options, open Wireless debugging, then use the pairing address/code:

```sh
npm run device -- pair <pair-host:pair-port> <pair-code>
npm run device -- connect <device-host:device-port>
npm run device -- status
```

Useful native-device commands:

```sh
npm run device -- install
npm run device -- launch
npm run device -- screenshot
npm run device -- logs
npm run device -- logs:clear
npm run device -- share-url https://example.com
```

### Expo QR

Expo QR is useful for fast UI iteration and console output, but it is not the main dogfood path. Expo Go cannot act as the Sharebook Android share target from this app's native manifest.

## Capture Flow

1. Sign in with a magic link using the same email as the web dashboard.
2. Share a URL, text, screenshot, or image to Sharebook from Android.
3. Confirm the capture in the app.
4. Sharebook saves the Capture through the web API.
5. The app immediately starts `openai_mini` analysis.
6. Review intent, entities, reminders, and collections on mobile or in the web dashboard.

## Notes

- The app uses bearer-token auth against the existing Next API routes.
- Android share intake uses Expo's `expo-sharing` receive support and requires a native/dev build, not Expo Go.
- iOS is intentionally deferred until Android proves the dogfood loop.
