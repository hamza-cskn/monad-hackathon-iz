import { ArrowRight, ArrowUpRight, Check, FileCheck2, Fingerprint, Info, LockKeyhole, ReceiptText, ShieldCheck } from 'lucide-react'

export function HomePage() {
  return <div className="public-page">
    <section className="container purpose-hero" aria-labelledby="purpose-title">
      <div className="purpose-copy">
        <span className="eyebrow">BAĞIŞTA GÜVEN VE HESAP VEREBİLİRLİK</span>
        <h1 id="purpose-title">Bağışın,<br /><em>amacı için</em><br />kullanılsın.</h1>
        <p>Bağışın nereye harcandığını, hangi belgelerle desteklendiğini ve neyin henüz doğrulanmadığını takip et.</p>
        <div className="purpose-actions"><a className="button primary" href="#/bagis">Bağış yap <ArrowRight size={18} /></a><a className="text-button" href="#/takip?kod=IZ-DEMO-1001">Örnek takibi incele <ArrowUpRight size={16} /></a></div>
        <div className="purpose-caption"><LockKeyhole size={15} /><span>Odağımız bağışçıların kimliği değil, paranın nasıl kullanıldığı.</span></div>
      </div>
      <div className="record-preview" aria-label="Örnek bağış kaydı">
        <div className="record-preview-header"><span><ReceiptText size={17} />BAĞIŞ KAYDI</span><span className="demo-label">ÖRNEK</span></div>
        <div className="record-preview-amount"><span>Bağış tutarı</span><strong>1.000 <small>TL</small></strong></div>
        <div className="record-preview-fees"><span>Platform payı <small>(%2 · demo)</small><b>20 TL</b></span><span>Bağış fonuna ayrılan<b>980 TL</b></span></div>
        <div className="record-path">
          <div><span className="record-step"><Check size={16} /></span><div><strong>Tutar kayıt altında</strong><p>Kesinti ve fona ayrılan tutar belli.</p></div><span className="record-step-number">01</span></div>
          <div><span className="record-step"><ReceiptText size={16} /></span><div><strong>Harcama belgeleri incelenebilir</strong><p>Alıcı, amaç ve ilgili belgeler bir arada.</p></div><span className="record-step-number">02</span></div>
          <div><span className="record-step"><ShieldCheck size={16} /></span><div><strong>İnceleme sonucu gerekçeli</strong><p>Onay, eksik belge ve ret ayrı gösterilir.</p></div><span className="record-step-number">03</span></div>
        </div>
        <div className="record-preview-footer"><Info size={14} /><span>Bir bağış, ortak fondaki harcamalarla birlikte izlenir.</span></div>
      </div>
    </section>

    <section className="container accountability-section" aria-labelledby="accountability-title">
      <div className="accountability-heading"><span className="eyebrow">HER BAĞIŞIN ARDINDA BİR SORUMLULUK VAR</span><h2 id="accountability-title">Güven, harcamanın<br />hesabını verebilmekle başlar.</h2><p>İz, bağışın kullanımını değerlendirmek için ihtiyaç duyduğun kayıtları bir araya getirir.</p></div>
      <div className="accountability-list">
        <div><ReceiptText size={22} strokeWidth={1.5} /><div><h3>Para nereye gitti?</h3><p>Ödenen tutarı, alıcıyı ve harcamanın gerekçesini incele.</p></div></div>
        <div><FileCheck2 size={22} strokeWidth={1.5} /><div><h3>Hangi kanıtla destekleniyor?</h3><p>Satın alma ve teslim alma kanıtlarının durumunu gör.</p></div></div>
        <div><ShieldCheck size={22} strokeWidth={1.5} /><div><h3>Eksik veya uyuşmayan ne var?</h3><p>Denetçinin gerekçesine, reddedilen belgelere ve önceki sürümlere ulaş.</p></div></div>
      </div>
    </section>
    <div className="container public-demo-note"><Info size={15} /><p>Bu sürüm bir hackathon demosudur. Kurumlar, para hareketleri ve başlangıçtaki inceleme sonuçları örnektir.</p></div>
  </div>
}

const topics = [
  ['akis', 'Bağıştan denetime'], ['kanitlar', 'Kanıtlar ne anlatır?'], ['uyusmazlik', 'Eksik veya reddedilen belge'],
  ['sorumluluk', 'Kim, neyi yapar?'], ['kayit', 'Kayıt bütünlüğü ve mahremiyet'], ['demo', 'Demoyu dene'],
]

