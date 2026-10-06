// M21 US12 — the Watch's two screens: the episodes the phone sent (with download state) and the
// player (play/pause, −15 / +30, time left). SwiftUI on the Watch only (owner, G0), in our colours
// (Theme) and English words (Words).
// NOT YET COMPILED here — the cloud ios.yml run with extras on is the first compile.
import SwiftUI

struct EpisodeListView: View {
  @EnvironmentObject var store: EpisodeStore

  var body: some View {
    NavigationStack {
      Group {
        if store.episodes.isEmpty {
          ScrollView {
            Text(Words.empty)
              .font(.footnote)
              .foregroundColor(Theme.muted)
              .multilineTextAlignment(.center)
              .padding()
          }
        } else {
          List {
            ForEach(store.episodes) { e in
              row(e)
                .listRowBackground(RoundedRectangle(cornerRadius: 12).fill(Theme.surface))
            }
            .onDelete { offsets in
              for i in offsets {
                let id = store.episodes[i].id
                Player.shared.close(id)
                Downloader.shared.cancel(id)
                store.remove(id)
              }
            }
          }
          .scrollContentBackground(.hidden)
        }
      }
      .background(Theme.background.ignoresSafeArea())
      .navigationTitle(Words.title)
    }
    .tint(Theme.accent)
  }

  @ViewBuilder
  private func row(_ e: WatchEpisode) -> some View {
    if e.state == .ready {
      NavigationLink {
        PlayerView(episodeId: e.id)
      } label: {
        EpisodeRow(episode: e)
      }
    } else if e.state == .failed {
      Button {
        EpisodeStore.shared.update(e.id) { $0.state = .queued }
        Downloader.shared.start(e.id)
      } label: {
        EpisodeRow(episode: e)
      }
      .accessibilityHint(Words.retry)
    } else {
      EpisodeRow(episode: e)
    }
  }
}

struct EpisodeRow: View {
  let episode: WatchEpisode

  private var status: String {
    switch episode.state {
    case .queued: return Words.queued
    case .downloading: return Words.percent(episode.progress)
    case .ready:
      if let d = episode.durationMs, d > 0 { return Words.left((d - episode.positionMs) / 1000) }
      return Words.ready
    case .failed: return "\(episode.failReason ?? Words.failed) · \(Words.retry)"
    }
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      if !episode.show.isEmpty {
        Text(episode.show)
          .font(.caption2.weight(.bold))
          .foregroundColor(Theme.accent)
          .lineLimit(1)
      }
      Text(episode.title)
        .font(.footnote.weight(.semibold))
        .foregroundColor(Theme.text)
        .lineLimit(3)
      Text(status)
        .font(.caption2)
        .foregroundColor(Theme.muted)
        .lineLimit(2)
    }
    .padding(.vertical, 4)
  }
}

struct PlayerView: View {
  let episodeId: String
  @EnvironmentObject var store: EpisodeStore
  @EnvironmentObject var player: Player

  var body: some View {
    let e = store.episode(episodeId)
    ScrollView {
      VStack(spacing: 8) {
        Text(e?.title ?? "")
          .font(.footnote.weight(.semibold))
          .foregroundColor(Theme.text)
          .multilineTextAlignment(.center)
          .lineLimit(3)
        Text(Words.left(player.duration - player.currentTime))
          .font(.caption2.monospacedDigit())
          .foregroundColor(Theme.muted)
        HStack(spacing: 10) {
          Button { player.skip(by: -15) } label: {
            Image(systemName: "gobackward.15")
              .font(.title3)
              .foregroundColor(Theme.accent)
              .frame(width: 44, height: 44)
          }
          .buttonStyle(.plain)
          .accessibilityLabel(Words.back15)

          Button { player.toggle() } label: {
            ZStack {
              Circle().fill(Theme.playDisc)
              Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
                .font(.title2)
                .foregroundColor(Theme.playGlyph)
            }
            .frame(width: 56, height: 56)
          }
          .buttonStyle(.plain)
          .accessibilityLabel(player.isPlaying ? Words.pause : Words.play)

          Button { player.skip(by: 30) } label: {
            Image(systemName: "goforward.30")
              .font(.title3)
              .foregroundColor(Theme.accent)
              .frame(width: 44, height: 44)
          }
          .buttonStyle(.plain)
          .accessibilityLabel(Words.forward30)
        }
        if let m = player.message {
          Text(m)
            .font(.caption2)
            .foregroundColor(Theme.text)
            .multilineTextAlignment(.center)
            .padding(6)
            .background(RoundedRectangle(cornerRadius: 8).fill(Theme.primary.opacity(0.35)))
        }
      }
      .padding(.horizontal, 4)
    }
    .background(Theme.background.ignoresSafeArea())
    .onAppear { player.open(episodeId) }
  }
}
