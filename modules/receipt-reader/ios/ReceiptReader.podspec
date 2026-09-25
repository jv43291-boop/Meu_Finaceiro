Pod::Spec.new do |s|
  s.name           = 'ReceiptReader'
  s.version        = '1.0.0'
  s.summary        = 'Leitura de comprovantes no aparelho'
  s.description    = 'Converte PDF em imagem e lê o texto com a posição de cada linha'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true
  s.frameworks     = 'PDFKit', 'Vision'

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
