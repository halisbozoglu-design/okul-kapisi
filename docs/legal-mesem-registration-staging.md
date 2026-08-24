# MİMAROS — MESEM Kayıt/Kabul Mevzuat Staging

Durum: **STAGING / Super Admin onayı gerekli**  
Kaynak kontrol tarihi: **24.08.2026**

## Resmî kaynaklar

- MEB Mevzuat Sistemi — Millî Eğitim Bakanlığı Ortaöğretim Kurumları Yönetmeliği, özellikle Md. 21-22: https://mevzuat.meb.gov.tr/dosyalar/1657.pdf
- MEB Teftiş Kurulu Başkanlığı — Mesleki Eğitim Merkezleri Denetim Rehberi, 12.05.2026 güncellemesi: https://tkb.meb.gov.tr/www/denetim-rehberleri/icerik/291

## Atomik hukuk kuralları

1. **MESEM 18+ kayıt istisnası — Md.21/1**  
   Genel örgün ortaöğretimdeki yaş kuralından farklı olarak mesleki eğitim merkezine 18 yaşını bitirmiş kişilerin kaydı yapılabilir.

2. **İşe giriş sağlık raporu — Md.21/3**  
   MESEM kaydında öğrencinin girmek istediği meslek alanına uygun olduğunu gösteren, 6331 sayılı Kanun Md.15 kapsamındaki işe giriş sağlık raporu zorunludur.  
   Önerilen sistem etkisi: `L3 / BLOCK_REGISTRATION_IF_HEALTH_REPORT_MISSING`.

3. **Açık öğretimle eşzamanlı kayıt — Md.21/7**  
   MESEM öğrencisi aynı zamanda AÖL, MAÖL veya AÖİHL'ye kayıt yaptırabilir.

4. **MAÖL eşdeğer ders muafiyeti — Md.21/7**  
   Mesleki Açık Öğretim Lisesine kayıtlı MESEM öğrencisi, MESEM'de karşılığı bulunan derslerden yüz yüze eğitim programına devam ettirilmez.

5. **İki aylık işletme sözleşmesi süresi — Md.22/2**  
   Bir işletmeyle iki ay içinde sözleşme imzalamayan MESEM öğrencisi kayıt hakkını kaybeder; sözleşmesiz teorik eğitim en fazla iki ay sürdürülebilir.  
   Önerilen sistem etkisi: `L3 / TWO_MONTH_CONTRACT_DEADLINE`.

6. **Sözleşme → kayıt tamamla → SGK tetikle — Md.22/2**  
   İşletme sözleşmesi imzalandığında kayıt tamamlanır ve sigortalı işe giriş bildirgesi düzenlenir.  
   Önerilen sistem etkisi: `L3 / COMPLETE_REGISTRATION_THEN_TRIGGER_SGK_ENTRY`.

7. **18+ adaylarda sözleşmeye bağlı yıl boyu kayıt — Md.22/9**  
   3308 sayılı Kanunun 10 uncu maddesinin ikinci fıkrası kapsamında **bir işletme ile sözleşme imzalayan** 18 yaşından büyüklerin kayıtları yıl boyunca devam eder. Sözleşmesiz aday için bu fıkradan yıl boyu kayıt hakkı türetilmez.

8. **Birinci dönem sonuna kadar 18+ sözleşmeli kayıt — Md.22/9**  
   Bu kapsamda birinci dönem sonuna kadar kayıt yaptıranların 9. sınıf teorik eğitimleri yoğunlaştırılarak tamamlanır.

9. **Şubat sonrası ikinci dönem kaydı — Md.22/9**  
   Bu kapsamda ikinci dönemde şubat ayından sonra kayıt olan öğrenci işletmede mesleki eğitime devam eder; ilgili ders yılı için yılsonu puanı verilmez ve teorik eğitim yeni ders yılı başında başlar.  
   Önerilen sistem etkisi: `L3 / NO_YEAR_END_GRADE_AFTER_POST_FEB_REGISTRATION`.

## Kaynak sürümü / yorum güvenliği

- Md.22/2 ile Md.22/9 ayrı kayıt rejimleridir ve tek kurala birleştirilmemelidir.
- Md.22/2: MESEM'e yerleştirilmiş öğrencinin iki ay içinde işletme sözleşmesi yapması; aksi hâlde kayıt hakkının kaybı ve teorik eğitime en fazla iki ay devam.
- Md.22/9: 3308 sayılı Kanun Md.10/2 kapsamında **işletme sözleşmesi imzalamış 18+ adayın** yıl boyu kaydı.
- Mevzuat motorunda `contract_required=true` ve `adult_year_round_registration=true` birlikte değerlendirilmelidir; yalnız yaş koşulu yıl boyu kayıt için yeterli değildir.

## Önerilen kural motoru alanları

- `legal_source_code`
- `legal_article`
- `legal_paragraph`
- `effective_scope`
- `school_type_scope`
- `student_condition`
- `blocking_rule`
- `impact_level`
- `effective_from`
- `effective_to`
- `source_version`
- `staging_status`
- `super_admin_approval`
- `legal_snapshot`

## Yayın davranışı

- Bu kurallar doğrudan production'a uygulanmamalıdır.
- Yeni/yenilenen mevzuat kuralları önce staging'e alınmalı, diff ve etki analizi üretilmeli, Super Admin onayı sonrasında yalnız gelecek/pending workflow'lara uygulanmalıdır.
- Tamamlanmış kayıt, sözleşme, SGK bildirimi, tebligat ve `legal_snapshot` kayıtları geriye dönük değiştirilmemelidir.
- Mevzuat değişikliği okul türü, kurum özelliği, öğrenci koşulu ve coğrafi kapsam filtresinden geçmelidir.

## Migration notu

Bu commit yalnız mevzuat staging dokümanıdır. Repoda mevcut mevzuat staging/veri modeli henüz bulunmadığından bu aşamada yeni SQL tablo/kolon uydurulmamıştır. Mevcut veri modeli kesinleştirildikten sonra ilgili additive migration mümkün olan en az migration sayısıyla oluşturulmalıdır.
