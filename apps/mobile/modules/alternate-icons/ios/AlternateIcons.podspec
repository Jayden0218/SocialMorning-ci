Pod::Spec.new do |s|
  s.name           = 'AlternateIcons'
  s.version        = '1.0.0'
  s.summary        = 'Switch the app icon to one of our own designs (SocialNet local module).'
  s.description    = 'Wraps UIApplication.setAlternateIconName; the icons are added to the asset catalog by ../plugin.js.'
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
