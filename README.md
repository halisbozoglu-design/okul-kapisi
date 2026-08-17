# Okul Yönetim Sistemi

Yeni bir okul yönetim platformunun temel iskeletini oluştur.

TEKNOLOJİ:

- React + TypeScript

- Supabase backend

- responsive modern admin panel

- temiz, kurumsal, sade arayüz

- Türkçe karakter desteği tam olmalı

- tüm tablo, form ve menüler mobil uyumlu düşünülmeli

İLK FAZ HEDEFİ:

Sadece sistem çekirdeğini kur. Henüz öğrenci, sınav, yoklama, rehberlik gibi ileri modülleri yapma. Öncelik sağlam temel mimari olsun.

OLUŞTURULACAK BÖLÜMLER:

1) AUTH SİSTEMİ

- giriş yap

- çıkış yap

- şifre sıfırlama

- oturum kontrolü

- aktif/pasif kullanıcı kontrolü

- rolü olmayan kullanıcı giriş yaptığında kısıtlı ekran göster

2) ROL VE YETKİ ALTYAPISI

Aşağıdaki roller tanımlansın:

- super_admin

- kurum_yoneticisi

- okul_yoneticisi

- mudur_yardimcisi

- ogretmen

- rehberlik

- koc_ogretmen

- veli

- ogrenci

- personel

Her rol için:

- ayrı menü görünürlüğü altyapısı

- ayrı dashboard yönlendirmesi

- sayfa koruma sistemi

- permission tabanlı erişim mantığı

3) KURUM AYARLARI MODÜLÜ

Aşağıdaki ayar ekranları oluşturulsun:

- okul bilgileri

- akademik yıl

- dönemler

- sınıf düzeyleri

- şubeler

- derslikler

- branşlar

Bu alanların CRUD ekranları olsun.

4) ORTAK YÖNETİM PANELİ İSKELETİ

- sol menü

- üst bar

- bildirim alanı placeholder

- kullanıcı profil alanı

- dashboard kart yapısı

- tablo bileşeni

- form bileşeni

- modal bileşeni

- arama + filtre yapısı

5) DASHBOARD YAPISI

Her rol için farklı dashboard altyapısı oluştur:

- super admin dashboard

- okul yöneticisi dashboard

- öğretmen dashboard

- veli dashboard

- öğrenci dashboard

Şimdilik dashboard içerikleri örnek veriyle çalışabilir ama mimari hazır olsun.

6) VERİTABANI TASARIMI

Supabase tarafında aşağıdaki tabloları oluştur:

- profiles

- roles

- permissions

- user_roles

- institutions

- campuses

- academic_years

- terms

- grade_levels

- sections

- classrooms

- branches

İlişkileri doğru kur.

UUID kullan.

created_at / updated_at alanları olsun.

soft delete altyapısı düşün.

audit mantığına uygun tasarla.

7) GÜVENLİK

- Row Level Security planlı kur

- kullanıcı yalnızca yetkili olduğu alanları görsün

- role-based route protection olsun

- ileride çoklu kurum desteğine uygun mimari kur

8) KOD KALİTESİ

- component yapısı modüler olsun

- reusable hooks kullan

- service katmanı oluştur

- type-safe yaklaşım kullan

- form validation ekle

- boş ekranlar yerine profesyonel placeholder kullan

ÇIKTI BEKLENTİSİ:

- çalışan başlangıç uygulaması

- temiz klasör yapısı

- Supabase şema önerisi

- temel sayfalar

- örnek dashboardlar

- rol bazlı yönlendirme

- sonraki fazlara genişleyebilecek sağlam mimari

ÖNEMLİ:

- Türkçe karakterler düzgün çalışsın

- isimlendirmelerde tutarlı ol

- dağınık menü yapısı kurma

- ilk fazda gereksiz modül ekleme

- kodu ileride öğrenci, öğretmen, veli, sınav, yoklama modüllerine genişletecek şekilde tasarla

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://okul-kapisi.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/7dc24fdc-fc08-46de-85ab-a92b0f7d1808).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
