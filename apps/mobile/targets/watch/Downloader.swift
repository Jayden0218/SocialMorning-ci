// M21 US12 — background downloads on the Watch, straight from the publisher's address.
// A background URLSession (URLSessionConfiguration.background) keeps going while the app is
// suspended; when it finishes, watchOS relaunches the app with a WKURLSessionRefreshBackgroundTask
// (WatchApp.swift hands it to `keep`), which is completed in urlSessionDidFinishEvents.
// Low space (spec US12 scenario 2): refused before starting when the feed's size cannot fit, and
// cancelled mid-way when the server's size cannot fit — both say "Not enough space on your Watch".
// NOT YET COMPILED here — the cloud ios.yml run with extras on is the first compile.
import Foundation
import WatchKit

final class Downloader: NSObject, URLSessionDownloadDelegate {
  static let shared = Downloader()
  static let identifier = "app.socialmorning.mobile.watchkitapp.downloads"
  /// Space always left free for the system and our own list (100 MB).
  static let reserveBytes: Double = 100 * 1024 * 1024

  private var session: URLSession!
  /// Tasks we cancelled for space: their completion must not overwrite the reason.
  private var refused = Set<String>()
  private var waiting: [WKURLSessionRefreshBackgroundTask] = []

  override init() {
    super.init()
    let config = URLSessionConfiguration.background(withIdentifier: Self.identifier)
    config.sessionSendsLaunchEvents = true
    config.isDiscretionary = false
    session = URLSession(configuration: config, delegate: self, delegateQueue: nil)
  }

  static func freeBytes() -> Double {
    let attrs = try? FileManager.default.attributesOfFileSystem(forPath: NSHomeDirectory())
    return (attrs?[.systemFreeSize] as? NSNumber)?.doubleValue ?? 0
  }

  private static func fits(_ bytes: Double) -> Bool {
    freeBytes() - reserveBytes > bytes
  }

  private func fail(_ id: String, _ reason: String) {
    DispatchQueue.main.async {
      EpisodeStore.shared.update(id) { e in
        e.state = .failed
        e.failReason = reason
        e.progress = 0
      }
    }
  }

  /// Call on the main queue.
  func start(_ id: String) {
    guard let e = EpisodeStore.shared.episode(id) else { return }
    guard let url = URL(string: e.url) else { fail(id, Words.failed); return }
    guard Self.fits(max(0, e.bytes ?? 0)) else { fail(id, Words.noSpace); return }
    let task = session.downloadTask(with: url)
    task.taskDescription = id
    EpisodeStore.shared.update(id) { e in
      e.state = .downloading
      e.progress = 0
      e.failReason = nil
    }
    task.resume()
  }

  func cancel(_ id: String) {
    session.getAllTasks { tasks in
      tasks.filter { $0.taskDescription == id }.forEach { $0.cancel() }
    }
  }

  /// After a relaunch: start whatever is queued or was downloading but has no live task.
  func resumeMissing() {
    session.getAllTasks { tasks in
      let live = Set(tasks.compactMap { $0.taskDescription })
      DispatchQueue.main.async {
        for e in EpisodeStore.shared.episodes where (e.state == .queued || e.state == .downloading) && !live.contains(e.id) {
          self.start(e.id)
        }
      }
    }
  }

  /// A background-session wake-up; completed once the session has delivered its events.
  func keep(_ task: WKURLSessionRefreshBackgroundTask) {
    waiting.append(task)
  }

  // MARK: URLSessionDownloadDelegate

  func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
    guard let id = downloadTask.taskDescription, totalBytesExpectedToWrite > 0 else { return }
    let left = Double(totalBytesExpectedToWrite - totalBytesWritten)
    if !Self.fits(left) {
      refused.insert(id)
      downloadTask.cancel()
      fail(id, Words.noSpace)
      return
    }
    let fraction = Double(totalBytesWritten) / Double(totalBytesExpectedToWrite)
    DispatchQueue.main.async {
      EpisodeStore.shared.update(id) { e in
        e.progress = fraction
        if e.bytes == nil { e.bytes = Double(totalBytesExpectedToWrite) }
      }
    }
  }

  func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
    guard let id = downloadTask.taskDescription else { return }
    if let http = downloadTask.response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
      fail(id, Words.failed)
      return
    }
    // The file at `location` is deleted when this method returns: move it now, on this queue.
    let ext = downloadTask.originalRequest?.url?.pathExtension ?? ""
    let safeId = id.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? UUID().uuidString
    let name = "\(safeId).\(ext.isEmpty ? "mp3" : ext)"
    let dest = EpisodeStore.audioDir.appendingPathComponent(name)
    do {
      try? FileManager.default.removeItem(at: dest)
      try FileManager.default.moveItem(at: location, to: dest)
      DispatchQueue.main.async {
        EpisodeStore.shared.update(id) { e in
          e.state = .ready
          e.progress = 1
          e.fileName = name
          e.failReason = nil
        }
      }
    } catch {
      let full = (error as? CocoaError)?.code == .fileWriteOutOfSpace
      fail(id, full ? Words.noSpace : Words.failed)
    }
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    guard let error = error, let id = task.taskDescription else { return }
    if refused.remove(id) != nil { return }
    // Cancelled by "Remove from Watch": the episode is already gone and `update` does nothing.
    fail(id, Words.failed)
  }

  func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
    DispatchQueue.main.async {
      self.waiting.forEach { $0.setTaskCompletedWithSnapshot(false) }
      self.waiting.removeAll()
    }
  }
}
