// The system output switcher (Bluetooth, the speaker, a Cast device) from our own button.
//
// M21 US11 (FR-100, research R3; owner approved androidx.mediarouter by name at G0, 2026-10-06).
// SystemOutputSwitcherDialogController.showDialog(context) opens the phone's own output switcher
// (Android 11+ media output panel; the Bluetooth settings on older phones and on Wear). It returns
// false when nothing could be shown — the app then hides its route button.
package expo.modules.audioroute

import androidx.mediarouter.app.SystemOutputSwitcherDialogController
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AudioRouteModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AudioRoute")

    /** The module is in this build; whether a switcher can be shown is `showOutputSwitcher`'s answer. */
    Function("isAvailable") {
      true
    }

    /** Opens the system output switcher. False = this phone has none to show. */
    AsyncFunction("showOutputSwitcher") {
      val context = appContext.currentActivity ?: appContext.reactContext
      if (context == null) {
        false
      } else {
        SystemOutputSwitcherDialogController.showDialog(context)
      }
    }.runOnQueue(Queues.MAIN)
  }
}
