// M21 US12 — the episodes the phone sent to this Watch, kept in the app's own container.
// One JSON file (Documents/episodes.json) and the audio files (Documents/audio/). The audio comes
// straight from the publisher's address (Downloader.swift); we host nothing.
// Every change happens on the main queue (SwiftUI reads `episodes`).
// NOT YET COMPILED here — the cloud ios.yml run with extras on is the first compile.
import Combine
import Foundation

enum DownloadState: String, Codable {
  case queued, downloading, ready, failed
}

struct WatchEpisode: Codable, Identifiable, Equatable {
  let id: String
  var title: String
  var show: String
  /// The publisher's audio address (the feed's enclosure).
  var url: String
  var artworkUrl: String?
  var positionMs: Double
  var durationMs: Double?
  /// The enclosure's size from the feed, when it says (used to refuse a download that cannot fit).
  var bytes: Double?
  var finished: Bool
  var state: DownloadState
  var progress: Double
  var failReason: String?
  var fileName: String?
  /// Epoch ms of the last position change here — the phone keeps whichever position is newer.
  var updatedAt: Double
}

final class EpisodeStore: ObservableObject {
  static let shared = EpisodeStore()

  @Published private(set) var episodes: [WatchEpisode] = []

  static var documents: URL {
    FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
  }
  static var audioDir: URL {
    let dir = documents.appendingPathComponent("audio", isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir
  }
  private var listFile: URL { Self.documents.appendingPathComponent("episodes.json") }

  init() {
    if let data = try? Data(contentsOf: listFile),
       let saved = try? JSONDecoder().decode([WatchEpisode].self, from: data) {
      episodes = saved
    }
  }

  func episode(_ id: String) -> WatchEpisode? {
    episodes.first { $0.id == id }
  }

  /// The local audio file, only when the download is complete and the file is still there.
  func fileURL(for id: String) -> URL? {
    guard let e = episode(id), e.state == .ready, let name = e.fileName else { return nil }
    let url = Self.audioDir.appendingPathComponent(name)
    return FileManager.default.fileExists(atPath: url.path) ? url : nil
  }

  /// An episode from the phone. Returns true when it needs downloading (new, or failed before).
  /// An episode already here keeps its own position: the Watch may have played it since.
  @discardableResult
  func add(_ incoming: WatchEpisode) -> Bool {
    if let i = episodes.firstIndex(where: { $0.id == incoming.id }) {
      var e = episodes[i]
      e.title = incoming.title
      e.show = incoming.show
      e.url = incoming.url
      e.artworkUrl = incoming.artworkUrl
      e.bytes = incoming.bytes ?? e.bytes
      let again = e.state == .failed || (e.state == .ready && fileURL(for: e.id) == nil)
      if again {
        e.state = .queued
        e.progress = 0
        e.failReason = nil
      }
      episodes[i] = e
      save()
      return again
    }
    episodes.insert(incoming, at: 0)
    save()
    return true
  }

  func update(_ id: String, _ change: (inout WatchEpisode) -> Void) {
    guard let i = episodes.firstIndex(where: { $0.id == id }) else { return }
    change(&episodes[i])
    save()
  }

  func setPosition(_ id: String, positionMs: Double, durationMs: Double?, finished: Bool) {
    update(id) { e in
      e.positionMs = max(0, positionMs)
      if let d = durationMs, d > 0 { e.durationMs = d }
      e.finished = finished
      e.updatedAt = Date().timeIntervalSince1970 * 1000
    }
  }

  func remove(_ id: String) {
    if let name = episode(id)?.fileName {
      try? FileManager.default.removeItem(at: Self.audioDir.appendingPathComponent(name))
    }
    episodes.removeAll { $0.id == id }
    save()
  }

  private func save() {
    guard let data = try? JSONEncoder().encode(episodes) else { return }
    try? data.write(to: listFile, options: .atomic)
  }
}
