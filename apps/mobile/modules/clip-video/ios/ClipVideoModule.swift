// A clip as a short video, made with the phone's own encoders (AVFoundation), and shared.
//
// M19 (owner, 2026-10-05). Two steps, both Apple's own frameworks — no FFmpeg:
//  1. AVAssetWriter writes a silent H.264 720×1280 15 fps video: each frame is the cover, the
//     title, the show, the clip's heat bars and a playhead that moves across them.
//  2. AVMutableComposition puts that video next to the clip's range of the LOCAL audio file, and
//     AVAssetExportSession writes Caches/clip-<uuid>.mp4 (the audio is re-encoded to AAC).
// `shareVideo` presents UIActivityViewController; the app's own share panel always opens first.

import AVFoundation
import ExpoModulesCore
import UIKit

struct ClipVideoPalette: Record {
  @Field var background: String = "#fbf8f1"
  @Field var text: String = "#16130d"
  @Field var muted: String = "#5c5546"
  @Field var primary: String = "#fcc522"
  @Field var accent: String = "#8a5a00"
}

struct ClipVideoOptions: Record {
  @Field var audioUri: String = ""
  @Field var startMs: Double = 0
  @Field var endMs: Double = 0
  @Field var coverUri: String? = nil
  @Field var title: String = ""
  @Field var show: String = ""
  @Field var heat: [Double] = []
  @Field var palette: ClipVideoPalette? = nil
}

final class ClipVideoException: GenericException<String> {
  override var reason: String { param }
}

/// Plain values copied out of the record, so the work can leave the module's queue.
private struct Job {
  let audioURL: URL
  let startMs: Int64
  let endMs: Int64
  let coverUri: String?
  let title: String
  let show: String
  let heat: [Double]
  let colours: Colours
}

private struct Colours {
  let background: UIColor
  let text: UIColor
  let muted: UIColor
  let primary: UIColor
  let accent: UIColor
}

private let width = 720
private let height = 1280
private let fps: Int32 = 15
private let maxMs: Int64 = 60_000

// Layout, in points from the top-left of the 720×1280 frame.
private let coverRect = CGRect(x: 110, y: 140, width: 500, height: 500)
private let titleRect = CGRect(x: 60, y: 690, width: 600, height: 160)
private let showRect = CGRect(x: 60, y: 860, width: 600, height: 40)
private let heatRect = CGRect(x: 60, y: 950, width: 600, height: 150)
private let progressRect = CGRect(x: 60, y: 1130, width: 600, height: 6)
private let rangeRect = CGRect(x: 60, y: 1150, width: 600, height: 34)
private let brandRect = CGRect(x: 60, y: 1206, width: 600, height: 34)

