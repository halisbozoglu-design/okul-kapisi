# MİMAROS mobil test derlemeleri

Tek kod tabanı üç ayrı çıktı üretir:

- Web/PWA: `npm run build:web`
- Android: APK + AAB
- iOS: Ad Hoc imzalı IPA

## Android

GitHub Actions > **Android APK + AAB** workflow'u otomatik veya elle çalıştırılır.

Üretilen artifactler:

- `mimaros-android-apk` -> doğrudan Android cihaza kurulabilir debug APK
- `mimaros-android-aab` -> Android test/mağaza paket hattı için AAB

## iOS Ad Hoc IPA

iPhone'a dışarıdan kurulabilir IPA üretmek için Apple Developer hesabında cihaz UDID'si kayıtlı olmalı ve `tr.mimaros.okulkapisi` bundle id'si için Ad Hoc provisioning profile oluşturulmalıdır.

GitHub repository > Settings > Secrets and variables > Actions bölümüne şu secrets eklenir:

- `APPLE_CERTIFICATE_BASE64`: Apple Distribution `.p12` dosyasının base64 içeriği
- `APPLE_CERTIFICATE_PASSWORD`: `.p12` şifresi
- `APPLE_PROVISION_PROFILE_BASE64`: Ad Hoc `.mobileprovision` dosyasının base64 içeriği
- `APPLE_TEAM_ID`: Apple Developer Team ID

Sonra GitHub Actions > **iOS IPA (Ad Hoc)** workflow'u çalıştırılır.

Üretilen artifact:

- `mimaros-ios-ipa` -> provisioning profile içinde kayıtlı iPhone'lara kurulabilir IPA

## Konum davranışı

- Web/PWA: browser `navigator.geolocation`
- Android/iOS native: Capacitor background geolocation
- Android sefer takibi sırasında foreground-service bildirimi gösterir.
- iOS build'i `Always/Background Location` açıklamaları ve `UIBackgroundModes=location` ile hazırlanır.
- Konum telemetrisi mevcut offline kuyruk ve Supabase ping akışını kullanmaya devam eder.

## Güvenlik

Apple sertifikası, provisioning profile ve şifre repository dosyalarına commit edilmez; yalnız GitHub Actions Secrets'ta tutulur.
