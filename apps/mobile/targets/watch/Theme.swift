// M21 US12 — our colours and words on the Watch (owner, G0: SwiftUI on the Watch only, styled as ours).
// Every hex below is the value of the same-named token in apps/mobile/src/design/tokens.ts;
// __tests__/m21-watch.test.ts reads this file and fails if one drifts. Dark Pulse palette (constitution v4.0.0).
// NOT YET COMPILED here — the cloud ios.yml run with extras on is the first compile.
import SwiftUI

extension Color {
  /// `#rrggbb` → Color. Only ever called with the literals below.
  init(hex: UInt32) {
    self.init(
      red: Double((hex >> 16) & 0xFF) / 255.0,
      green: Double((hex >> 8) & 0xFF) / 255.0,
      blue: Double(hex & 0xFF) / 255.0
    )
  }
}

enum Theme {
  // token: background #111318
  static let background = Color(hex: 0x111318)
  // token: surface #1a1d23
  static let surface = Color(hex: 0x1A1D23)
  // token: text #eceef2
  static let text = Color(hex: 0xECEEF2)
  // token: muted #9aa1ad
  static let muted = Color(hex: 0x9AA1AD)
  // token: primary #f2867e
  static let primary = Color(hex: 0xF2867E)
  // token: onPrimary #111318
  static let onPrimary = Color(hex: 0x111318)
  // token: accent #f2867e
  static let accent = Color(hex: 0xF2867E)
  // token: playDisc #eceef2
  static let playDisc = Color(hex: 0xECEEF2)
  // token: playGlyph #111318
  static let playGlyph = Color(hex: 0x111318)
}

/// Every word the Watch shows, in one place (English only).
enum Words {
  static let title = "SocialNet"
  static let empty = "Nothing here yet. On your iPhone, open an episode, tap ⋯, then Download to Watch."
  static let queued = "Waiting to download"
  static let downloading = "Downloading"
  static let ready = "Ready"
  static let failed = "Download failed"
  static let noSpace = "Not enough space on your Watch"
  static let connectEarphones = "Connect Bluetooth earphones to play"
  static let play = "Play"
  static let pause = "Pause"
  static let back15 = "Back 15 seconds"
  static let forward30 = "Forward 30 seconds"
  static let remove = "Remove from Watch"
  static let retry = "Try again"
  static let notReady = "Still downloading"
  static func left(_ seconds: Double) -> String {
    let s = max(0, Int(seconds.rounded()))
    let h = s / 3600, m = (s % 3600) / 60, sec = s % 60
    return h > 0 ? String(format: "%d:%02d:%02d left", h, m, sec) : String(format: "%d:%02d left", m, sec)
  }
  static func percent(_ fraction: Double) -> String {
    "\(downloading) \(Int((fraction * 100).rounded()))%"
  }
}
