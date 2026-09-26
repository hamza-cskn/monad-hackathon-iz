# İz — çalışan yerel MVP+

Örnek TL bağışı yapma, kurumun harcamalarını belgeleme ve ayrı denetçi hesabıyla inceleme demosu. Kayıtlar kullanıcının `http://127.0.0.1:8545` Anvil ağına bağlıdır (chain ID `31337`).

## Demoyu aç

**Web:** http://127.0.0.1:5173  
**API:** http://127.0.0.1:3001

1. **Bağış yap:** Örnek tutarı seç; takip bağlantın ve zincir kaydın oluşur. Gerçek para alınmaz.
2. **Kurum paneli:** `#/kurum` → **Kurum olarak dene** → harcama ekle. **Satın alma** sekmesinde fatura ve ödeme belgesini seçip birlikte gönder; **Teslim alma** sekmesinde teslim kanıtını yükle. Her dosya en fazla 1 MB. Bağışçıların dosyaları açabilmesi için paylaşım kutusunu işaretle.
3. **Denetçi paneli:** `#/denetci` → **Denetçi olarak dene** → ilgili harcamayı aç. Satın alma paketindeki iki belge için tek ortak karar, teslim alma için ayrı bir karar ver: onay, ret veya ek belge talebi.
4. **Bağış takibi:** Bağlantıyı başka bir tarayıcıda aç; tutarlar, belge sürümleri ve kararlar aynı kayıttan gelir.
5. **Zincir kaydı ve bütünlük:** EAS UID, işlem hash'i ve imzalayan adresi gör; içeriği doğrula.

Hazır örnek: `#/takip?kod=IZ-DEMO-1001`. “Sahaya nakliye” harcamasının teslim alma belgesi inceleme bekler. Önceki sürümden kalan ayrı fatura/ödeme kayıtları **Belge geçmişi** içinde korunur; eski onaylar ortak satın alma onayı sayılmaz.

Zinciri doğrudan CLI ile kontrol etmek için: [Cast ile bağımsız doğrulama](docs/cast-verification.md).

**Yerel demo hesapları** yalnızca geliştirme arayüzünde gösterilir. Wagmi'nin hazır test bağlantısı açık Anvil hesaplarını kullanır; imza ve işlemler gerçek yerel RPC üzerinden gerçekleşir. Bu düğmeler herkesin rolleri deneyebilmesi içindir. Tarayıcı cüzdanıyla giriş seçeneği de bulunur. Üretim ortamı için kimlik doğrulama modeli değildir.

## Çalıştırma

Gereksinimler: Node.js 26, npm, Foundry (`anvil`, bağımsız doğrulama için `cast`). Tarayıcı testleri için Google Chrome gerekir.

```sh
git clone git@github.com:hamza-cskn/monad-hackathon-iz.git
cd monad-hackathon-iz
nvm use
npm ci
```

8545 üzerinde zaten Anvil çalışıyorsa onu kullan. Yeni kurulumda ayrı bir terminalde, proje dizininden başlat:

```sh
mkdir -p .data
anvil --host 127.0.0.1 --port 8545 --state .data/anvil.json
```

Bu komut yerel zincir durumunu aynı dosyadan yükler ve kaydeder. Ardından ilk terminalde:

```sh
npm run setup:local
npm run dev
```

`setup:local`, hazır EAS sözleşmelerini kurar ve sentetik kayıtları oluşturur. Mevcut kurulumu doğrular; başarılı örnek kayıtları tekrar oluşturmaz. Çalışan Anvil ağını sıfırlamaz.

Veritabanı, yüklenen belgeler, yerel zincir durumu ve deployment manifest'i Git'e dahil değildir; her kurulum kendi yerel kayıtlarını oluşturur. `.nvmrc`, Node sürümünü seçmek için sağlanır; nvm kullanmıyorsan doğrudan Node.js 26 kurabilirsin.

```sh
npm run build
npm test
```

`npm test`, **ayrı 18545 Anvil** ve geçici veritabanı kullanır; 13001 API / 15173 web portları boş olmalıdır. API testlerini, yeniden başlatma kontrolünü ve gerçek yerel işlemler kullanan Playwright testlerini çalıştırır. Tarayıcı testleri kurulu Google Chrome kullanır.

## Hazır altyapı

