// Its own FileProvider class, so the manifest merge never clashes with another library's provider.
package expo.modules.clipvideo

import androidx.core.content.FileProvider

class ClipVideoFileProvider : FileProvider()