export function HowPage() {
  function jump(id: string) { document.getElementById(`how-${id}`)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }) }
  return <div className="container how-page">
    <header className="how-page-heading"><span className="eyebrow">NASIL ÇALIŞIR?</span><h1>Bağışın kullanımını<br />adım adım denetle.</h1><p>Bir bağış kaydından harcama belgelerine, denetçi kararından kayıt geçmişine kadar hangi bilgiyi takip edebileceğini öğren.</p></header>
    <div className="how-page-layout">
      <nav className="how-contents" aria-label="Bu sayfada"><span>BU SAYFADA</span>{topics.map(([id, title], i) => <button key={id} onClick={() => jump(id)}><small>0{i + 1}</small>{title}</button>)}</nav>
      <div className="how-article">
        <section id="how-akis" aria-labelledby="how-akis-title"><div className="article-kicker">01 / SÜREÇ</div><h2 id="how-akis-title">Bağıştan denetime.</h2><p>Bu site üzerinden bir kuruma bağış yaparsın. Bağışın kurumun ortak fonuna katılır. Kurumun bu fondan yaptığı harcamalar, dayanakları ve inceleme sonuçlarıyla birlikte takip edilir.</p>
          <ol className="process-list">
            <li><span>1</span><div><h3>Bağışın kaydı oluşur.</h3><p>Brüt tutar, platform payı ve fona ayrılan net tutar açıkça gösterilir. Takip kodunla aynı kayda tekrar ulaşabilirsin.</p></div></li>
            <li><span>2</span><div><h3>Kurum harcamayı belgelendirir.</h3><p>Kurum; kime, ne zaman, ne kadar ve hangi amaçla ödeme yaptığını girer. Ödeme belgesini, faturayı ve varsa teslimat kanıtını ilgili harcamaya ekler.</p></div></li>
            <li><span>3</span><div><h3>Satın alma ve teslim alma doğrulanır.</h3><p>Denetçi bu iki aşamanın belgelerini harcama kaydıyla karşılaştırır. Kararını gerekçesiyle kaydeder: onaylar, reddeder veya ek belge ister. Kurum kendi belgesine denetçi onayı veremez.</p></div></li>
            <li><span>4</span><div><h3>Bağışçı kullanımı takip eder.</h3><p>Fona giren tutarı, yapılan ödemeleri ve kalan tutarı görebilirsin. Her harcamanın belgelerini ve inceleme gerekçesini açabilirsin.</p></div></li>
          </ol>
          <aside className="article-note"><Info size={18} /><p><strong>Ortak fonu doğru yorumlamak gerekir.</strong> 1.000 TL örnek bağışın 20 TL platform payından sonra 980 TL’si fona ayrılır. Ortak fonda biriken para harcanır; bu nedenle senin 980 TL’nin belirli bir ürüne harcandığı iddia edilmez.</p></aside>
        </section>

        <section id="how-kanitlar" aria-labelledby="how-kanitlar-title"><div className="article-kicker">02 / KANITLAR</div><h2 id="how-kanitlar-title">İki aşama: satın alma ve teslim alma.</h2><p>Önce neyin, kimden ve hangi tutarla satın alındığı; ardından gerçekten teslim alınıp alınmadığı incelenir.</p>
          <div className="evidence-explanations">
            <article><span className="evidence-number">01</span><div><h3>Satın alma</h3><p>Fatura ve ödeme belgeleri bu aşamada sunulur. Satıcı, ürün veya hizmet, miktar, tutar ve ödeme bilgileri harcama kaydıyla karşılaştırılır.</p><span>Satın almanın doğrulanması, teslim alındığı anlamına gelmez.</span></div></article>
            <article><span className="evidence-number">02</span><div><h3>Teslim alma</h3><p>Teslim tutanağı, alıcı teyidi ve ilgili belgeler bu aşamada sunulur. Satın alınan ürün veya hizmetin kim tarafından, ne zaman ve hangi miktarda teslim alındığı incelenir.</p><span>Sonucun gücü, kanıtın kaynağına ve incelemenin kapsamına bağlıdır.</span></div></article>
          </div>
        </section>

        <section id="how-uyusmazlik" aria-labelledby="how-uyusmazlik-title"><div className="article-kicker">03 / UYGUNLUK İNCELEMESİ</div><h2 id="how-uyusmazlik-title">Eksikler ve uyuşmazlıklar kayıtta kalır.</h2><p>Kanıtın durumu açıkça gösterilir. Onaylanmamış bir belge, doğrulanmış harcama gibi sunulmaz.</p>
          <dl className="status-definitions"><div><dt><span className="state-dot neutral" />Sunulmadı</dt><dd>Kurum henüz bu türde belge eklememiştir.</dd></div><div><dt><span className="state-dot amber" />İnceleniyor</dt><dd>Belge yüklenmiştir; denetçi henüz karar vermemiştir.</dd></div><div><dt><span className="state-dot green" />Doğrulandı</dt><dd>Denetçi, belirtilen kapsamda inceleme yapıp gerekçeli onay vermiştir.</dd></div><div><dt><span className="state-dot amber" />Ek belge istendi</dt><dd>Karar vermek için ek bilgi veya belgeye ihtiyaç vardır.</dd></div><div><dt><span className="state-dot red" />Reddedildi</dt><dd>Belge incelemeden geçmemiştir. Ret nedeni ve eski sürüm korunur.</dd></div></dl>
          <p>Kurum düzeltme yaptığında yeni bir belge sürümü ekler. Yeni sürüm tekrar incelenir; önceki belge ve gerekçeli karar silinmez. Reddedilen belge, gerçekleşmiş bir ödemenin tutarını harcama toplamından düşürmez.</p>
          <aside className="article-note"><Info size={18} /><p><strong>İnceleme sonucu ile suistimal iddiası aynı değildir.</strong> Eksik veya uyuşmayan bir belge araştırılması gereken bir durumdur. Bu demoda ret kararı otomatik para iadesi, hesap dondurma veya ödeme engelleme işlemi başlatmaz.</p></aside>
        </section>

        <section id="how-sorumluluk" aria-labelledby="how-sorumluluk-title"><div className="article-kicker">04 / SORUMLULUKLAR</div><h2 id="how-sorumluluk-title">Her aktörün görevi açık.</h2><div className="responsibility-list"><div><h3>Bağışçı</h3><p>Bağış kaydını ve ilgili fonun harcamalarını takip eder. Belgeleri, eksikleri ve karar gerekçelerini inceleyebilir.</p></div><div><h3>Kurum</h3><p>Harcamaları doğru ve eksiksiz bildirmekten, kanıtları sunmaktan ve ek belge taleplerine cevap vermekten sorumludur.</p></div><div><h3>Denetçi</h3><p>Hangi belgeyi, hangi kapsamda incelediğini ve kararının nedenini açıklar. Bu demodaki denetçi örnek bir roldür.</p></div><div><h3>İz</h3><p>Kayıtları, belge sürümlerini ve inceleme sonuçlarını ilişkilendirir. Bağışın kullanımını değerlendirebilmen için bunları birlikte sunar.</p></div></div></section>

        <section id="how-kayit" aria-labelledby="how-kayit-title"><div className="article-kicker">05 / KAYIT BÜTÜNLÜĞÜ</div><h2 id="how-kayit-title">Değişiklikleri fark edebilmek için.</h2><p>Bağış, harcama, belge sürümü ve denetçi kararı yerel blokzincirde birbirine bağlı kayıtlardır. Belge değişirse yeniden hesaplanan parmak izi kayıtla eşleşmez. Her kayıtta işlemi imzalayan adres ve işlem kimliği görülebilir.</p><div className="chain-explainer"><Fingerprint size={23} /><p>Blockchain kaydı, yayımlanan parmak izinin bütünlüğünü kontrol etmeyi sağlar. Faturanın gerçekliğini, denetçinin yetkisini veya yardımın teslim edildiğini kendiliğinden kanıtlamaz.</p></div><h3>Bağışçıların mahremiyeti</h3><p>Arayüzde bağışçı listesi, bağış sıralaması veya isim gösterimi bulunmaz. Kanıt kaydı için belgenin içeriği zincire gönderilmez; parmak izi, kayıt ilişkileri ve inceleme kararı gönderilir. İşlemi yapan cüzdan adresi ise açık blokzincirde görülebilir.</p><p>Kayıtlar ve belgeler sunucuda saklanır; takip bağlantın başka tarayıcılarda da çalışır. Kurum ve denetçi ayrı cüzdanlarla giriş yapar. Orijinal belgeler bu iki role açıktır; kurumun paylaşmayı seçtiği örnek belgeler bağışçılara da gösterilir.</p></section>

        <section id="how-demo" aria-labelledby="how-demo-title"><div className="article-kicker">06 / ÖRNEK İNCELEME</div><h2 id="how-demo-title">Bir bağış kaydını kendin incele.</h2><p>Örnek kayıtta tutar ve kesintiyi gör, ilgili fonun harcamalarını aç, ardından satın alma ve teslim alma durumlarını karşılaştır.</p><a className="button primary" href="#/takip?kod=IZ-DEMO-1001">Örnek bağışı incele <ArrowRight size={17} /></a><p className="article-demo-caption">Gerçek para alınmaz. Başlangıçtaki belge ve denetçi kararları örnek verilerdir. Bu sürüm yerel Anvil ağına bağlıdır. Bağışçıdan cüzdan istenmez; kurum ve denetçi kendi cüzdanlarıyla kayıt imzalar.</p></section>
      </div>
    </div>
  </div>
}