- **Wagmi + Viem:** cüzdan bağlantısı, imza ve RPC.
- **EAS 1.9.0:** paketin değiştirilmemiş `EAS`, `SchemaRegistry`, `AttesterResolver` bytecode'ları. Özel Solidity sözleşmesi yazılmadı.
- **Fastify + SQLite:** API, tek kullanımlık cüzdan giriş mesajları, oturumlar, kalıcı kayıt ve işlem takibi.
- **Yerel dosyalar:** belgeler `.data/files/`; SQLite `.data/iz.sqlite`; kurulum manifest'i `deployments/local.json`.

Kaynaklar: [EAS](https://github.com/ethereum-attestation-service/eas-contracts), [Wagmi](https://wagmi.sh/react/getting-started).

## MVP davranışı

- Bağış kayıtlarını platform, harcama/belgeleri kurum, kararları denetçi imzalar. Bağışçı cüzdanı gerekmez.
- Beş EAS şeması kurum/fon, bağış, harcama, belge sürümü ve kararı birbirine bağlar.
- Hazır resolver imzalayan adresi kısıtlar. Tekrarlanan kayıt, tutar, referans ve sürüm kuralları backend'de doğrulanır. Geçersiz kayıtlar kurumun fon sayfasında UID ve gerekçesiyle gösterilir; fon dökümüne katılmaz.
- Kesinti örnek olarak %2'dir; hesaplama tam sayı kuruşla yapılır. Para hareketleri örnektir.
- Belge hash'i ham dosya baytlarından hesaplanır. Dosya değiştirilirse doğrulama başarısız olur.
- Satın almada iki dosyanın adı, türü ve SHA-256 özeti tek JSON paketinde yer alır; paketin özeti zincire yazılır. Ortak karar bu paket sürümüne bağlıdır. Dosyalardan biri değişirse yeni paket yeniden incelenir. Teslim alma kendi sürümünü ve kararını korur.
- Bağlı açıklama ve karar metinlerinin özetleri de kontrol edilir. İçerik bütünlüğü, belgenin gerçekliği veya gerçek ödeme doğrulaması olarak gösterilmez.
- Yeni belge eski sürümü ve kararını korur. Reddedilen belge harcama toplamını azaltmaz.
- Belge aslı kurum ve denetçiye açıktır; paylaşım seçilmişse bağışçılar da açabilir.
- İşlem gönderimi ve başarılı makbuz ayrıdır. Bekleyen kurum/denetçi işlemi aynı hash ile tekrar kontrol edilir.
- Tarayıcının hash bildirimi kaybolursa başarılı kayıt, imzalayan/şema/referans/içerik eşleştirmesiyle zincirden bulunur. Bağlantı kesintisinde bekleyen işlem korunur; kesin başarısızlık yeni işlemleri engellemez.
- Tamamlanmış denetim isteğinin aynı işlem anahtarıyla tekrarı mevcut sonucu döndürür. Anahtar farklı belge veya içerik için kullanılamaz.
- Takip sayfası bağlantı hatasını bulunamayan koddan ayırır; bağlantı kesildiğinde son alınan kaydı gösterip yeniden sorgular.
- Veriler tarayıcıya bağlı değildir. Eski `iz-demo-v1` localStorage verisi yeni kayıt kaynağı olarak kullanılmaz ve silinmez.

Bu MVP **yalnızca yerel Anvil** kullanır. Public Monad testnet deployment'ı sonraki aşamadır. Fon saklama, gerçek TL tahsilatı veya otomatik suistimal tespiti içermez.

## Yerel yapılandırma

| Değişken | Varsayılan |
| --- | --- |
| `IZ_RPC_URL` | `http://127.0.0.1:8545` — yalnızca loopback |
| `IZ_API_PORT` | `3001` |
| `IZ_API_URL` | `http://127.0.0.1:3001` — Vite proxy |
| `IZ_DATA_DIR` | `.data` |
| `IZ_MANIFEST` | `deployments/local.json` |
| `IZ_ORIGINS` | `http://127.0.0.1:5173,http://localhost:5173` |
| `VITE_RPC_URL` | `http://127.0.0.1:8545` — cüzdan RPC |

Anvil durumu silinir veya başka zincir açılırsa manifest/DB eşleşmesi reddedilir. Eski kayıtları korumak için yeni kurulumda ayrı manifest ve veri dizini kullanılır.
