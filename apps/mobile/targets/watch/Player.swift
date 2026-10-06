// M21 US12 — plays a downloaded episode on the Watch, with the phone away.
// Per Apple's "Playing background audio" (WatchKit): setCategory(.playback, mode: .default,
// policy: .longFormAudio), then activate(options:completionHandler:). watchOS needs a Bluetooth
// route for long-form audio (some newer Watches may also use the speaker); when activation
// fails or the listener dismisses the route picker, we say "Connect Bluetooth earphones to play".
// Positions are saved here every 15 s and on pause / skip / end, and sent to the phone on pause,
// skip and end (and every 60 s while it is reachable).
// NOT YET COMPILED here — the cloud ios.yml run with extras on is the first compile.
import AVFoundation
import Combine
import Foundation
import WatchConnectivity

final class Player: NSObject, ObservableObject, AVAudioPlayerDelegate {
  static let shared = Player()

  @Published private(set) var episodeId: String?
  @Published private(set) var isPlaying = false
  @Published private(set) var currentTime: Double = 0
  @Published private(set) var duration: Double = 0
  @Published var message: String?

  private var player: AVAudioPlayer?
  private var timer: Timer?
  private var ticks = 0

  /// Loads the episode at its saved position, paused. Call on the main queue.
  func open(_ id: String) {
    if episodeId == id, player != nil { return }
    if player != nil { pause() }
    guard let file = EpisodeStore.shared.fileURL(for: id), let e = EpisodeStore.shared.episode(id) else {
      message = Words.notReady
      return
    }
    do {
      let p = try AVAudioPlayer(contentsOf: file)
      p.delegate = self
      p.prepareToPlay()
      let start = e.finished ? 0 : e.positionMs / 1000
      p.currentTime = min(max(0, start), max(0, p.duration - 1))
      player = p
      episodeId = id
      duration = p.duration
      currentTime = p.currentTime
      message = nil
    } catch {
      message = Words.failed
    }
  }

  func toggle() {
    if isPlaying { pause() } else { play() }
  }

  func play() {
    guard let p = player else { return }
    let session = AVAudioSession.sharedInstance()
    do {
      try session.setCategory(.playback, mode: .default, policy: .longFormAudio, options: [])
    } catch {
      message = Words.connectEarphones
      return
    }
    session.activate(options: []) { success, error in
      DispatchQueue.main.async {
        guard success, error == nil else {
          self.message = Words.connectEarphones
          return
        }
        self.message = nil
        p.play()
        self.isPlaying = true
        self.startTimer()
      }
    }
  }

  func pause() {
    player?.pause()
    isPlaying = false
    stopTimer()
    save(finished: false, report: true)
  }

  /// −15 s or +30 s, kept inside the episode.
  func skip(by seconds: Double) {
    guard let p = player else { return }
    p.currentTime = min(max(0, p.currentTime + seconds), max(0, p.duration - 0.5))
    currentTime = p.currentTime
    save(finished: false, report: true)
  }

  /// "Remove from Watch" on the episode playing now.
  func close(_ id: String) {
    guard episodeId == id else { return }
    pause()
    player = nil
    episodeId = nil
  }

  private func startTimer() {
    stopTimer()
    ticks = 0
    timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
      guard let p = self.player else { return }
      self.currentTime = p.currentTime
      self.ticks += 1
      if self.ticks % 15 == 0 {
        let reachable = WCSession.isSupported() && WCSession.default.isReachable
        self.save(finished: false, report: reachable && self.ticks % 60 == 0)
      }
    }
  }

  private func stopTimer() {
    timer?.invalidate()
    timer = nil
  }

  private func save(finished: Bool, report: Bool) {
    guard let id = episodeId, let p = player else { return }
    currentTime = p.currentTime
    EpisodeStore.shared.setPosition(id, positionMs: finished ? p.duration * 1000 : p.currentTime * 1000, durationMs: p.duration * 1000, finished: finished)
    if report, let e = EpisodeStore.shared.episode(id) { PhoneLink.shared.sendPosition(e) }
  }

  // MARK: AVAudioPlayerDelegate

  func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
    DispatchQueue.main.async {
      self.isPlaying = false
      self.stopTimer()
      self.save(finished: true, report: true)
    }
  }
}
