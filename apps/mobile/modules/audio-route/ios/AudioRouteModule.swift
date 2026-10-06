// The system audio-route picker (AirPlay, Bluetooth, the speaker) under our own icon.
//
// M21 US11 (FR-100, research R3; owner approved at G0, 2026-10-06). iOS has no public API that
// lists routes, so the list itself is Apple's own UI. The BUTTON is ours: `AudioRouteView` is an
// AVRoutePickerView whose tints are clear — invisible but still tappable — laid by the app over
// its own Ionicons icon. A tap opens the system route list.
// Rejected: expo-video's VideoAirPlayButton (it draws Apple's AirPlay glyph).

import AVKit
import ExpoModulesCore
import UIKit

public class AudioRouteModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AudioRoute")

    /// iOS always has the picker; Android answers from `showOutputSwitcher`.
    Function("isAvailable") { () -> Bool in
      true
    }

    View(AudioRouteView.self) {
      /// What VoiceOver says for the (invisible) system button.
      Prop("label") { (view: AudioRouteView, label: String?) in
        view.setLabel(label)
      }
    }
  }
}

public class AudioRouteView: ExpoView {
  private let picker = AVRoutePickerView()

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    picker.tintColor = .clear
    picker.activeTintColor = .clear
    picker.backgroundColor = .clear
    picker.prioritizesVideoDevices = false
    picker.accessibilityLabel = "Audio output"
    backgroundColor = .clear
    clipsToBounds = true
    addSubview(picker)
  }

  public required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  func setLabel(_ label: String?) {
    picker.accessibilityLabel = label ?? "Audio output"
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    picker.frame = bounds
  }
}
