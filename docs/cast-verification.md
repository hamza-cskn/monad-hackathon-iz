# Cast ile backend'den bağımsız doğrulama

Bu komutlar API'yi veya veritabanındaki kararları kaynak olarak kullanmaz; doğrudan `127.0.0.1:8545` üzerindeki EAS sözleşmesini okur. Cast 1.8.3 ve jq ile denendi. İşlem göndermezler; özel anahtar gerekmez.

Örnek: `IZ-H001` çadır alımının önceki sürümden korunan faturası ve ayrı denetçi onayı. Güncel akış satın alma paketi ve teslim alma olarak iki aşamadır; bu eski fatura onayı ortak satın alma onayı değildir. Aşağıdaki adresler mevcut yerel kuruluma aittir. Ağ yeniden kurulursa adres/UID'ler değişebilir.

## 1. Ağı ve sözleşmeyi belirle

```sh
cd monad-hackathon-iz

IZ_RPC='http://127.0.0.1:8545'
IZ_EAS='0xe7f1725e7734ce288f8367e1bb143e90bb3f0512'
IZ_REGISTRY='0x5fbdb2315678afecb367f032d93f642f64180aa3'
IZ_GET='getAttestation(bytes32)((bytes32,bytes32,uint64,uint64,uint64,bytes32,address,address,bool,bytes))'

cast chain-id --rpc-url "$IZ_RPC"
```

Beklenen ağ kimliği: `31337`.

## 2. Denetçi kararını doğrudan oku

```sh
IZ_REVIEW_UID='0x5b939feea2e4404985227de61b11bfc848e6ecaa680de4164ab430a78b1fb650'

iz_record() {
  cast call "$IZ_EAS" "$IZ_GET" "$1" --rpc-url "$IZ_RPC" --json | jq '.[0]'
}

IZ_REVIEW=$(iz_record "$IZ_REVIEW_UID")
printf '%s\n' "$IZ_REVIEW" | jq '{uid:.[0], schema:.[1], belgeUID:.[5], imzalayan:.[7], sonaErme:.[3], iptalZamani:.[4], iptalEdilebilir:.[8]}'

IZ_REVIEW_DATA=$(printf '%s\n' "$IZ_REVIEW" | jq -r '.[9]')
cast decode-abi 'f()(string,uint8,bytes32)' "$IZ_REVIEW_DATA"
```

Beklenen sonuçlar:

- UID, sorguladığın UID ile eşleşmeli; sıfır UID kayıt bulunmadığını gösterir.
- Denetçi adresi: `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC`.
- Şema: `0x14e851291945252dfb433032c1ca12afa39bb9897fdaaf36fc81388397b9cdcb`.
- Veri: `IZ-H001-invoice-v1-review`, karar `0`, gerekçe özeti.
- Karar kodları: `0 = onay`, `1 = ret`, `2 = ek belge talebi`.
- Sona erme ve iptal zamanı `0`; iptal edilebilirlik `false`.

Şemanın gerçek tanımını ve bağlı resolver adresini de zincirden okuyabilirsin:

```sh
IZ_REVIEW_SCHEMA=$(printf '%s\n' "$IZ_REVIEW" | jq -r '.[1]')
cast call "$IZ_REGISTRY" \
  'getSchema(bytes32)((bytes32,address,bool,string))' \
  "$IZ_REVIEW_SCHEMA" --rpc-url "$IZ_RPC"
```

Şema metni `string recordId,uint8 decision,bytes32 reasonHash`; resolver `0xdc64a140aa3e981100a9beca4e685f962f0cf6c9` olmalı.

## 3. Kararın hangi belgeye ve harcamaya ait olduğunu izle

```sh
IZ_DOCUMENT_UID=$(printf '%s\n' "$IZ_REVIEW" | jq -r '.[5]')
IZ_DOCUMENT=$(iz_record "$IZ_DOCUMENT_UID")
printf '%s\n' "$IZ_DOCUMENT" | jq '{uid:.[0], harcamaUID:.[5], imzalayan:.[7]}'

IZ_DOCUMENT_DATA=$(printf '%s\n' "$IZ_DOCUMENT" | jq -r '.[9]')
cast decode-abi 'f()(string,uint8,bytes32,bytes32,bytes32,bool)' "$IZ_DOCUMENT_DATA"

IZ_EXPENSE_UID=$(printf '%s\n' "$IZ_DOCUMENT" | jq -r '.[5]')
IZ_EXPENSE=$(iz_record "$IZ_EXPENSE_UID")
IZ_EXPENSE_DATA=$(printf '%s\n' "$IZ_EXPENSE" | jq -r '.[9]')
cast decode-abi 'f()(string,uint64,string,bytes32)' "$IZ_EXPENSE_DATA"
```

Belgenin imzalayanı kurum adresi `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` olmalı. Belge verisinin alan sırası:

```text
kayıt kimliği / tür / dosya SHA-256 / önceki sürüm UID / metadata özeti / paylaşım izni
```

Türler: `0 = eski ayrı ödeme`, `1 = eski ayrı fatura`, `2 = teslim alma`, `3 = satın alma paketi`. Bu örnekte önceki sürüm UID'si sıfır; ilk sürüm. Güncel kayıtlar yalnızca `2/3` kullanır; eski kodların zincirdeki anlamı değişmez.

