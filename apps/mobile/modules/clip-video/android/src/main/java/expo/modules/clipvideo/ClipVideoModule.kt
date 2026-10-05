// A clip as a short video, made with the phone's own encoders (Media3 Transformer), and shared.
//
// M19 (owner, 2026-10-05). No FFmpeg: androidx.media3 Transformer 1.9.1 (Apache-2.0), the same
// Media3 version expo-audio already ships. The composition is the shape Transformer's own docs
// give (Transformer.start): sequence 1 = one image (the still page: cover, title, show) shown for
// the clip's length at 15 fps, with a CanvasOverlay that draws the heat bars and a moving
// playhead on every frame; sequence 2 = the clip's range of the LOCAL episode file, audio only.
// Output: H.264 + AAC in cacheDir/clip-video/clip-<uuid>.mp4.
//
// Transformer must be built and started on a thread with a Looper: everything that touches it
// runs on the main thread, and its listener settles the promise.
//
// M20: `captions` (transcript lines drawn by the overlay in the title's place, US1) and
// `encodeAudio` (a voice recording's WAV → mono AAC 64 kbit/s .m4a for the 600 000-byte cap, US3).
package expo.modules.clipvideo

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import android.text.TextUtils
import androidx.annotation.OptIn
import androidx.core.content.FileProvider
import androidx.media3.common.Effect
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.CanvasOverlay
import androidx.media3.effect.OverlayEffect
import androidx.media3.effect.TextureOverlay
import androidx.media3.transformer.AudioEncoderSettings
import androidx.media3.transformer.Composition
import androidx.media3.transformer.DefaultEncoderFactory
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.EditedMediaItemSequence
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Transformer
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import kotlin.math.max

class ClipVideoPalette : Record {
  @Field val background: String = "#fbf8f1"
  @Field val text: String = "#16130d"
  @Field val muted: String = "#5c5546"
  @Field val primary: String = "#fcc522"
  @Field val accent: String = "#8a5a00"
}

class ClipVideoOptions : Record {
  @Field val audioUri: String = ""
  @Field val startMs: Double = 0.0
  @Field val endMs: Double = 0.0
  @Field val coverUri: String? = null
  @Field val title: String = ""
  @Field val show: String = ""
  @Field val heat: List<Double> = emptyList()
  @Field val palette: ClipVideoPalette? = null
  /** M20 US1: lines from the transcript, each shown from its moment (episode ms) until the next. */
  @Field val captions: List<ClipVideoCaption> = emptyList()
}

class ClipVideoCaption : Record {
  @Field val atMs: Double = 0.0
  @Field val text: String = ""
}

private const val WIDTH = 720
private const val HEIGHT = 1280
private const val FPS = 15
private const val MAX_MS = 60_000L
private const val ERR = "ERR_CLIP_VIDEO"
private const val VOICE_BITRATE = 64_000

// Layout, in pixels of the 720×1280 frame (the overlay scales if the frame arrives at another size).
private val COVER = RectF(110f, 140f, 610f, 640f)
private val TITLE = RectF(60f, 690f, 660f, 850f)
private val SHOW_Y = 895f
private val HEAT = RectF(60f, 950f, 660f, 1100f)
private val PROGRESS = RectF(60f, 1130f, 660f, 1136f)
private val RANGE_Y = 1176f
private val BRAND_Y = 1232f

internal data class Colours(val background: Int, val text: Int, val muted: Int, val primary: Int, val accent: Int)

@OptIn(markerClass = [UnstableApi::class])
class ClipVideoModule : Module() {
  private val main = Handler(Looper.getMainLooper())
  /** Held while an export runs, so nothing collects it mid-way. */
  private var running: Transformer? = null

  override fun definition() = ModuleDefinition {
    Name("ClipVideo")

    AsyncFunction("makeClipVideo") { options: ClipVideoOptions, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject(ERR, "The app is not ready.", null)
      } else {
        try {
          prepare(context, options, promise)
        } catch (e: Throwable) {
          promise.reject(ERR, e.message ?: "Couldn't make the video.", e)
        }
      }
    }

