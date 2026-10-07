// Switches the launcher icon to one of our own designs by turning one activity-alias on and the rest off.
//
// M22 T076 (moved from M20 T070-T072). ../../plugin.js moves the launcher entry off MainActivity
// onto `.MainActivityDefault` and adds one disabled alias per icon (`.MainActivitySunrise`, …),
// each pointing at MainActivity, so deep links and every intent filter stay on MainActivity.
// Switching asks the launcher to redraw; many launchers close the app while doing so, which is
// why the app warns first ("The app will close to change its icon.").
package expo.modules.alternateicons

import android.content.ComponentName
import android.content.pm.PackageManager
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AlternateIconsModule : Module() {
  private val names = listOf("Sunrise", "Ocean", "Forest", "Plum")

  private fun component(pkg: String, name: String) = ComponentName(pkg, "$pkg.MainActivity$name")

  override fun definition() = ModuleDefinition {
    Name("AlternateIcons")

    /** True when this build's manifest has our aliases (the plugin ran). */
    AsyncFunction("supportsAlternateIcons") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      try {
        context.packageManager.getActivityInfo(component(context.packageName, "Default"), PackageManager.MATCH_DISABLED_COMPONENTS)
        true
      } catch (e: PackageManager.NameNotFoundException) {
        false
      }
    }

    /** The alternate icon in use, or null for the default. */
    AsyncFunction("getIconName") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val pm = context.packageManager
      names.firstOrNull { name ->
        pm.getComponentEnabledSetting(component(context.packageName, name)) == PackageManager.COMPONENT_ENABLED_STATE_ENABLED
      }
    }

    /** null puts the default icon back. The new alias is enabled before the others are disabled. */
    AsyncFunction("setIconName") { name: String? ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val pm = context.packageManager
      val pkg = context.packageName
      val chosen = if (name != null && names.contains(name)) name else "Default"
      pm.setComponentEnabledSetting(component(pkg, chosen), PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP)
      for (other in names + "Default") {
        if (other == chosen) continue
        pm.setComponentEnabledSetting(component(pkg, other), PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP)
      }
      if (chosen == "Default") null else chosen
    }
  }
}
