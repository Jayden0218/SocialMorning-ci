// M21 US12 — the Watch's end of WatchConnectivity.
// In: episodes from the phone ({kind: "episode", id, title, show, url, artworkUrl, positionMs,
// durationMs, bytes}) by transferUserInfo (queued, delivered even when this app is not running) or
// sendMessage. Out: positions ({kind: "position", episodeId, positionMs, durationMs, finished,
// updatedAt}) — sendMessage when the phone is reachable, else transferUserInfo, which waits for it.
// The phone keeps whichever position is newer (src/sync/watch.ts).
// NOT YET COMPILED here — the cloud ios.yml run with extras on is the first compile.
import Foundation
import WatchConnectivity
import WatchKit

final class PhoneLink: NSObject, WCSessionDelegate {
  static let shared = PhoneLink()

  private var waiting: [WKWatchConnectivityRefreshBackgroundTask] = []

  func activate() {
    guard WCSession.isSupported() else { return }
    let s = WCSession.default
    if s.delegate == nil { s.delegate = self }
    if s.activationState != .activated { s.activate() }
  }

  /// A wake-up to receive data; completed once nothing more is pending (at most ~20 s).
  func keep(_ task: WKWatchConnectivityRefreshBackgroundTask) {
    activate()
    waiting.append(task)
    finishWhenIdle(tries: 0)
  }

  private func finishWhenIdle(tries: Int) {
    DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
      if WCSession.default.hasContentPending && tries < 20 {
        self.finishWhenIdle(tries: tries + 1)
        return
      }
      self.waiting.forEach { $0.setTaskCompletedWithSnapshot(false) }
      self.waiting.removeAll()
    }
  }

  func sendPosition(_ e: WatchEpisode) {
    guard WCSession.isSupported() else { return }
    let s = WCSession.default
    guard s.activationState == .activated else { return }
    var payload: [String: Any] = [
      "kind": "position",
      "episodeId": e.id,
      "positionMs": e.positionMs,
      "finished": e.finished,
      "updatedAt": e.updatedAt,
    ]
    if let d = e.durationMs { payload["durationMs"] = d }
    if s.isReachable {
      s.sendMessage(payload, replyHandler: nil) { _ in
        s.transferUserInfo(payload)
      }
    } else {
      s.transferUserInfo(payload)
    }
  }

  // MARK: WCSessionDelegate

  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}

  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
    receive(userInfo)
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    receive(message)
  }

  private func receive(_ info: [String: Any]) {
    guard info["kind"] as? String == "episode",
          let id = info["id"] as? String,
          let title = info["title"] as? String,
          let url = info["url"] as? String else { return }
    let incoming = WatchEpisode(
      id: id,
      title: title,
      show: info["show"] as? String ?? "",
      url: url,
      artworkUrl: info["artworkUrl"] as? String,
      positionMs: (info["positionMs"] as? NSNumber)?.doubleValue ?? 0,
      durationMs: (info["durationMs"] as? NSNumber)?.doubleValue,
      bytes: (info["bytes"] as? NSNumber)?.doubleValue,
      finished: false,
      state: .queued,
      progress: 0,
      failReason: nil,
      fileName: nil,
      updatedAt: 0
    )
    DispatchQueue.main.async {
      if EpisodeStore.shared.add(incoming) { Downloader.shared.start(id) }
    }
  }
}
