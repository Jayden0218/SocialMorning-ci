// M21 US12 (FR-105, research R1) — the SocialNet Watch app's entry point.
// Starts WatchConnectivity (episodes in, positions out), recreates the background download
// session, and hands background wake-ups to whoever owns them (WKApplicationDelegate.handle).
// NOT YET COMPILED here — the cloud ios.yml run with extras on is the first compile.
import SwiftUI
import WatchKit

final class WatchAppDelegate: NSObject, WKApplicationDelegate {
  func applicationDidFinishLaunching() {
    PhoneLink.shared.activate()
    Downloader.shared.resumeMissing()
  }

  func handle(_ backgroundTasks: Set<WKRefreshBackgroundTask>) {
    for task in backgroundTasks {
      if let t = task as? WKURLSessionRefreshBackgroundTask {
        // Touching `shared` recreates the session with the same identifier, so it gets the events.
        Downloader.shared.keep(t)
      } else if let t = task as? WKWatchConnectivityRefreshBackgroundTask {
        PhoneLink.shared.keep(t)
      } else {
        task.setTaskCompletedWithSnapshot(false)
      }
    }
  }
}

@main
struct SocialNetWatchApp: App {
  @WKApplicationDelegateAdaptor(WatchAppDelegate.self) var appDelegate
  @StateObject private var store = EpisodeStore.shared
  @StateObject private var player = Player.shared

  var body: some Scene {
    WindowGroup {
      EpisodeListView()
        .environmentObject(store)
        .environmentObject(player)
    }
  }
}
