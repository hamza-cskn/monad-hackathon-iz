# İz — Bağışta güven ve hesap verebilirlik

Durum: Kullanıcı geri bildirimiyle güncellenmiş ürün ve UX planı.

## Kesinleşen kararlar

- Bağış bu site üzerinden bir kuruma yapılır.
- Kullanıcı kurumun ortak bağış fonunun kullanımını ve harcama kanıtlarını takip eder.
- İlk sürüm, yapılmış harcamaların ve belgelerin sonradan incelenmesini sağlar.
- Ürünün odağı bağışın amacına uygun kullanılması ve suistimal riskinin denetlenmesidir.
- Bağışçıların isimleri, sıralamaları veya bağışçı sayacı gösterilmez.
- Hackathon demosunda para hareketleri ve başlangıçtaki kurum, belge ve denetçi kayıtları örnektir.

## Ana mesaj

**Bağışın, amacı için kullanılsın.**

Açıklama: Bağışın nereye harcandığını, hangi belgelerle desteklendiğini ve neyin henüz doğrulanmadığını takip et.

Ürün, yapılan iyiliğin görünürlüğünü teşvik etmez. Harcamaların hesap verebilirliğini ve bağışçının mahremiyetini merkeze alır. Kayıt ve denetim mekanizması, suistimalin tamamen engellendiği garantisi olarak sunulmaz.

## Bilgi mimarisi

| Sayfa | Görev |
|---|---|
| Ana sayfa | Ürünün amacını ve takip edilebilecek bilgiyi anlatmak |
| Bağış yap | Kurumu, tutarı, kesintiyi ve net katkıyı göstermek |
| Bağış takibi | Kişisel bağış kaydını ve kurumun fon kullanımını incelemek |
| Kurumun bağış fonu | Toplamları, harcamaları ve kanıt durumlarını göstermek |
| Nasıl çalışır? | Süreci ve denetimin sınırlarını ayrı bir sayfada açıklamak |
| Kurum paneli | Harcama ve belge eklemek, eski sürümleri korumak |
| Denetçi paneli | Kanıtı gerekçeli olarak onaylamak, reddetmek veya ek belge istemek |

Üst menü: Ana sayfa / Nasıl çalışır? / Bağış takibi. Ana eylem: Bağış yap.

Kurum ve denetçi panelleri alt menüde bulunur. Cüzdan ve blockchain işlemleri ilgili kayıtların içindeki açılabilir teknik bölümde yer alır.

## Temel kullanıcı akışı

```text
Ana sayfa → Bağış yap → Alıcı kurum + tutar + kesinti → Bağış takip kaydı
                                                              |
                                         Kurumun fon kullanımını incele
                                                              |
                                           Harcama → Belge → İnceleme
```

Bir bağış, kurumun ortak fonuna katılır. Belirli bir ödeme veya teslimatla bire bir eşleştirilmiş gibi gösterilmez.

## Sayfa düzenleri

### Ana sayfa

- Tek ana mesaj ve kısa açıklama.
- Bağış yapma eylemi ve örnek takip kaydına ikincil bağlantı.
- Bir bağış kaydının tutar, kesinti ve inceleme adımlarını gösteren tek örnek.
- Harcamanın amacı, kanıtı ve eksikleri hakkında kısa açıklama.

Bağış hedefi, hedefe ilerleme çubuğu, bağışçı avatarları ve tekrarlanan tanıtım kartları kaldırılır.

### Bağış yap

- Sol bölüm: alıcı kurum, ortak fon, izlenebilecek bilgiler.
- Sağ bölüm: tutar seçimi, brüt tutar, platform payı, net katkı ve tamamla eylemi.
- Mobilde bu iki bölüm tek sütunda sıralanır.

### Bağış takibi ve kurumun fonu

- Takip kodu ve kişisel tutar/kesinti bilgisi önce gösterilir.
- Kurumun toplam fonu, kayda alınan ödemeleri ve kalan tutarı ayrı gösterilir.
- Harcama satırında satın alma ve teslim alma durumları metinle okunur. Satın alma sekmesindeki fatura ve ödeme belgesi tek paket, tek ortak karar taşır.
- Belge içeriği, gerekçeli karar ve eski sürümler harcama detayında açılır.
- Zincir kaydı isteğe bağlı bir ayrıntıdır; temel bağış akışını bölmez.

### Nasıl çalışır?

Ayrı URL ve sayfa başlığıyla altı bölüme ayrılır:

1. Bağıştan denetime dört adımlı süreç.
2. Satın alma ve teslim alma aşamalarının neyi kanıtladığı.
3. Eksik, bekleyen, reddedilen ve ek belge istenen kayıtların anlamı.
4. Bağışçı, kurum, denetçi ve platformun sorumlulukları.
5. Kayıt bütünlüğü, blockchain'in sınırları ve mahremiyet.
6. Örnek kayıt üzerinden demoyu deneme.

Sayfa içindekiler menüsü uzun açıklamada gezinmeyi kolaylaştırır. Açıklama popup içinde gösterilmez.

## Kayıt doğruluğu

- Belge yüklemek, denetçi onayı vermek ve zincire kayıt göndermek ayrı durumlardır.
- Reddedilen belge veya yeni sürüm, eski kayıtları silmez.
- Reddedilen belge, yapılmış ödemeyi toplamdan çıkarmaz.
- Blockchain kayıtları belgenin parmak izini taşır; belgenin gerçekliğini veya denetçinin yetkisini kendiliğinden kanıtlamaz.
- Mevcut bağışların önceden kaydedilmiş parmak izlerini korumak için eski kayıt biçimi değiştirilmez.

## Doğrulama

- Ana sayfa bağış kullanımını anlatır ve doğrudan bağış formuna götürür.
- Nasıl çalışır? menüsü bağımsız, yenilenebilir bir sayfaya açılır.
- Bağış ve belgelerin kayıtları sayfa yenilendiğinde korunur.
- Kurum kendi belgesine denetçi onayı veremez; denetçi gerekçe girmelidir.
- 360 px ekranda ana akışlar yatay taşma olmadan kullanılabilir.
- Gerçek testnet makbuzu alınmadan başarılı zincir kaydı gösterilmez.