    AsyncFunction("shareVideo") { uri: String, title: String, promise: Promise ->
      val activity = appContext.currentActivity
      val path = Uri.parse(uri).path
      val file = if (path != null) File(path) else null
      if (activity == null) {
        promise.reject(ERR, "No screen to share from.", null)
      } else if (file == null || !file.exists()) {
        promise.reject(ERR, "The video file is missing.", null)
      } else {
        try {
          val contentUri = FileProvider.getUriForFile(activity, "${activity.packageName}.clipvideo", file)
          val send = Intent(Intent.ACTION_SEND).apply {
            type = "video/mp4"
            putExtra(Intent.EXTRA_STREAM, contentUri)
            putExtra(Intent.EXTRA_TITLE, title)
            clipData = ClipData.newRawUri(title, contentUri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
          }
          val chooser = Intent.createChooser(send, title).apply {
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
          }
          activity.startActivity(chooser)
          promise.resolve()
        } catch (e: Throwable) {
          promise.reject(ERR, e.message ?: "Couldn't share the video.", e)
        }
      }
    }.runOnQueue(Queues.MAIN)

    // M20 US3 (research R1): a voice recording (16 kHz WAV from the speech service) → mono AAC at
    // 64 kbit/s in an .m4a, so 60 s stays under the server's 600 000-byte voice cap.
    AsyncFunction("encodeAudio") { uri: String, promise: Promise ->
      val context = appContext.reactContext
      val input = localFile(uri)
      if (context == null) {
        promise.reject(ERR, "The app is not ready.", null)
      } else if (input == null || !input.exists()) {
        promise.reject(ERR, "The recording file is missing.", null)
      } else {
        main.post {
          try {
            encode(context, input, promise)
          } catch (e: Throwable) {
            promise.reject(ERR, e.message ?: "Couldn't prepare the recording.", e)
          }
        }
      }
    }
  }

  /** On the main thread (Transformer's looper): WAV in, AAC .m4a out, then the WAV is deleted. */
  private fun encode(context: Context, input: File, promise: Promise) {
    val dir = File(context.cacheDir, "voice").apply { mkdirs() }
    val output = File(dir, "voice-${UUID.randomUUID()}.m4a")
    val item = EditedMediaItem.Builder(MediaItem.fromUri(Uri.fromFile(input))).setRemoveVideo(true).build()
    val encoders = DefaultEncoderFactory.Builder(context)
      .setRequestedAudioEncoderSettings(AudioEncoderSettings.Builder().setBitrate(VOICE_BITRATE).build())
      .build()
    val transformer = Transformer.Builder(context)
      .setAudioMimeType(MimeTypes.AUDIO_AAC)
      .setEncoderFactory(encoders)
      .addListener(object : Transformer.Listener {
        override fun onCompleted(composition: Composition, exportResult: ExportResult) {
          running = null
          input.delete()
          promise.resolve(mapOf("uri" to Uri.fromFile(output).toString(), "bytes" to output.length().toDouble()))
        }

        override fun onError(composition: Composition, exportResult: ExportResult, exportException: ExportException) {
          running = null
          output.delete()
          promise.reject(ERR, "Couldn't prepare the recording: ${exportException.message}", exportException)
        }
      })
      .build()
    running = transformer
    transformer.start(item, output.absolutePath)
  }