Harcama çıktısı: `IZ-H001`, `6000000`, `TRY-DEMO`, metadata özeti. Tutarlar **kuruş**: 6.000.000 kuruş = 60.000 TL.

## 4. Dosyanın değişmediğini doğrula

Zincirdeki `fileHash` ile dosyanın ham baytlarından hesaplanan SHA-256 eşleşmeli. Mevcut yerel dosya üzerinden:

```sh
IZ_FILE_HASH=$(cast decode-abi 'f()(string,uint8,bytes32,bytes32,bytes32,bool)' "$IZ_DOCUMENT_DATA" --json | jq -r '.data[2]')
IZ_ACTUAL_HASH="0x$(shasum -a 256 ".data/files/${IZ_FILE_HASH#0x}" | awk '{print $1}')"

if [ "$IZ_ACTUAL_HASH" = "$IZ_FILE_HASH" ]; then
  echo 'Belge özeti zincir kaydıyla eşleşiyor.'
else
  echo 'UYUŞMAZLIK: Dosya erişilemiyor veya içerik farklı.'
fi
```

Kendi indirdiğin dosyayı doğrulamak için `shasum` komutundaki dosya yolunu değiştir. Beklenen özet: `0xc8f078d5e42aced45bd3081e0112d57395c4053974a3fccdcaf541f0ccdd6584`.

**Satın alma paketi (`kind = 3`):** Arayüzdeki paket UID'siyle aynı sorgulamayı yap. `fileHash`, iki belgenin kendisi yerine `{ "files": [...] }` JSON dosyasının ham baytlarını doğrular. Önce bu dosyanın özetini yukarıdaki yöntemle karşılaştır; ardından JSON'daki `invoice` ve `payment` girdilerinin her birinde bulunan `digest` değerini ilgili dosyanın SHA-256 özetiyle karşılaştır. Dosyalar yine `.data/files/<0x çıkarılmış digest>` konumundadır. Yalnızca JSON özetinin eşleşmesi, içindeki iki dosyanın da erişilebilir ve değişmemiş olduğunu kanıtlamaz. Tek ortak kararın `refUID` alanı bu paket UID'si olmalıdır.

Gerekçe özeti, ham cümle yerine tam `{"reason":"..."}` JSON kaydının UTF-8 baytları üzerinden hesaplanır. JSON'a boşluk veya satır sonu eklemek özeti değiştirir.

## 5. Bağışı ve ortak fon bağlantısını kontrol et

```sh
IZ_DONATION_UID='0x15355c5432461cb94f399a2275bbe4ba3a071dd29a6bcaed193f335b4a13f5d4'
IZ_DONATION=$(iz_record "$IZ_DONATION_UID")
IZ_DONATION_DATA=$(printf '%s\n' "$IZ_DONATION" | jq -r '.[9]')
cast decode-abi 'f()(string,uint64,uint64,uint64,string,uint64)' "$IZ_DONATION_DATA"

IZ_DONATION_FUND=$(printf '%s\n' "$IZ_DONATION" | jq -r '.[5]')
IZ_EXPENSE_FUND=$(printf '%s\n' "$IZ_EXPENSE" | jq -r '.[5]')
test "$IZ_DONATION_FUND" = "$IZ_EXPENSE_FUND" && echo 'Bağış ve harcama aynı fona bağlı.'
```

Beklenen: `demo-donation-1001`, brüt `100000`, kesinti `2000`, net `98000`, `TRY-DEMO`, tarih. Yani 1.000 TL / 20 TL / 980 TL. Bağışı platform adresi `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` imzalamış olmalı.

Bu bağ, bağışın ve harcamanın aynı fon kapsamında olduğunu gösterir; bireysel bağışı o faturaya bire bir tahsis etmez.

## 6. İşlem makbuzunu ve geçmişi oku

```sh
cast receipt \
  0x027bd881be2d5ea7d6141d0fe90342183d5b7bc29e3657d3aa87f1c9fbd50022 \
  --rpc-url "$IZ_RPC" --json | jq '{status,from,to,blockNumber}'

cast logs --address "$IZ_EAS" --from-block 1 --to-block latest \
  'Attested(address,address,bytes32,bytes32)' --rpc-url "$IZ_RPC"
```

Karar makbuzunda `status: 0x1`, `from: denetçi adresi`, `to: EAS adresi` beklenir. Tek başına başarılı makbuz yeterli değildir; ilgili UID, şema, içerik ve referansları yukarıdaki gibi kontrol et.

Güncel sürümü veya fon toplamını bağımsız hesaplamak için bütün olaylar blok/log sırasıyla işlenmeli; yanlış şema/imzalayan/referans, aynı iş kimliğinin tekrarı ve eski belgeye karar kabul edilmemeli. MVP'nin kuralları `server/ledger.ts` içindeki `project` işlevinde açıkça tanımlı.

## Neyi kanıtlar?

Kayıt, imzalayan adres, kayıtlar arası bağlantı ve belgenin değişmediği denetlenebilir. Faturanın gerçekliği, TL transferi veya teslimatın gerçekleştiği bu kontrollerle kanıtlanmaz. Kurum/denetçi adreslerine güven ayrıca belirlenir; açık Anvil test hesapları gerçek kimlik kanıtı değildir.

Bu doğrulama **backend'den bağımsızdır**. Yerel Anvil düğümünün sahibinden bağımsız bir mutabakat güvencesi sağlamaz; yerel ağın geçmişi sıfırlanabilir.
