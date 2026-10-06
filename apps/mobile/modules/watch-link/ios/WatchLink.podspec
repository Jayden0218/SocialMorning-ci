Pod::Spec.new do |s|
  s.name           = 'WatchLink'
  s.version        = '1.0.0'
  s.summary        = 'The phone end of WatchConnectivity for the SocialNet Watch app (SocialNet local module).'
  s.description    = 'Tells the app whether a paired Watch has our app, sends it episodes, and passes back the positions it played to.'
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

  s.frameworks = 'WatchConnectivity'
  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
