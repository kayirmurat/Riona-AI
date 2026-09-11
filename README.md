# Riona AI — Aşama 1 (AI Core)

Bu klasör, Riona AI'nin ilk çalışan parçası: basit bir sohbet arayüzü + OpenAI'a bağlı AI Core.

## Kurulum adımların (API anahtarını sen gireceksin, kimseyle paylaşmayacaksın)

1. GitHub'da yeni, **boş** bir repo oluştur (örn. `riona-ai`), README eklemeden.
2. Bu klasördeki tüm dosyaları o repoya yükle (GitHub web arayüzünde "Add file → Upload files" ile sürükle-bırak yeterli).
3. vercel.com → "Add New... → Project" → GitHub reponu seç → "Import".
4. Import ekranında **"Environment Variables"** bölümünü aç ve şunları ekle:
   - `AI_PROVIDER` = `openai`
   - `OPENAI_API_KEY` = (senin OpenAI'da oluşturduğun `sk-...` anahtarı)
5. "Deploy" butonuna bas. 1-2 dakika içinde bir URL (ör. `riona-ai.vercel.app`) verecek.
6. O URL'yi açıp bir mesaj yaz — Riona AI cevap veriyorsa Aşama 1 testi başarılı demektir.

Not: `.env.example` dosyasındaki değerler örnektir; gerçek anahtarı asla bir dosyaya veya sohbete yazma, yalnızca Vercel'in kendi Environment Variables ekranına gir.

## Gerçek Zamanlı Mail Ajanı Kurulumu (Stage 14)

Bu adımlar Google Cloud Console'da yapılır, koda dokunmaz. `.env.example`'daki üç yeni
değişkenin (`GCP_PROJECT_ID`, `PUBSUB_TOPIC_NAME`, `GMAIL_PUSH_WEBHOOK_SECRET`) nereden geldiğini
gösterir.

1. **GCP projesi**: console.cloud.google.com → üstte proje seçiciden mevcut bir proje yoksa
   "New Project" ile oluştur. Proje sayfasında görünen **Project ID** → `GCP_PROJECT_ID`.
2. **API'leri etkinleştir**: sol menüden "APIs & Services → Library" → "Gmail API" ara → **Enable**.
   Aynı sayfada "Cloud Pub/Sub API" ara → **Enable**.
3. **Pub/Sub topic oluştur**: "Pub/Sub → Topics → Create Topic". Topic ID'yi kendin seç
   (örn. `gmail-notifications`) → bu değer `PUBSUB_TOPIC_NAME`.
4. **Gmail'e yayın izni ver (kritik, atlanırsa bildirimler hiç gelmez)**: oluşturduğun topic'e
   tıkla → "Permissions" sekmesi → "Add Principal" → principal alanına
   `gmail-api-push@system.gserviceaccount.com` yaz → Role olarak **Pub/Sub Publisher** seç → Save.
5. **`GMAIL_PUSH_WEBHOOK_SECRET` değerini kendin seç**: rastgele, uzun bir string (örn. bir şifre
   yöneticisinden üretilen 32+ karakterlik bir değer). Bunu hem Vercel'e hem bir sonraki adımda
   Pub/Sub'a gireceksin — ikisi birebir aynı olmalı.
6. **Push subscription oluştur**: aynı topic sayfasında "Create Subscription" → Delivery type:
   **Push** → Endpoint URL:
   `https://riona-ai-tau.vercel.app/api/webhooks/gmail/<GMAIL_PUSH_WEBHOOK_SECRET-degerin>`
   (kod deploy edildikten sonra bu URL çalışır hale gelir).
7. **Vercel'e env değişkenlerini gir**: Settings → Environment Variables →
   `GCP_PROJECT_ID`, `PUBSUB_TOPIC_NAME`, `GMAIL_PUSH_WEBHOOK_SECRET` — **Production ve Preview
   ikisi için de işaretli** olsun.
8. **Watch kaydını başlat**: kod deploy edildikten sonra tarayıcıda
   `https://riona-ai-tau.vercel.app/api/gmail/watch?secret=<CRON_SECRET-degerin>` adresini aç —
   `{"success":true,...}` dönerse kayıt tamamlanmış demektir. Bu kayıt kendiliğinden günlük olarak
   yenilenir (bkz. `vercel.json`), elle tekrar yapmana gerek yok.

## Toplantı Botu Kurulumu (Stage 15)

Bu adımlar Meeting BaaS'ın kendi sitesinde yapılır (Google Cloud'a gerek yok).
`.env.example`'daki dört yeni değişkenin (`APP_BASE_URL`, `MEETING_BAAS_API_KEY`,
`MEETING_BAAS_WEBHOOK_PATH_SECRET`, `MEETING_BAAS_WEBHOOK_SECRET`) nereden geldiğini gösterir.

