# TV store packaging

Every store app is built from the same TV host code in `public/`. Spec: [specs/002-tv-store-apps](../specs/002-tv-store-apps/requirements.md).

**Before your first store submission:**

1. Deploy the hub over HTTPS (see the main README) and confirm `https://<hub>/healthz` returns `{"ok":true}`.
2. Choose the permanent app identity in `package.json` → `"huddle"` (`appId`, `appName`, `vendor`, `tizenPackageId`) **and** in `capacitor.config.json` / `android/app/build.gradle` (`applicationId`). You can't change these after publishing.
3. Build: `HUDDLE_SERVER_URL=https://<hub> npm run build:tv`

Store icons are generated from `assets/icon.svg` and `assets/banner.svg` with `npm run icons`.

## LG webOS

Files: `platforms/webos/appinfo.json` (template) → `dist/webos/`

```bash
HUDDLE_SERVER_URL=https://<hub> npm run package:webos     # → dist/<appId>_<version>_all.ipk
```

**Test on a TV:**
1. Install **Developer Mode** from the LG Content Store and sign in with an LG developer account.
2. Turn on Dev Mode Status and Key Server.
3. Run `npx -p @webos-tools/cli ares-setup-device` and add the TV's IP with passphrase.
4. Run `npx -p @webos-tools/cli ares-install -d <tv> dist/*.ipk`, then `ares-launch -d <tv> <appId>`.

**Submit:** LG Seller Lounge (seller.lgappstv.com) → App → Register. Upload the `.ipk`, the 1920×1080 screenshots and the icon. In the description, say that HUDDLE needs an internet connection and phones as controllers.

## Samsung Tizen

Files: `platforms/tizen/config.xml` (template) → `dist/tizen/`

```bash
HUDDLE_SERVER_URL=https://<hub> npm run build:tizen
```

1. Install **Tizen Studio** with the TV extensions and the Samsung Certificate Extension.
2. Create a **Samsung** certificate profile (author + distributor) in Certificate Manager. Keep `author.p12` out of git.
3. Package it: `tizen package -t wgt -s <profile> -- dist/tizen` gives you `HUDDLE.wgt`.
4. **Test:** turn on Developer Mode on the TV (Apps → type `12345`, then enter your PC's IP). Run `sdb connect <tv-ip>`, then `tizen install -n HUDDLE.wgt -t <device>`.
5. **Submit:** Samsung Apps TV Seller Office (seller.samsungapps.com/tv).

## Android TV / Fire TV

Files: `capacitor.config.json` and `android/` (Capacitor). The TV launcher setup is in `android/app/src/main/AndroidManifest.xml`: `LEANBACK_LAUNCHER`, `android:banner`, landscape orientation, and touchscreen not required.

```bash
HUDDLE_SERVER_URL=https://<hub> npm run build:android    # builds dist/android and syncs it into android/
npx cap open android                                      # opens Android Studio
```

1. In Android Studio, run it on an **Android TV** emulator (Device Manager → TV → 1080p). Check that it appears on the home row with the banner.
2. Bump `versionCode` and `versionName` in `android/app/build.gradle` for each release.
3. Build → Generate Signed App Bundle. Keep the upload keystore safe and out of git.
4. **Google Play:** Play Console → create the app → Advanced settings → Form factors → **Android TV**. Upload the `.aab` and add TV screenshots plus the 1280×720 banner. Google reviews TV apps separately against its TV quality guidelines.
5. **Amazon Appstore (Fire TV):** Amazon Developer Console → add a new app → Android. Upload a signed `.apk` (Build → Build APK(s) with your keystore) and select the Fire TV devices.

## Release checklist

- [ ] The version is bumped in `package.json` **and** `android/app/build.gradle`.
- [ ] `CHANGELOG.md` is updated.
- [ ] `npm run check` passes.
- [ ] On-device QA from specs/002 task 9 is done on every store you're shipping to.
- [ ] You've tagged `vX.Y.Z` and pushed it. The Release workflow attaches the `.ipk` and web bundles to the GitHub release.
