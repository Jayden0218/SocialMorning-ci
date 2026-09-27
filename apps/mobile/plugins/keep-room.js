/**
 * Found on the phone 2026-09-28 (the first CI-built APK): the app died at start with
 * "Failed to create an instance of class androidx.work.impl.WorkDatabase". The home-screen
 * widget (react-native-android-widget) brings WorkManager 2.8.1 → Room 2.5.0, and Room makes
 * `WorkDatabase_Impl` by reflection; the release build's shrinker (R8) had removed that
 * class's no-argument constructor. This keeps it. The resolved versions were read from CI
 * (`android-compile.yml`, "WorkManager / Room versions resolved"): no version clash.
 */
const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const RULE = '-keep class * extends androidx.room.RoomDatabase { <init>(); }';

module.exports = function withKeepRoom(config) {
  return withDangerousMod(config, ['android', async (c) => {
    const file = path.join(c.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
    const now = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (!now.includes(RULE)) fs.writeFileSync(file, `${now.trimEnd()}\n\n# SocialNet (plugins/keep-room.js): Room builds its database class by reflection.\n${RULE}\n`);
    return c;
  }]);
};
