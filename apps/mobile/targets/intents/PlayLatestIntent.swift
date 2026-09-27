// M10b US9 — Siri's "Play my latest episode in SocialNet". The intent only opens the app at
// socialmorning://play-latest; the app picks the episode (src/outside/now-playing.ts
// latestToPlay) and plays it. OpenURLIntent needs iOS 18. NOT YET COMPILED (no paid Apple team).
import AppIntents
import Foundation

struct PlayLatestIntent: AppIntent {
  static let title: LocalizedStringResource = "Play my latest episode"
  static let description = IntentDescription("Plays the newest unfinished episode from your queue or your shows.")

  func perform() async throws -> some IntentResult & OpensIntent {
    return .result(opensIntent: OpenURLIntent(URL(string: "socialmorning://play-latest")!))
  }
}

struct SocialNetShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: PlayLatestIntent(),
      phrases: [
        "Play my latest episode in \(.applicationName)",
        "Play my latest \(.applicationName) episode",
      ],
      shortTitle: "Play latest",
      systemImageName: "play.circle"
    )
  }
}
