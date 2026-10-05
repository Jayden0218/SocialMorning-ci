Pod::Spec.new do |s|
  s.name           = 'ClipVideo'
  s.version        = '1.0.0'
  s.summary        = 'A clip as a short video, made with AVFoundation (SocialNet local module).'
  s.description    = 'Draws the clip card frame by frame with AVAssetWriter and adds the clip audio with AVAssetExportSession.'
  s.author         = 'SocialNet'
  s.license        = 'UNLICENSED'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4'
  }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