  /** Off the main thread: check, fetch the cover, draw the still; then start Transformer on main. */
  private fun prepare(context: Context, options: ClipVideoOptions, promise: Promise) {
    val startMs = Math.round(options.startMs)
    val endMs = Math.round(options.endMs)
    val lengthMs = endMs - startMs
    require(startMs >= 0 && lengthMs > 0) { "The clip has no length." }
    require(lengthMs <= MAX_MS) { "A video can be at most 60 seconds." }
    val audio = localFile(options.audioUri) ?: throw IllegalArgumentException("The episode's sound must be on the phone first.")
    require(audio.exists()) { "The episode's sound file is missing." }

    val p = options.palette
    val colours = Colours(
      background = colour(p?.background, "#fbf8f1"),
      text = colour(p?.text, "#16130d"),
      muted = colour(p?.muted, "#5c5546"),
      primary = colour(p?.primary, "#fcc522"),
      accent = colour(p?.accent, "#8a5a00"),
    )
    val dir = File(context.cacheDir, "clip-video").apply { mkdirs() }
    val id = UUID.randomUUID().toString()
    val still = File(dir, "clip-$id-still.png")
    val output = File(dir, "clip-$id.mp4")

    val cover = loadCover(options.coverUri)
    val page = drawStill(options, startMs, endMs, cover, colours)
    FileOutputStream(still).use { page.compress(Bitmap.CompressFormat.PNG, 100, it) }
    page.recycle()
    cover?.recycle()

    val heat = options.heat.map { if (it.isFinite()) max(0.0, it) else 0.0 }
    val captions = options.captions
      .filter { it.text.isNotBlank() && it.atMs.isFinite() }
      .map { Math.round(it.atMs) to it.text.trim() }
      .sortedBy { it.first }
    main.post {
      try {
        export(context, audio, still, output, startMs, endMs, heat, colours, captions, promise)
      } catch (e: Throwable) {
        still.delete()
        promise.reject(ERR, e.message ?: "Couldn't make the video.", e)
      }
    }
  }

  /** On the main thread (Transformer's looper). */
  private fun export(
    context: Context,
    audio: File,
    still: File,
    output: File,
    startMs: Long,
    endMs: Long,
    heat: List<Double>,
    colours: Colours,
    captions: List<Pair<Long, String>>,
    promise: Promise,
  ) {
    val lengthMs = endMs - startMs
    val stillItem = MediaItem.Builder()
      .setUri(Uri.fromFile(still))
      .setMimeType(MimeTypes.IMAGE_PNG)
      .setImageDurationMs(lengthMs)
      .build()
    val overlay = HeatOverlay(heat, lengthMs * 1000L, colours, captions, startMs)
    val picture = EditedMediaItem.Builder(stillItem)
      .setFrameRate(FPS)
      .setEffects(Effects(emptyList<AudioProcessor>(), listOf<Effect>(OverlayEffect(listOf<TextureOverlay>(overlay)))))
      .build()

    val audioItem = MediaItem.Builder()
      .setUri(Uri.fromFile(audio))
      .setClippingConfiguration(
        MediaItem.ClippingConfiguration.Builder()
          .setStartPositionMs(startMs)
          .setEndPositionMs(endMs)
          .build()
      )
      .build()
    val sound = EditedMediaItem.Builder(audioItem).setRemoveVideo(true).build()

    val composition = Composition.Builder(
      listOf(
        EditedMediaItemSequence.withVideoFrom(listOf(picture)),
        EditedMediaItemSequence.withAudioFrom(listOf(sound)),
      )
    ).build()

    val transformer = Transformer.Builder(context)
      .setVideoMimeType(MimeTypes.VIDEO_H264)
      .setAudioMimeType(MimeTypes.AUDIO_AAC)
      .addListener(object : Transformer.Listener {
        override fun onCompleted(composition: Composition, exportResult: ExportResult) {
          running = null
          still.delete()
          promise.resolve(mapOf("uri" to Uri.fromFile(output).toString()))
        }

        override fun onError(composition: Composition, exportResult: ExportResult, exportException: ExportException) {
          running = null
          still.delete()
          output.delete()
          promise.reject(ERR, "Couldn't make the video: ${exportException.message}", exportException)
        }
      })
      .build()
    running = transformer
    transformer.start(composition, output.absolutePath)
  }

