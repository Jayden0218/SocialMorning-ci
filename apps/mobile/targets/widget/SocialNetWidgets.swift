// M21 US11 (FR-104, research R9) — the widget target becomes a bundle of four widgets, each its
// own kind: Now playing (M10b), Playlist (the next 3), Daily pick, Listening this week. They read
// what the app writes to the App Group (src/outside/ios.ts: keys "nowPlaying", "playlistNext3",
// "dailyPick", "weekListening"). Daily pick and Listening this week also refresh at midnight, so a
// new week shows 0 min even before the app runs again. A tap opens the app.
// SwiftUI is the only way to draw a home-screen widget; styled like the M10b widget.
// NOT YET COMPILED here — the cloud ios.yml run with extras on is the first compile.
import SwiftUI
import WidgetKit

private let sharedGroup = "group.app.socialmorning.mobile"

private func shared(_ key: String) -> [String: Any]? {
  UserDefaults(suiteName: sharedGroup)?.dictionary(forKey: key)
}

private func nextMidnight(after date: Date) -> Date {
  let start = Calendar.current.startOfDay(for: date)
  return Calendar.current.date(byAdding: .day, value: 1, to: start) ?? date.addingTimeInterval(86_400)
}

/// This week's Monday as `yyyy-MM-dd` in the phone's zone — the same key the app writes.
private func weekStartKey(_ date: Date) -> String {
  var calendar = Calendar(identifier: .gregorian)
  calendar.timeZone = .current
  calendar.firstWeekday = 2
  let start = calendar.dateInterval(of: .weekOfYear, for: date)?.start ?? calendar.startOfDay(for: date)
  let formatter = DateFormatter()
  formatter.calendar = calendar
  formatter.locale = Locale(identifier: "en_US_POSIX")
  formatter.timeZone = .current
  formatter.dateFormat = "yyyy-MM-dd"
  return formatter.string(from: start)
}

@main
struct SocialNetWidgets: WidgetBundle {
  var body: some Widget {
    NowPlayingWidget()
    PlaylistWidget()
    DailyPickWidget()
    WeekListeningWidget()
  }
}

// MARK: Playlist — the next 3

struct PlaylistItem: Hashable {
  let title: String
  let show: String
}

struct PlaylistEntry: TimelineEntry {
  let date: Date
  let items: [PlaylistItem]

  static func read(at date: Date) -> PlaylistEntry {
    guard let d = shared("playlistNext3") else {
      return PlaylistEntry(date: date, items: [])
    }
    let count = min(d["count"] as? Int ?? 0, 3)
    let items = (0..<max(count, 0)).compactMap { i -> PlaylistItem? in
      guard let title = d["title\(i)"] as? String else { return nil }
      return PlaylistItem(title: title, show: d["show\(i)"] as? String ?? "")
    }
    return PlaylistEntry(date: date, items: items)
  }
}

struct PlaylistProvider: TimelineProvider {
  func placeholder(in context: Context) -> PlaylistEntry { PlaylistEntry(date: .now, items: []) }
  func getSnapshot(in context: Context, completion: @escaping (PlaylistEntry) -> Void) {
    completion(PlaylistEntry.read(at: .now))
  }
  // The app reloads this kind whenever the queue's next 3 change.
  func getTimeline(in context: Context, completion: @escaping (Timeline<PlaylistEntry>) -> Void) {
    completion(Timeline(entries: [PlaylistEntry.read(at: .now)], policy: .never))
  }
}

struct PlaylistView: View {
  let entry: PlaylistEntry
  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text("Up next").font(.caption).foregroundStyle(.secondary)
      if entry.items.isEmpty {
        Text("Your playlist is empty").font(.headline).lineLimit(2)
      } else {
        ForEach(Array(entry.items.enumerated()), id: \.offset) { pair in
          VStack(alignment: .leading, spacing: 0) {
            Text(pair.element.title).font(.subheadline).lineLimit(1)
            Text(pair.element.show).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
          }
        }
      }
      Spacer(minLength: 0)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .widgetURL(URL(string: "socialmorning://player"))
    .containerBackground(.background, for: .widget)
  }
}

struct PlaylistWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "PlaylistWidget", provider: PlaylistProvider()) { entry in
      PlaylistView(entry: entry)
    }
    .configurationDisplayName("Playlist")
    .description("The next three episodes in your playlist.")
    .supportedFamilies([.systemMedium, .systemLarge])
  }
}

