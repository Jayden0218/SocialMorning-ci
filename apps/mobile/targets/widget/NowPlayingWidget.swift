// M10b US9 — the iPhone widget. It reads the card the app writes to the App Group
// (src/outside/ios.ts: key "nowPlaying") and opens the player when tapped. Play/pause from
// the widget itself is Android-only for now: on iPhone it would need an audio App Intent
// inside the app target. NOT YET COMPILED (no paid Apple team).
import SwiftUI
import WidgetKit

private let appGroup = "group.app.socialmorning.mobile"

struct NowPlayingCard {
  let title: String
  let show: String
  let playing: Bool
  let comment: String

  static func read() -> NowPlayingCard? {
    guard let d = UserDefaults(suiteName: appGroup)?.dictionary(forKey: "nowPlaying"),
          let title = d["title"] as? String else { return nil }
    return NowPlayingCard(
      title: title,
      show: d["show"] as? String ?? "",
      playing: (d["playing"] as? Int ?? 0) == 1,
      comment: d["comment"] as? String ?? ""
    )
  }
}

struct Entry: TimelineEntry {
  let date: Date
  let card: NowPlayingCard?
}

struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> Entry { Entry(date: .now, card: nil) }
  func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
    completion(Entry(date: .now, card: NowPlayingCard.read()))
  }
  // The app reloads the timeline on every change (ExtensionStorage.reloadWidget), so one entry is enough.
  func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
    completion(Timeline(entries: [Entry(date: .now, card: NowPlayingCard.read())], policy: .never))
  }
}

struct NowPlayingView: View {
  let entry: Entry
  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      if let card = entry.card {
        Text(card.title).font(.headline).lineLimit(2)
        Text(card.show).font(.caption).foregroundStyle(.secondary).lineLimit(1)
        if !card.comment.isEmpty {
          Text(card.comment).font(.caption).lineLimit(2)
        }
        Spacer(minLength: 0)
        Label(card.playing ? "Playing" : "Paused", systemImage: card.playing ? "pause.fill" : "play.fill")
          .font(.caption2).foregroundStyle(.secondary)
      } else {
        Text("SocialNet").font(.headline)
        Text("Nothing playing").font(.caption).foregroundStyle(.secondary)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .widgetURL(URL(string: "socialmorning://player"))
    .containerBackground(.background, for: .widget)
  }
}

// M21 US11: one of four widgets in the bundle (`SocialNetWidgets.swift` holds the @main).
struct NowPlayingWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "NowPlayingWidget", provider: Provider()) { entry in
      NowPlayingView(entry: entry)
    }
    .configurationDisplayName("Now playing")
    .description("The episode you are listening to.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}
