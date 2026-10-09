// Lane DP — which app this widget belongs to, worked out from its own bundle id, so the dev app's
// widget (app.socialmorning.mobile.dev.widget) reads the dev App Group and opens the dev app, and
// the real app's widget (app.socialmorning.mobile.widget) is exactly as before.
// Must match app.config.js (`DEV.appGroup`, `DEV.scheme`) and src/outside/ios.ts (`appGroupFor`).
import Foundation

enum AppVariant {
  /// The phone app's bundle id: this extension's id without its last part.
  static let hostBundleId: String = {
    let mine = Bundle.main.bundleIdentifier ?? "app.socialmorning.mobile.widget"
    return mine.split(separator: ".").dropLast().joined(separator: ".")
  }()
  static let isDev = hostBundleId.hasSuffix(".dev")
  /// `group.<phone app's bundle id>`: group.app.socialmorning.mobile or …mobile.dev.
  static let appGroup = "group." + hostBundleId
  /// The phone app's URL scheme: socialmorning or socialmorning-dev.
  static let scheme = isDev ? "socialmorning-dev" : "socialmorning"
  static func url(_ path: String) -> URL? { URL(string: "\(scheme)://\(path)") }
}