// MARK: Daily pick

struct DailyPickEntry: TimelineEntry {
  let date: Date
  let title: String?
  let show: String
  let why: String

  static func read(at date: Date) -> DailyPickEntry {
    guard let d = shared("dailyPick"), (d["has"] as? Int ?? 0) == 1, let title = d["title"] as? String else {
      return DailyPickEntry(date: date, title: nil, show: "", why: "")
    }
    return DailyPickEntry(date: date, title: title, show: d["show"] as? String ?? "", why: d["why"] as? String ?? "")
  }
}

struct DailyPickProvider: TimelineProvider {
  func placeholder(in context: Context) -> DailyPickEntry { DailyPickEntry(date: .now, title: nil, show: "", why: "") }
  func getSnapshot(in context: Context, completion: @escaping (DailyPickEntry) -> Void) {
    completion(DailyPickEntry.read(at: .now))
  }
  // Read again at midnight: the app may have saved the new day's pick since.
  func getTimeline(in context: Context, completion: @escaping (Timeline<DailyPickEntry>) -> Void) {
    let now = Date.now
    completion(Timeline(entries: [DailyPickEntry.read(at: now)], policy: .after(nextMidnight(after: now))))
  }
}

struct DailyPickView: View {
  let entry: DailyPickEntry
  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text("Today's pick").font(.caption).foregroundStyle(.secondary)
      if let title = entry.title {
        Text(title).font(.headline).lineLimit(3)
        Text(entry.show).font(.caption).foregroundStyle(.secondary).lineLimit(1)
        if !entry.why.isEmpty {
          Text(entry.why).font(.caption2).lineLimit(2)
        }
      } else {
        Text("Open SocialNet for today's pick").font(.subheadline).lineLimit(3)
      }
      Spacer(minLength: 0)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .widgetURL(URL(string: "socialmorning://"))
    .containerBackground(.background, for: .widget)
  }
}

struct DailyPickWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "DailyPickWidget", provider: DailyPickProvider()) { entry in
      DailyPickView(entry: entry)
    }
    .configurationDisplayName("Daily pick")
    .description("The editors' pick of the day.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

// MARK: Listening this week

struct WeekEntry: TimelineEntry {
  let date: Date
  let minutes: Int

  /// The saved total counts only if it is for this week; from Monday it is 0 until the app writes.
  static func read(at date: Date) -> WeekEntry {
    guard let d = shared("weekListening"), let start = d["weekStart"] as? String, start == weekStartKey(date) else {
      return WeekEntry(date: date, minutes: 0)
    }
    return WeekEntry(date: date, minutes: d["minutes"] as? Int ?? 0)
  }

  var label: String {
    let h = minutes / 60
    let m = minutes % 60
    if h == 0 { return "\(m) min" }
    return m == 0 ? "\(h) h" : "\(h) h \(m) min"
  }
}

struct WeekProvider: TimelineProvider {
  func placeholder(in context: Context) -> WeekEntry { WeekEntry(date: .now, minutes: 0) }
  func getSnapshot(in context: Context, completion: @escaping (WeekEntry) -> Void) {
    completion(WeekEntry.read(at: .now))
  }
  func getTimeline(in context: Context, completion: @escaping (Timeline<WeekEntry>) -> Void) {
    let now = Date.now
    completion(Timeline(entries: [WeekEntry.read(at: now)], policy: .after(nextMidnight(after: now))))
  }
}

struct WeekView: View {
  let entry: WeekEntry
  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text("Listening this week").font(.caption).foregroundStyle(.secondary)
      Text(entry.label).font(.title2).bold().lineLimit(1).minimumScaleFactor(0.6)
      Spacer(minLength: 0)
      Text("On this phone, from Monday").font(.caption2).foregroundStyle(.secondary).lineLimit(2)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .widgetURL(URL(string: "socialmorning://"))
    .containerBackground(.background, for: .widget)
  }
}

struct WeekListeningWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "WeekListeningWidget", provider: WeekProvider()) { entry in
      WeekView(entry: entry)
    }
    .configurationDisplayName("Listening this week")
    .description("How long you have listened since Monday.")
    .supportedFamilies([.systemSmall])
  }
}
