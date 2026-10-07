// M10b US9 — Siri's "Play my latest episode in SocialNet". The intent only opens the app at
// socialmorning://play-latest; the app picks the episode (src/outside/now-playing.ts
// latestToPlay) and plays it. OpenURLIntent needs iOS 18.
// M21 (ios run 37447796025, first compile): the target's deployment setting did not reach this
// file, so both types say iOS 18 themselves.
import AppIntents
import Foundation

@available(iOS 18.0, *)
struct PlayLatestIntent: AppIntent {
  static let title: LocalizedStringResource = "Play my latest episode"
  static let description = IntentDescription("Plays the newest unfinished episode from your queue or your shows.")

  func perform() async throws -> some IntentResult & OpensIntent {
    return .result(opensIntent: OpenURLIntent(URL(string: "socialmorning://play-latest")!))
  }
}

@available(iOS 18.0, *)
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

// M21 (install 2026-10-07): an ExtensionKit app-intents extension must have an entry point, or iOS
// refuses the whole app ("Expected executable … to have a __swift5_entry section").
@main
struct SocialNetIntentsExtension: AppIntentsExtension {}
