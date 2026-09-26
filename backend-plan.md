# İz — Backend ve Monad entegrasyon planı

Tarih: 26 Eylül 2026. Durum: İki aşamalı yerel MVP+ tamamlandı; 11 backend testi, 13 tarayıcı testi, yeniden başlatma kontrolü ve derleme geçti. Güncel çalıştırma ve demo adımları README.md içinde.

## Uygulama sırasında kesinleşen MVP kapsamı

- Doğrulama iki aşamadır: satın alma ve teslim alma. Fatura ve ödeme belgesi tek satın alma paketinde, tek ortak kararla incelenir. Teslim alma kararı bağımsızdır. Eski ayrı belge kayıtları tarihçe olarak korunur, ortak onaya dönüştürülmez.
- EAS şeması ve sözleşmeler değişmedi. Mevcut `kind` kodları korunur; `3` satın alma paketidir, `2` teslim almadır. `0/1` yalnızca eski ayrı ödeme/fatura kayıtlarını okumak içindir. API yeni kayıtları iki aşamayla sınırlar.
- Kullanıcının son talebi: önce çalışan yerel demo; public Monad testnet geçişi sonraki aşama.
- Project ID bulunmadığından kullanıcı tercihiyle AppKit yerine hazır Wagmi bağlantısı kullanıldı.
- EAS 1.9.0 paketinin hazır bytecode'ları 127.0.0.1:8545 üzerinde kuruldu; özel Solidity yazılmadı.
- Cüzdan eklentisi gerektirmeyen yerel demo rol düğmeleri, açık Anvil hesaplarını kullanır. Bu kolaylık yalnızca geliştirme arayüzündedir; imzalar ve EAS işlemleri gerçek yerel RPC'ye gider.
- MVP'de SQLite işlem/event kaydı ve EAS'ten türetilen görünüm kullanılır. Aşağıdaki ayrıntılı tablo ayrımı ileride gerekirse uygulanabilir.
- MVP+: bildirimi kaybolan başarılı işlemlerin zincirden bulunması, denetim isteği tekrarlarının tekilleştirilmesi, geçici bağlantı hatası ile kesin başarısızlığın ayrılması ve geçersiz zincir kayıtlarının arayüzde gösterilmesi tamamlandı.

## 1. Kapsam ve kararlar

- Bağış site üzerinden bir kuruma yapılır; kurumun ortak fonunun kullanımı takip edilir.
- Denetim, harcama yapıldıktan sonra satın alma paketi ve teslim alma kanıtı üzerinden iki aşamada yürür.
- Bağışçı isimleri yayımlanmaz; bireysel bağış belirli bir harcamaya bire bir bağlanmaz.
- **Ağ sırası kesinleşti:** mevcut yerel Anvil üzerinde geliştirme, ardından Monad testnet.
- **Para akışı kesinleşti:** örnek TL bağışları; bağış, harcama, belge ve denetim kayıtları zincirde. Bağışçı cüzdan bağlamak zorunda değil.
- **Hazır altyapı:** özel iş sözleşmesi sıfırdan yazılmayacak. Hazır cüzdan entegrasyonu ve mevcut kayıt sözleşmeleri kullanılacak.
- Kurum ve denetçinin ayrı cüzdanlarla işlem imzalaması öneriliyor. Backend, denetçi adına karar imzalamayacak.

`context.md` okundu. Oradaki eski kampanya önerileri yerine konuşmada kesinleşen kurum/fon modeli esas alındı.

## 2. Mevcut durum: doğrulanan bulgular

| Alan | Bulgu | Sonuç |
| --- | --- | --- |
| Yerel RPC | `http://127.0.0.1:8545`, `anvil/v1.8.3`, chain ID `31337`, blok `0`, fork yok | Yerel geliştirme ağı; public Monad kaydı üretmiyor |
| Araçlar | Node `v26.3.1`, Cast ve Forge `1.8.3` kurulu | Backend ve Solidity geliştirmesine başlanabilir |
| Frontend RPC | `src/chain.ts`, Viem `monadTestnet`, varsayılan public RPC | Mevcut frontend yerel 8545'e bağlı değil |
| Veri | `src/App.tsx:77`, `src/data.ts:95`: `localStorage` | Başka tarayıcıda aynı kayda erişilemiyor |
| Bağış | `src/App.tsx:83`: yerel kayıt oluşturuluyor | Ödeme veya transfer gerçekleşmiyor |
| Zincir | `src/chain.ts:26`: sıfır değerli, kendi adresine hash gönderimi | Sözleşme, kurum yetkisi ve kayıtlar arası bağ yok |
| Denetim | `src/App.tsx:288`: arayüz rolüne göre yerel karar | Sunucu/sözleşme yetkilendirmesi ve zincirde denetçi kararı yok |
| Belgeler | Base64 içerik tarayıcıda; istemcide SHA-256 | Kalıcı dosya depolama ve sunucuda doğrulama gerekiyor |
| Toplamlar | `src/data.ts:87`: sabit 125.000 TL / 2.500 TL başlangıç değerleri | Gerçek kayıtlarla örnek toplamlar ayrılmalı |
| Testler | 12 Playwright senaryosu; zincir başarısı taklit RPC ile sınanıyor | Gerçek sözleşme/API entegrasyon testleri gerekli |