public class ClipVideoModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ClipVideo")

    AsyncFunction("makeClipVideo") { (options: ClipVideoOptions, promise: Promise) in
      let job: Job
      do {
        job = try ClipVideoModule.job(from: options)
      } catch {
        promise.reject(error)
        return
      }
      Task.detached(priority: .userInitiated) {
        do {
          let url = try await ClipVideoModule.make(job)
          promise.resolve(["uri": url.absoluteString])
        } catch {
          promise.reject(ClipVideoException("Couldn't make the video: \(error.localizedDescription)"))
        }
      }
    }

    AsyncFunction("shareVideo") { (uri: String, title: String, promise: Promise) in
      guard let url = URL(string: uri), url.isFileURL, FileManager.default.fileExists(atPath: url.path) else {
        promise.reject(ClipVideoException("The video file is missing."))
        return
      }
      guard let presenter = self.appContext?.utilities?.currentViewController() else {
        promise.reject(ClipVideoException("No screen to share from."))
        return
      }
      let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
      sheet.title = title
      if let popover = sheet.popoverPresentationController {
        // iPad: the sheet is a popover and needs an anchor.
        popover.sourceView = presenter.view
        popover.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.maxY, width: 1, height: 1)
        popover.permittedArrowDirections = []
      }
      sheet.completionWithItemsHandler = { _, _, _, _ in
        promise.resolve()
      }
      presenter.present(sheet, animated: true)
    }.runOnQueue(.main)
  }

  // MARK: - Input

  private static func job(from options: ClipVideoOptions) throws -> Job {
    let start = Int64(options.startMs.rounded())
    let end = Int64(options.endMs.rounded())
    guard end > start, start >= 0 else { throw ClipVideoException("The clip has no length.") }
    guard end - start <= maxMs else { throw ClipVideoException("A video can be at most 60 seconds.") }
    let raw = options.audioUri
    let audioURL: URL
    if raw.hasPrefix("file://"), let u = URL(string: raw) {
      audioURL = u
    } else if raw.hasPrefix("/") {
      audioURL = URL(fileURLWithPath: raw)
    } else {
      throw ClipVideoException("The episode's sound must be on the phone first.")
    }
    guard FileManager.default.fileExists(atPath: audioURL.path) else {
      throw ClipVideoException("The episode's sound file is missing.")
    }
    let p = options.palette
    let colours = Colours(
      background: colour(p?.background, "#fbf8f1"),
      text: colour(p?.text, "#16130d"),
      muted: colour(p?.muted, "#5c5546"),
      primary: colour(p?.primary, "#fcc522"),
      accent: colour(p?.accent, "#8a5a00")
    )
    return Job(
      audioURL: audioURL,
      startMs: start,
      endMs: end,
      coverUri: options.coverUri,
      title: options.title,
      show: options.show,
      heat: options.heat.map { $0.isFinite ? max(0, $0) : 0 },
      colours: colours
    )
  }

  // MARK: - The work

  private static func make(_ job: Job) async throws -> URL {
    let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
    let id = UUID().uuidString
    let silent = caches.appendingPathComponent("clip-\(id)-picture.mp4")
    let output = caches.appendingPathComponent("clip-\(id).mp4")
    defer { try? FileManager.default.removeItem(at: silent) }

    let cover = await loadCover(job.coverUri)
    let still = staticLayer(job, cover: cover)
    let duration = CMTime(value: job.endMs - job.startMs, timescale: 1000)
    try await writePicture(job, still: still, duration: duration, to: silent)
    try await mux(picture: silent, job: job, duration: duration, to: output)
    return output
  }

  private static func loadCover(_ uri: String?) async -> UIImage? {
    guard let uri, !uri.isEmpty, let url = URL(string: uri) else { return nil }
    if url.isFileURL { return UIImage(contentsOfFile: url.path) }
    guard url.scheme == "https" || url.scheme == "http" else { return nil }
    do {
      let (data, _) = try await URLSession.shared.data(from: url)
      return UIImage(data: data)
    } catch {
      return nil // no cover is not a reason to fail: a plain square is drawn instead
    }
  }

  /// Everything that does not move: page, cover, title, show, range, name. Drawn once.
  private static func staticLayer(_ job: Job, cover: UIImage?) -> CGImage? {
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = true
    let renderer = UIGraphicsImageRenderer(size: CGSize(width: width, height: height), format: format)
    let image = renderer.image { context in
      let c = job.colours
      c.background.setFill()
      context.fill(CGRect(x: 0, y: 0, width: width, height: height))

      let clip = UIBezierPath(roundedRect: coverRect, cornerRadius: 28)
      context.cgContext.saveGState()
      clip.addClip()
      if let cover, cover.size.width > 0, cover.size.height > 0 {
        // Aspect-fill the square.
        let scale = max(coverRect.width / cover.size.width, coverRect.height / cover.size.height)
        let w = cover.size.width * scale
        let h = cover.size.height * scale
        cover.draw(in: CGRect(x: coverRect.midX - w / 2, y: coverRect.midY - h / 2, width: w, height: h))
      } else {
        c.primary.setFill()
        UIRectFill(coverRect)
      }
      context.cgContext.restoreGState()

      let centred = NSMutableParagraphStyle()
      centred.alignment = .center
      centred.lineBreakMode = .byWordWrapping
      let serifBase = UIFont.systemFont(ofSize: 44, weight: .bold)
      let serif = serifBase.fontDescriptor.withDesign(.serif).map { UIFont(descriptor: $0, size: 44) } ?? serifBase
      (job.title as NSString).draw(
        with: titleRect,
        options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine],
        attributes: [.font: serif, .foregroundColor: c.text, .paragraphStyle: centred],
        context: nil
      )

      let oneLine = NSMutableParagraphStyle()
      oneLine.alignment = .center
      oneLine.lineBreakMode = .byTruncatingTail
      (job.show as NSString).draw(
        with: showRect,
        options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine],
        attributes: [.font: UIFont.systemFont(ofSize: 28, weight: .medium), .foregroundColor: c.muted, .paragraphStyle: oneLine],
        context: nil
      )
      ("\(mmss(job.startMs)) – \(mmss(job.endMs))" as NSString).draw(
        with: rangeRect,
        options: [.usesLineFragmentOrigin],
        attributes: [.font: UIFont.monospacedDigitSystemFont(ofSize: 24, weight: .regular), .foregroundColor: c.muted, .paragraphStyle: oneLine],
        context: nil
      )
      ("SocialNet" as NSString).draw(
        with: brandRect,
        options: [.usesLineFragmentOrigin],
        attributes: [.font: UIFont.systemFont(ofSize: 24, weight: .bold), .foregroundColor: c.accent, .paragraphStyle: oneLine],
        context: nil
      )
    }
    return image.cgImage
  }

  private static func writePicture(_ job: Job, still: CGImage?, duration: CMTime, to url: URL) async throws {
    try? FileManager.default.removeItem(at: url)
    let writer = try AVAssetWriter(outputURL: url, fileType: .mp4)
    let settings: [String: Any] = [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: width,
      AVVideoHeightKey: height,
      AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: 2_000_000,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
      ] as [String: Any],
    ]
    let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
    input.expectsMediaDataInRealTime = false
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(
      assetWriterInput: input,
      sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        kCVPixelBufferWidthKey as String: width,
        kCVPixelBufferHeightKey as String: height,
      ]
    )
    guard writer.canAdd(input) else { throw ClipVideoException("The video writer refused the picture track.") }
    writer.add(input)
    guard writer.startWriting() else { throw writer.error ?? ClipVideoException("The video writer did not start.") }
    writer.startSession(atSourceTime: .zero)

    let frames = max(1, Int((Double(job.endMs - job.startMs) / 1000.0 * Double(fps)).rounded(.up)))
    let peak = job.heat.max() ?? 0
    for frame in 0..<frames {
      while !input.isReadyForMoreMediaData {
        if writer.status == .failed { throw writer.error ?? ClipVideoException("The video writer failed.") }
        try await Task.sleep(nanoseconds: 2_000_000)
      }
      guard let pool = adaptor.pixelBufferPool else { throw ClipVideoException("No pixel buffer pool.") }
      var buffer: CVPixelBuffer?
      CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &buffer)
      guard let buffer else { throw ClipVideoException("No pixel buffer.") }
      let progress = frames > 1 ? CGFloat(frame) / CGFloat(frames - 1) : 1
      draw(into: buffer, still: still, job: job, peak: peak, progress: progress)
      if !adaptor.append(buffer, withPresentationTime: CMTime(value: CMTimeValue(frame), timescale: fps)) {
        throw writer.error ?? ClipVideoException("A frame could not be written.")
      }
    }
    input.markAsFinished()
    writer.endSession(atSourceTime: duration)
    await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
      writer.finishWriting { done.resume() }
    }
    if writer.status != .completed {
      throw writer.error ?? ClipVideoException("The video writer did not finish.")
    }
  }

  /// One frame: the still, then the heat bars (played ones in the yellow), the playhead and progress.
  private static func draw(into buffer: CVPixelBuffer, still: CGImage?, job: Job, peak: Double, progress: CGFloat) {
    CVPixelBufferLockBaseAddress(buffer, [])
    defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
    guard let ctx = CGContext(
      data: CVPixelBufferGetBaseAddress(buffer),
      width: width,
      height: height,
      bitsPerComponent: 8,
      bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
      space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue
    ) else { return }
    // Core Graphics draws from the bottom-left; flip so the layout reads from the top-left.
    ctx.translateBy(x: 0, y: CGFloat(height))
    ctx.scaleBy(x: 1, y: -1)
    let c = job.colours
    if let still {
      // In the flipped context an image would land upside down: flip it back for this one draw.
      ctx.saveGState()
      ctx.translateBy(x: 0, y: CGFloat(height))
      ctx.scaleBy(x: 1, y: -1)
      ctx.draw(still, in: CGRect(x: 0, y: 0, width: width, height: height))
      ctx.restoreGState()
    } else {
      ctx.setFillColor(c.background.cgColor)
      ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
    }

    let headX = heatRect.minX + heatRect.width * progress
    let bars = job.heat.count
    if bars == 0 || peak <= 0 {
      ctx.setFillColor(c.muted.withAlphaComponent(0.35).cgColor)
      ctx.fill(CGRect(x: heatRect.minX, y: heatRect.maxY - 4, width: heatRect.width, height: 4))
      ctx.setFillColor(c.primary.cgColor)
      ctx.fill(CGRect(x: heatRect.minX, y: heatRect.maxY - 4, width: headX - heatRect.minX, height: 4))
    } else {
      let gap: CGFloat = bars > 60 ? 1 : 4
      let barWidth = max(1, (heatRect.width - gap * CGFloat(bars - 1)) / CGFloat(bars))
      for (i, value) in job.heat.enumerated() {
        let x = heatRect.minX + CGFloat(i) * (barWidth + gap)
        let h = max(6, heatRect.height * CGFloat(value / peak))
        let played = x + barWidth / 2 <= headX
        ctx.setFillColor((played ? c.primary : c.muted.withAlphaComponent(0.35)).cgColor)
        ctx.fill(CGRect(x: x, y: heatRect.maxY - h, width: barWidth, height: h))
      }
    }
    ctx.setFillColor(c.text.cgColor)
    ctx.fill(CGRect(x: headX - 1.5, y: heatRect.minY - 6, width: 3, height: heatRect.height + 12))

    ctx.setFillColor(c.muted.withAlphaComponent(0.2).cgColor)
    ctx.fill(progressRect)
    ctx.setFillColor(c.accent.cgColor)
    ctx.fill(CGRect(x: progressRect.minX, y: progressRect.minY, width: progressRect.width * progress, height: progressRect.height))
  }

  private static func mux(picture: URL, job: Job, duration: CMTime, to output: URL) async throws {
    let composition = AVMutableComposition()
    let pictureAsset = AVURLAsset(url: picture)
    guard let pictureTrack = try await pictureAsset.loadTracks(withMediaType: .video).first else {
      throw ClipVideoException("The picture track is missing.")
    }
    let pictureRange = try await pictureTrack.load(.timeRange)
    guard let videoOut = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else {
      throw ClipVideoException("Couldn't add the picture track.")
    }
    try videoOut.insertTimeRange(
      CMTimeRange(start: .zero, duration: CMTimeMinimum(duration, pictureRange.duration)),
      of: pictureTrack,
      at: .zero
    )

    let audioAsset = AVURLAsset(url: job.audioURL)
    guard let audioTrack = try await audioAsset.loadTracks(withMediaType: .audio).first else {
      throw ClipVideoException("The episode file has no sound track.")
    }
    let audioLength = try await audioAsset.load(.duration)
    let start = CMTime(value: job.startMs, timescale: 1000)
    guard CMTimeCompare(start, audioLength) < 0 else { throw ClipVideoException("The clip starts after the episode ends.") }
    let audioDuration = CMTimeMinimum(duration, CMTimeSubtract(audioLength, start))
    guard let audioOut = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) else {
      throw ClipVideoException("Couldn't add the sound track.")
    }
    try audioOut.insertTimeRange(CMTimeRange(start: start, duration: audioDuration), of: audioTrack, at: .zero)

    try? FileManager.default.removeItem(at: output)
    guard let export = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else {
      throw ClipVideoException("Couldn't start the export.")
    }
    export.outputURL = output
    export.outputFileType = .mp4
    export.shouldOptimizeForNetworkUse = true
    await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
      export.exportAsynchronously { done.resume() }
    }
    guard export.status == .completed else {
      throw export.error ?? ClipVideoException("The export did not finish.")
    }
  }
}

// MARK: - Helpers

private func mmss(_ ms: Int64) -> String {
  let s = max(0, ms / 1000)
  return String(format: "%d:%02d", s / 60, s % 60)
}

/// `#rrggbb` → UIColor; anything else falls back.
private func colour(_ hex: String?, _ fallback: String) -> UIColor {
  func parse(_ s: String) -> UIColor? {
    var t = s.trimmingCharacters(in: .whitespaces)
    if t.hasPrefix("#") { t.removeFirst() }
    guard t.count == 6, let v = UInt32(t, radix: 16) else { return nil }
    return UIColor(
      red: CGFloat((v >> 16) & 0xff) / 255,
      green: CGFloat((v >> 8) & 0xff) / 255,
      blue: CGFloat(v & 0xff) / 255,
      alpha: 1
    )
  }
  return (hex.flatMap(parse)) ?? parse(fallback) ?? .black
}