**⚠️ Gizlilik notu — mutlaka oku:** Bot, toplantıya "Riona AI Notetaker" adıyla, diğer
katılımcılara **görünür bir katılımcı** olarak girer — gizli/sessiz bir kayıt değildir. Kaydettiğin
toplantılara göre, diğer katılımcıları önceden bilgilendirmen yasal/etik açıdan gerekebilir
(ülke ve toplantı türüne göre değişir).

1. **Hesap aç**: auth.meetingbaas.com adresinden kaydol (ilk 8 kayıt saati ücretsiz).
2. **API anahtarını al**: dashboard.meetingbaas.com → panelde API anahtarın görünür olacak
   → bu değer `MEETING_BAAS_API_KEY`.
3. **`MEETING_BAAS_WEBHOOK_PATH_SECRET` değerini kendin seç**: rastgele, uzun bir string
   (Gmail kurulumundaki `GMAIL_PUSH_WEBHOOK_SECRET` ile aynı mantık) — sadece Vercel'e gireceksin,
   Meeting BaaS tarafında ayrıca bir yere girmen gerekmiyor (bot isteğiyle birlikte otomatik gidiyor).
4. **`MEETING_BAAS_WEBHOOK_SECRET` değerini panelden al**: dashboard.meetingbaas.com → webhook
   ayarları ekranında imzalama (signing) secret'ı gösterilir — bu değer `MEETING_BAAS_WEBHOOK_SECRET`
   (bir önceki maddedeki kendi seçtiğin secret'tan farklı, karıştırma).
5. **`APP_BASE_URL`**: `https://riona-ai-tau.vercel.app` (sondaki `/` olmadan).
6. **Vercel'e env değişkenlerini gir**: Settings → Environment Variables →
   `APP_BASE_URL`, `MEETING_BAAS_API_KEY`, `MEETING_BAAS_WEBHOOK_PATH_SECRET`,
   `MEETING_BAAS_WEBHOOK_SECRET` — Production ve Preview ikisi için de işaretli olsun.
7. **GitHub Actions için `CRON_SECRET`'ı ekle** (Vercel Hobby planı sık cron'a izin vermediği için
   bot gönderme işi GitHub Actions'ta çalışıyor): GitHub reponda Settings → Secrets and variables →
   Actions → "New repository secret" → adı `CRON_SECRET`, değeri Vercel'deki `CRON_SECRET` ile
   **birebir aynı**.

## Web Push Bildirimleri Kurulumu (Stage 14, Stage 5)

Bunun için Google Cloud'a gerek yok — bildirim anahtarları (VAPID) kod tarafında zaten üretildi.
Sadece Vercel'e şu değerleri girmen gerekiyor (Settings → Environment Variables, Production ve
Preview ikisi için de işaretli):

- `VAPID_PUBLIC_KEY` = `BJuhoOVH96ly4fFI0lDI34GNk71n7d2lpoqpjXdHI-mO8BjvtqMDH-k-wRd6aDZu2hELl6b4x5V56h_IAzIVQec`
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` = (yukarıdakiyle **birebir aynı** değer — biri sunucu, diğeri
  tarayıcı tarafında kullanılıyor, bu yüzden iki ayrı isimle giriliyor)
- `VAPID_PRIVATE_KEY` = `wzi2vhgn_uZpwZ7udkhK9DWtXYq09lk4aiFBoTS4A-Q`
- `VAPID_SUBJECT` = `mailto:kendi-mailin@example.com` (kendi mailin, Google'ın gerektiğinde
  ulaşabilmesi için)

Ayrıca Supabase'de bir SQL daha çalıştırman gerekiyor:

```sql
create table push_subscriptions (
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
```

Bunları yapıp yeniden deploy ettikten sonra, uygulamanın sol menüsünde (sidebar altında) çıkan
**"🔔 Bildirimleri Etkinleştir"** butonuna tıklayıp tarayıcı izni ver — bundan sonra cevap
gerektiren yeni bir mail geldiğinde tarayıcı bildirimi alacaksın.