  private fun localFile(uri: String): File? = when {
    uri.startsWith("file://") -> Uri.parse(uri).path?.let { File(it) }
    uri.startsWith("/") -> File(uri)
    else -> null
  }

  /** The cover, or null — no cover is not a reason to fail (a plain square is drawn). */
  private fun loadCover(uri: String?): Bitmap? {
    if (uri.isNullOrEmpty()) return null
    return try {
      if (uri.startsWith("http://") || uri.startsWith("https://")) {
        val connection = URL(uri).openConnection() as HttpURLConnection
        connection.connectTimeout = 10_000
        connection.readTimeout = 15_000
        connection.instanceFollowRedirects = true
        try {
          connection.inputStream.use { BitmapFactory.decodeStream(it) }
        } finally {
          connection.disconnect()
        }
      } else {
        localFile(uri)?.let { BitmapFactory.decodeFile(it.absolutePath) }
      }
    } catch (e: Throwable) {
      null
    }
  }

  /** Everything that does not move: page, cover, title, show, range, name. */
  private fun drawStill(options: ClipVideoOptions, startMs: Long, endMs: Long, cover: Bitmap?, c: Colours): Bitmap {
    val bitmap = Bitmap.createBitmap(WIDTH, HEIGHT, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    canvas.drawColor(c.background)

    val save = canvas.save()
    val clip = android.graphics.Path().apply { addRoundRect(COVER, 28f, 28f, android.graphics.Path.Direction.CW) }
    canvas.clipPath(clip)
    if (cover != null && cover.width > 0 && cover.height > 0) {
      // Aspect-fill: crop the middle of the cover to a square.
      val side = minOf(cover.width, cover.height)
      val src = Rect((cover.width - side) / 2, (cover.height - side) / 2, (cover.width + side) / 2, (cover.height + side) / 2)
      canvas.drawBitmap(cover, src, COVER, Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG))
    } else {
      canvas.drawColor(c.primary)
    }
    canvas.restoreToCount(save)

    val titlePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
      color = c.text
      textSize = 44f
      typeface = Typeface.create(Typeface.SERIF, Typeface.BOLD)
    }
    // M20 US1: with captions the moving lines take the title's place (drawn by the overlay).
    val title = if (options.captions.any { it.text.isNotBlank() }) "" else options.title
    val layout = StaticLayout.Builder.obtain(title, 0, title.length, titlePaint, TITLE.width().toInt())
      .setAlignment(Layout.Alignment.ALIGN_CENTER)
      .setMaxLines(3)
      .setEllipsize(TextUtils.TruncateAt.END)
      .build()
    canvas.save()
    canvas.translate(TITLE.left, TITLE.top)
    layout.draw(canvas)
    canvas.restore()

    val centred = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
      textAlign = Paint.Align.CENTER
      color = c.muted
      textSize = 28f
      typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.NORMAL)
    }
    val show = TextUtils.ellipsize(options.show, centred, TITLE.width(), TextUtils.TruncateAt.END).toString()
    canvas.drawText(show, WIDTH / 2f, SHOW_Y, centred)

    centred.textSize = 24f
    canvas.drawText("${mmss(startMs)} – ${mmss(endMs)}", WIDTH / 2f, RANGE_Y, centred)

    centred.color = c.accent
    centred.typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD)
    canvas.drawText("SocialNet", WIDTH / 2f, BRAND_Y, centred)
    return bitmap
  }
}

/**
 * Drawn on every frame over the still: the heat bars (played ones in the yellow), the playhead and
 * the progress line. The first frame's time is taken as the clip's 0, whatever offset Transformer uses.
 */
