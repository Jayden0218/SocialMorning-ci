/**
 * Owner, 2026-09-27: the app asks for notification permission, but the iPhone is signed
 * by a free Apple team, which cannot sign the Push Notifications capability. Expo applies
 * the expo-notifications plugin at prebuild even when it is not listed, and that plugin
 * always adds `aps-environment`. This removes it again. Asking permission and showing
 * notifications made on the phone still work; server push needs a paid team (and this
 * plugin removed).
 */
const { withEntitlementsPlist } = require('expo/config-plugins');

module.exports = function withoutPushEntitlement(config) {
  return withEntitlementsPlist(config, (c) => {
    delete c.modResults['aps-environment'];
    return c;
  });
};