Yerel ağ bilgisi `cast rpc` ile salt okunur sorgulandı: `web3_clientVersion`, `eth_chainId`, `eth_blockNumber`, `anvil_nodeInfo`. İşlem gönderilmedi.

Monad public testnet chain ID'si `10143`, para birimi MON. [Resmî ağ bilgileri](https://monad.xyz/developers). Anvil'in yerel ağ/fork davranışı için [Foundry dokümantasyonu](https://www.getfoundry.sh/anvil/index.html).

## 3. Hazır bileşen seçimi

| İhtiyaç | Öneri | Gerekçe / sınır |
| --- | --- | --- |
| Cüzdan bağlantısı | Reown AppKit + Wagmi adaptörü | Hazır bağlantı/ağ seçimi; mevcut Viem yapısıyla uyumlu yaklaşım |
| Zincirde kayıt | Ethereum Attestation Service (EAS) | Hazır `SchemaRegistry` ve `EAS` sözleşmeleriyle şemalı, imzalayanı belli kayıtlar |
| Kaydı imzalayabilecek adresi sınırlama | EAS'in hazır `AttesterResolver` örneği | Belirli bir şemayı yalnızca belirlenen adresin kullanmasını sağlar |
| API ve kalıcılık | Node.js / TypeScript / Fastify + SQLite | Tek süreç ve yerel kalıcı depolama hackathon kapsamı için yeterli |

AppKit özel ağ/RPC tanımlamayı destekliyor; Anvil ve Monad ayrı tanımlanacak. Güncel kurulum belgesi Wagmi 2.x ve Reown project ID istiyor. Project ID uygulama kurulum girdisi olacak; cüzdan özel anahtarı istemeyeceğiz. [Kurulum](https://docs.reown.com/appkit/react/core/installation), [özel ağlar](https://docs.reown.com/appkit/react/core/custom-networks).

EAS'in incelenen resmî [deployment listesinde](https://github.com/ethereum-attestation-service/eas-contracts/tree/master/deployments) Monad testnet adresi bulunamadı. Bu yüzden plana tahmini bir adres konulmadı: önce Anvil'e, sonra Monad testnet'e aynı sabitlenmiş upstream sürümün hazır sözleşmeleri değişiklik yapılmadan kurulacak. Bu kurulum uygulamaya ait EAS kurulumu olarak tanımlanacak; resmî EAS deployment'ı olduğu iddia edilmeyecek.

EAS [referanslı kayıtları](https://docs.attest.org/docs/tutorials/referenced-attestations) destekliyor. Hazır [AttesterResolver kaynak kodu](https://github.com/ethereum-attestation-service/eas-contracts/blob/master/contracts/resolver/examples/AttesterResolver.sol), kayıt sahibini constructor'da belirlenen adresle karşılaştırıyor. Bu bir upstream örneğidir; ayrıca denetlenmiş uygulama sözleşmesi olduğu varsayılmayacak.

## 4. Önerilen mimari

```text
React arayüz ─────── HTTP ───────> Node.js / TypeScript / Fastify
     |                                      |
     | AppKit: kurum / denetçi cüzdanı       +── SQLite: kayıtlar, oturumlar, işlem takibi
     | imzalı sözleşme işlemi                +── Dosya dizini: belgeler ve sürümleri
     v                                      |
EAS + SchemaRegistry <───── Viem ────────────+
     |                               makbuz ve event takibi
     +── Anvil (31337) → Monad testnet (10143)
```

Tek API süreci, tek veritabanı ve süreç içinde zincir takip görevi yeterli. Mevcut React/Viem yapısı korunacak. SQLite ve dosyalar tarayıcıdan bağımsız, kalıcı bir veri dizininde saklanacak.

| Backend'de saklanır | Zincirde saklanır |
| --- | --- |
| Kurum profili, harcama açıklamaları | Kurum/fon kayıtları ve kayıtları imzalayan adresler |
| Belge dosyaları, sürüm bilgileri | Belge SHA-256 özeti, harcama bağı ve sürüm kimliği |
| Denetçi gerekçesinin tam metni | Karar, gerekçe özeti, hedef belge sürümü, imzalayan adres |
| Bağış takip erişimi ve özel bilgiler | Bağış kimliği, tutar, kesinti, para birimi ve kurum/fon bağı |
| İşlem hazırlıkları ve senkronizasyon durumu | Başarılı işlemlerin değiştirilemeyen olay geçmişi |

Belgelerin erişilebilirliği depolamaya; değişip değişmediğinin denetlenmesi zincirdeki özete dayanır. Zincire hash yazılması tek başına belgeyi arşivlemez veya içeriğini doğru kılmaz.

## 5. Kayıt şemaları ve yetkiler

Özel Solidity iş mantığı yerine EAS şemaları tanımlanacak. `refUID` üst kaydın EAS kimliğini taşır; belge sürümündeki `previousVersionUID` ise aynı kanıt türünün önceki sürümünü gösterir. EAS'in kaydettiği `attester`, gerçek imzalayan adres olacaktır.

| Şema | İmzalayan | Kaydedilen ilişki |
| --- | --- | --- |
| Kurum/fon | Platform kayıt cüzdanı | Kurum/fon kimliği, kurum yetkilisi, profil özeti |
| Demo bağışı | Platform kayıt cüzdanı | Fon `refUID`; brüt, kesinti, net, `TRY-DEMO` |
| Harcama | Kurum cüzdanı | Fon `refUID`; tutar, para birimi, açıklama özeti |
| Belge sürümü | Kurum cüzdanı | Harcama `refUID`; kanıt türü, dosya özeti, önceki sürüm |
| Denetim kararı | Denetçi cüzdanı | Belge sürümü `refUID`; karar kodu ve gerekçe özeti |

İlk demo tek kurum ve tek bağımsız denetçiyle çalışır. Platform, kurum ve denetçi için üç ayrı adres ve üç hazır `AttesterResolver` kurulumu kullanılır. Şemalar ilgili resolver'a bağlanır. Uygulama yalnızca manifest'te açıkça tanımlanan şema UID'lerini kabul eder; başka birinin aynı isimle açtığı şema yetkili sayılmaz.

**Yetki sınırı:** Hazır resolver imzalayan adresi sınırlar; kurum/fon ilişkisini, tutar tutarlılığını, en güncel belgeyi veya çift kaydı doğrulamaz. Bu iş kuralları API'de ve zincirden yeniden okunan kayıtların doğrulayıcısında uygulanır. Böylece doğrudan EAS'e gönderilmiş bir kayıt da aynı kurallardan geçer. Bir işlemin zincirde bulunması, uygulamanın onu geçerli sayması için yeterli değildir.

Uygulama doğrulama kuralları:

- Kurum, denetçi ve platform adreslerinin çakışması kurulumda reddedilir. Backend giriş yetkisi sabit manifest'teki adreslerle eşleştirilir.
- Üst kaydın varlığı, beklenen şeması, kurumu, fonu ve imzalayanı doğrulanır. Başka kuruma ait veya yanlış türde bir referans kabul edilmez.
- İlk geçerli kayıt blok/işlem/log sırasıyla esas alınır. Aynı iş kimliğinin ikinci kullanımı toplamları artırmaz; çelişkili kayıt görünür biçimde işaretlenir.
- Denetim hedefi zincir sırasındaki güncel belge sürümü olmalıdır. Her sürümün tek sonuç kararı kabul edilir; sonraki çelişkili karar geçerli sonucu değiştirmez.
- Şemalar ve kayıtlar `revocable: false`, süresiz olarak oluşturulur. Yeni belge yeni EAS kaydıdır; geçmiş belge ve kararlar korunur. İlk sürümde kayda geçmiş harcama alanları düzenlenemez.
- Tutarlar tam sayı kuruş olarak hesaplanır. Brüt = kesinti + net kuralı doğrulanır; mevcut %2 oranı kayıt anında sabitlenen demo varsayımıdır.
- Kayıt metni/özeti için sürümlü, belirli alan sıralı biçim kullanılır. Dosya SHA-256 özeti ham baytlardan hesaplanır.
- Dışarıdan da doğrulanabilmesi için şema UID'leri, yetkili adresler ve bu kabul kuralları sürümlü manifest ve ortak doğrulama modülünde tutulur.

Bağış tutarı örnektir; zincire yazan platform cüzdanının beyanıdır ve banka ödemesi kanıtı sayılmaz. Kurum ve denetçi işlemleri için gereken test ağı gas bakiyesi bağış tutarından ayrıdır.

## 6. Backend akışları

1. **Giriş:** AppKit ile bağlanan kurum ve denetçi, tek kullanımlık nonce içeren cüzdan mesajı imzalar. Alan adı, ağ ve süre kontrol edilerek sunucu oturumu açılır. Adres, manifest'teki şema/resolver yetkisiyle eşleştirilir.
2. **Bağış:** API örnek bağışı ve kesintiyi oluşturur; platform kayıt cüzdanı fonu referans alan EAS kaydını gönderir. Bağış takibi zincir onayından önce “kayıt bekliyor” durumunu gösterir.
3. **Harcama:** Sunucu girişleri doğrular, kalıcı taslak oluşturur; kurum cüzdanı hazırlanan EAS işlemini imzalar.
4. **Belge:** API boyut/tür kontrolünü yapar, dosyayı saklar ve SHA-256 hesaplar. Kurum bu belge sürümünü zincire bağlar. Onaydan sonra incelemeye açılır.
5. **Denetim:** Denetçi belgeyi açar, gerekçeyi yazar, kararın bağlı olduğu sürümü imzalı işlemle kaydeder. Yeni sürüme eski onay taşınmaz.
6. **Takip:** API kurumun fon dökümünü ve kişisel bağış kaydını sunar. Ayrı tarayıcı aynı güncel veriyi görür.
7. **Senkronizasyon:** Backend EAS event'lerini ve kayıtlarını okur; doğru ağ, sözleşme, şema UID, imzalayan, kayıt kimliği, özet, başarılı makbuz ve iş kuralları doğrulanır. Geçerli ve geçersiz kayıt durumu zincir onayından ayrı tutulur.

Veri tabloları: `institutions`, `funds`, `donations`, `expenses`, `evidence_versions`, `reviews`, `sessions`, `chain_operations`, `chain_events`, `sync_cursor`. Belgeler veritabanında base64 yerine dosya referansıyla tutulur. Her zincir kaydı EAS UID, şema UID ve ağ/sözleşme bilgisi taşır.

Temel API yüzeyi:

```text
GET  /api/network                         aktif ağ, sözleşme ve bağlantı durumu
POST /api/auth/challenge | verify | logout
GET  /api/institutions/:id/fund            toplamlar ve harcamalar
POST /api/donations                       örnek TL bağışı oluşturma
POST /api/donations/lookup                takip anahtarıyla kişisel kayıt
POST /api/expenses                        kurum harcama taslağı
POST /api/expenses/:id/evidence           belge yükleme ve sürüm hazırlama
GET  /api/evidence/:id/file               yetkiye göre belge okuma
POST /api/evidence/:id/reviews            gerekçeli karar hazırlama
POST /api/operations/:id/transaction      gönderilen tx hash'ini bildirme
GET  /api/operations/:id                  doğrulanmış işlem durumu
```

Tx hash'ini bildirmek başarı sayılmaz; backend bağımsız doğrular. Demo dışındaki bağışlarda istemciden gelen “ödendi” bildirimi ödeme kanıtı olarak kabul edilmez.

## 7. Tutarlılık ve arayüz

- İşlem durumu: `imza bekliyor → gönderildi → zincirde onaylandı`; iptal/başarısızlık ayrı gösterilir. Belge inceleme durumu bu alandan ayrıdır.
- RPC zaman aşımı başarısız işlem anlamına gelmez. Önce aynı hash sorgulanır; belirsiz durumda otomatik ikinci bağış gönderilmez.
- Backend'in gönderdiği işlemlerde kimlik, nonce ve imzalı işlem/hash gönderimden önce kalıcılaştırılır. Yeniden başlatmada aynı işlem takip edilir.
- Çift tıklama ve yinelenen istekler API idempotency anahtarı ve ortak doğrulayıcıda iş kimliği tekilleştirmesiyle tek kayda iner. EAS aynı içerik için birden fazla UID üretebildiğinden, yalnızca EAS UID'sine güvenilmez.
- Event'ler ağ/sözleşme/tx/log kimliğiyle tekilleştirilir. Blok numarası ve hash ile ilerleme saklanır; yeniden başlatmada geriden taranır. Blok uyuşmazlığında etkilenen görünüm yeniden oluşturulur.
- Backend dışında gönderilmiş, tanımlı şemalara ait işlemler de taranır. Açıklaması/dosyası bulunamayan kayıt gizlenmez; “içerik erişilemiyor” olarak gösterilir. Yetkisi veya iş kuralları doğrulanamayan kayıtlar geçerli toplamlara katılmaz.
- Açılışta chain ID, deployment bloğu ve sözleşme kodu doğrulanır. Yerel ağ sıfırlanırsa eski kayıtlar sessizce yeni ağa bağlanmaz.
- Örnek başlangıç toplamları yerine kayıt toplamları hesaplanır. Reddedilen belge, bildirilmiş harcamayı toplamdan çıkarmaz. Sonuç “kayda göre kalan” tutardır; banka/cüzdan bakiyesiyle aynı olduğu iddia edilmez.
- Takip erişimi kısa sıra numarasından ayrılan rastgele bir anahtar kullanır; zincire erişim anahtarı veya bağışçı kişisel bilgisi yazılmaz.
- Orijinal belgeler kurum ve yetkili denetçiye; bağışçıya örnek veya paylaşılabilir belge nüshaları sunulur. Farklı nüshaların hash'leri karıştırılmaz.
- `localStorage` eski demo kayıtları otomatik olarak gerçek kayıt kabul edilmez. Eski hash ve içerikleri korunur; yeni API verileri ayrı kaynak olarak kullanılır.
- Zincire kayıt uygulama akışının parçası olur; explorer/hash ayrıntısı mevcut açılır bölümde kalır. Yerel işlemlere Monad explorer bağlantısı gösterilmez.

## 8. Uygulama sırası ve kabul ölçütleri

| Adım | Çıktı | Doğrulama |
| --- | --- | --- |
| 1. Hazır altyapı | Sabit upstream EAS sürümü, Anvil deployment'ı, resolver'lar, şemalar ve manifest | Yanlış ağ/kodda işlem başlatılmaz; `cast` ile şema ve attester kısıtı doğrulanır |
| 2. Veri doğrulaması | Şemalar arası bağlar, rol/adres ve iş kuralları | Yanlış referans, tekrar kayıt, eski sürüm kararı, hatalı tutar ve çelişkili karar reddedilir |
| 3. Backend | Kalıcı DB/dosyalar, oturumlar, API, event takibi | API: yetki, dosya özeti, kalıcılık, idempotency, başarısız/bekleyen işlem |
| 4. Cüzdan ve frontend | AppKit, yerel mutasyonların API/EAS işlemleriyle değiştirilmesi | İki tarayıcı aynı kaydı görür; karar ve işlem durumu doğru ayrılır |
| 5. Uçtan uca yerel demo | Bağış → harcama → belge → karar → takip | Gerçek Anvil makbuzları `cast` ile doğrulanır; backend yeniden başlatılınca veri kaybolmaz |
| 6. Monad testnet | Aynı hazır sözleşmeler, yeni şema UID'leri ve ağ manifest'i | Chain ID 10143, başarılı gerçek makbuz, eşleşen EAS kaydı ve explorer bağlantısı |

Hazır EAS sözleşmeleri yeniden yazılmayacak. Entegrasyon testleri resolver/şema yapılandırmasını ve uygulama kurallarını sınayacak; Playwright akışları gerçek API/yerel zincirle çalıştırılacak. Otomatik testler ayrı Anvil portu ve geçici DB kullanacak; kullanıcının 8545 düğümü sıfırlanmayacak. Yerel akış tamamlanınca public testnet'te aynı akış bir kez doğrulanacak.

Önerilen dosya yerleşimi:

```text
scripts/                   hazır EAS deployment'ı, şema kaydı ve örnek veri betikleri
server/                    API, oturum, SQLite, dosya ve event takibi
shared/                    API türleri, EAS şemaları, özet biçimi ve doğrulama kuralları
deployments/               ağ/sürüm/sözleşme/şema/yetkili adres manifest'leri
src/api.ts                 frontend API erişimi
src/chain.ts               ağ seçimi ve yetkili cüzdan işlemleri
```

Uygulanan dikey akış: **tek kurum → tek bağış → tek harcama → satın alma paketi → ortak denetçi kararı → teslim alma kanıtı → ayrı denetçi kararı → başka tarayıcıdan takip**.

## 9. Tamamlanma ölçütü

Demo; farklı oturumlardan aynı kaydı okuyabildiğimiz, yetkisiz kararın ilgili şemada zincirde reddedildiği, iş kurallarına aykırı kayıtların geçerli sayılmadığı, belge değişikliğinin saptandığı ve eski sürümlerin korunduğu noktada tamamlanmış sayılır. Bağış/harcama/karar bağlantısı gerçek EAS kayıtları ve makbuzlarla doğrulanmalıdır. Monad aşamasının kabulü ayrıca public testnet işlemi gerektirir; Anvil başarısı tek başına yeterli değildir.