@OptIn(markerClass = [UnstableApi::class])
internal class HeatOverlay(
  private val heat: List<Double>,
  private val durationUs: Long,
  private val c: Colours,
  /** M20 US1: (episode ms, text), sorted; the one at or before "now" is drawn in the title's place. */
  private val captions: List<Pair<Long, String>> = emptyList(),
  private val startMs: Long = 0L,
) : CanvasOverlay(/* useInputFrameSize= */ true) {
  private val captionPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
    color = c.text
    textSize = 40f
    typeface = Typeface.create(Typeface.SERIF, Typeface.BOLD)
  }
  private val layouts = HashMap<Int, StaticLayout>()
  private var originUs = Long.MIN_VALUE
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val peak = heat.maxOrNull() ?: 0.0

  override fun onDraw(canvas: Canvas, presentationTimeUs: Long) {
    if (originUs == Long.MIN_VALUE) originUs = presentationTimeUs
    // The last frame starts one frame before the end; count it as the end.
    val frameUs = 1_000_000L / FPS
    val span = max(1L, durationUs - frameUs).toFloat()
    val progress = ((presentationTimeUs - originUs).toFloat() / span).coerceIn(0f, 1f)

    canvas.drawColor(Color.TRANSPARENT, PorterDuff.Mode.CLEAR)
    canvas.save()
    canvas.scale(canvas.width / WIDTH.toFloat(), canvas.height / HEIGHT.toFloat())

    val headX = HEAT.left + HEAT.width() * progress
    val faint = withAlpha(c.muted, 0.35f)
    if (heat.isEmpty() || peak <= 0.0) {
      paint.color = faint
      canvas.drawRect(HEAT.left, HEAT.bottom - 4f, HEAT.right, HEAT.bottom, paint)
      paint.color = c.primary
      canvas.drawRect(HEAT.left, HEAT.bottom - 4f, headX, HEAT.bottom, paint)
    } else {
      val n = heat.size
      val gap = if (n > 60) 1f else 4f
      val barWidth = max(1f, (HEAT.width() - gap * (n - 1)) / n)
      heat.forEachIndexed { i, value ->
        val x = HEAT.left + i * (barWidth + gap)
        val h = max(6f, (HEAT.height() * (value / peak)).toFloat())
        paint.color = if (x + barWidth / 2f <= headX) c.primary else faint
        canvas.drawRect(x, HEAT.bottom - h, x + barWidth, HEAT.bottom, paint)
      }
    }
    paint.color = c.text
    canvas.drawRect(headX - 1.5f, HEAT.top - 6f, headX + 1.5f, HEAT.bottom + 6f, paint)

    if (captions.isNotEmpty()) {
      val nowMs = startMs + ((presentationTimeUs - originUs) / 1000L)
      val index = captions.indexOfLast { it.first <= nowMs }.let { if (it < 0) 0 else it }
      val layout = layouts.getOrPut(index) {
        val text = captions[index].second
        StaticLayout.Builder.obtain(text, 0, text.length, captionPaint, TITLE.width().toInt())
          .setAlignment(Layout.Alignment.ALIGN_CENTER)
          .setMaxLines(3)
          .setEllipsize(TextUtils.TruncateAt.END)
          .build()
      }
      canvas.save()
      canvas.translate(TITLE.left, TITLE.top + max(0f, (TITLE.height() - layout.height) / 2f))
      layout.draw(canvas)
      canvas.restore()
    }

    paint.color = withAlpha(c.muted, 0.2f)
    canvas.drawRect(PROGRESS, paint)
    paint.color = c.accent
    canvas.drawRect(PROGRESS.left, PROGRESS.top, PROGRESS.left + PROGRESS.width() * progress, PROGRESS.bottom, paint)
    canvas.restore()
  }
}

private fun withAlpha(colour: Int, alpha: Float): Int =
  Color.argb((alpha * 255).toInt(), Color.red(colour), Color.green(colour), Color.blue(colour))

private fun mmss(ms: Long): String {
  val s = max(0L, ms / 1000)
  return "%d:%02d".format(s / 60, s % 60)
}

/** `#rrggbb` → a colour int; anything else falls back. */
private fun colour(hex: String?, fallback: String): Int =
  try {
    Color.parseColor(hex ?: fallback)
  } catch (e: IllegalArgumentException) {
    Color.parseColor(fallback)
  }
