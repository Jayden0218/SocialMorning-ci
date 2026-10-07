// Switches the app icon to one of our own designs (Sunrise, Ocean, Forest, Plum) or back to the default.
//
// M22 T076 (moved from M20 T070-T072). UIApplication.setAlternateIconName: iOS shows its own
// "You have changed the icon" notice; the app does not close. The icons are app icon sets in the
// asset catalog, named after the icon, added at prebuild by ../plugin.js
// (ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES).
import ExpoModulesCore
import UIKit

public class AlternateIconsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AlternateIcons")

    /** True when this phone can change its icon. */
    AsyncFunction("supportsAlternateIcons") { () -> Bool in
      return UIApplication.shared.supportsAlternateIcons
    }.runOnQueue(.main)

    /** The alternate icon in use, or nil for the default. */
    AsyncFunction("getIconName") { () -> String? in
      return UIApplication.shared.alternateIconName
    }.runOnQueue(.main)

    /** nil puts the default icon back. Rejects when iOS refuses (an unknown name, a busy app). */
    AsyncFunction("setIconName") { (name: String?, promise: Promise) in
      UIApplication.shared.setAlternateIconName(name) { error in
        if let error = error {
          promise.reject("ERR_ALTERNATE_ICON", error.localizedDescription)
        } else {
          promise.resolve(name)
        }
      }
    }.runOnQueue(.main)
  }
}
