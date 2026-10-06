// The phone end of WatchConnectivity: is a Watch with our app there, send it an episode, hear back
// the positions it played to.
//
// M21 US12 (FR-105, research R1). WCSession needs no entitlement. The session is activated when
// the module is created; `isPaired` / `isWatchAppInstalled` are only meaningful once it is active,
// so before that `getState` says "no Watch" and the app hides "Download to Watch".
// Episodes go by `transferUserInfo` (queued by the system, delivered even if the Watch app is not
// running). Positions arrive by `sendMessage` or `transferUserInfo` (targets/watch/PhoneLink.swift);
// ones that arrive before JS listens are kept and handed over by `takePending`.
// NOT YET COMPILED here — the cloud ios.yml run with extras on is the first compile.

import ExpoModulesCore
import Foundation
import WatchConnectivity

struct WatchEpisodeRecord: Record {
  @Field var id: String = ""
  @Field var title: String = ""
  @Field var show: String = ""
  @Field var url: String = ""
  @Field var artworkUrl: String? = nil
  @Field var positionMs: Double = 0
  @Field var durationMs: Double? = nil
  @Field var bytes: Double? = nil
}

final class WatchLinkSession: NSObject, WCSessionDelegate {
  static let shared = WatchLinkSession()

  private let lock = NSLock()
  private var pending: [[String: Any]] = []
  private var listener: (([String: Any]) -> Void)?

  func activate() {
    guard WCSession.isSupported() else { return }
    let s = WCSession.default
    if s.delegate == nil { s.delegate = self }
    if s.activationState != .activated { s.activate() }
  }

  var state: [String: Bool] {
    guard WCSession.isSupported() else { return ["paired": false, "installed": false] }
    let s = WCSession.default
    let active = s.activationState == .activated
    return ["paired": active && s.isPaired, "installed": active && s.isPaired && s.isWatchAppInstalled]
  }

  func send(_ e: WatchEpisodeRecord) -> Bool {
    guard WCSession.isSupported() else { return false }
    let s = WCSession.default
    guard s.activationState == .activated, s.isPaired, s.isWatchAppInstalled else { return false }
    // Property-list values only: no nils.
    var payload: [String: Any] = [
      "kind": "episode",
      "id": e.id,
      "title": e.title,
      "show": e.show,
      "url": e.url,
      "positionMs": e.positionMs,
    ]
    if let a = e.artworkUrl { payload["artworkUrl"] = a }
    if let d = e.durationMs { payload["durationMs"] = d }
    if let b = e.bytes { payload["bytes"] = b }
    s.transferUserInfo(payload)
    return true
  }

  func setListener(_ fn: (([String: Any]) -> Void)?) {
    lock.lock()
    listener = fn
    lock.unlock()
  }

  func takePending() -> [[String: Any]] {
    lock.lock()
    defer { lock.unlock() }
    let out = pending
    pending.removeAll()
    return out
  }

  private func deliver(_ info: [String: Any]) {
    guard info["kind"] as? String == "position" else { return }
    lock.lock()
    let fn = listener
    if fn == nil { pending.append(info) }
    lock.unlock()
    fn?(info)
  }

  // MARK: WCSessionDelegate

  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}

  func sessionDidBecomeInactive(_ session: WCSession) {}

  /// The listener switched Watches: activate again for the new one (Apple's documented pattern).
  func sessionDidDeactivate(_ session: WCSession) {
    session.activate()
  }

  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
    deliver(userInfo)
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    deliver(message)
  }
}

public class WatchLinkModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WatchLink")

    Events("onPosition")

    OnCreate {
      WatchLinkSession.shared.activate()
    }

    OnStartObserving("onPosition") {
      WatchLinkSession.shared.setListener { [weak self] info in
        self?.sendEvent("onPosition", info.mapValues { Optional($0) })
      }
    }

    OnStopObserving("onPosition") {
      WatchLinkSession.shared.setListener(nil)
    }

    /// { paired, installed } — both false until the session is active.
    Function("getState") { () -> [String: Bool] in
      WatchLinkSession.shared.activate()
      return WatchLinkSession.shared.state
    }

    /// Queues the episode for the Watch. False when there is no paired Watch with our app.
    Function("sendEpisode") { (episode: WatchEpisodeRecord) -> Bool in
      WatchLinkSession.shared.send(episode)
    }

    /// Positions that arrived before JS listened.
    Function("takePending") { () -> [[String: Any]] in
      WatchLinkSession.shared.takePending()
    }
  }
}
