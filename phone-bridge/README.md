# Riona Telefon Köprü Sunucusu

Bu, ana Riona AI (Next.js/Vercel) uygulamasından **ayrı, sürekli açık** küçük
bir Node servisi. Görevi: Twilio'nun telefon aramasını (Media Streams) OpenAI'nin
gerçek zamanlı ses API'sine bağlamak. Vercel'in serverless fonksiyonları bir
telefon görüşmesi boyunca açık kalan bir WebSocket bağlantısını tutamadığı için
bu iş ayrı bir yerde barındırılıyor.

Tüm gerçek iş mantığı (sistem talimatı, araç çalıştırma, onay kuyruğu, konuşma
kaydı) ana Next.js uygulamasında kalıyor — bu servis sadece "tercümanlık"
yapıyor, `APP_BASE_URL`'deki `/api/phone/*` endpoint'lerini çağırarak.

## Kurulum (Render üzerinde)

1. [render.com](https://render.com)'da hesap aç (yoksa).
2. "New +" → "Web Service" → bu GitHub reposunu bağla.
3. **Root Directory**: `phone-bridge`
4. **Runtime**: Node
5. **Build Command**: `npm install`
6. **Start Command**: `npm start`
7. **Instance Type**: en ucuz her zaman-açık plan (free tier YETMEZ — uykuya
   dalar, arama geldiğinde anında cevap veremez).
8. Environment Variables (Render panelinden gir):
   - `OPENAI_API_KEY` — ana projedeki ile aynı olabilir.
   - `APP_BASE_URL` — `https://riona-ai-tau.vercel.app`
   - `PHONE_BRIDGE_SECRET` — rastgele, uzun bir string SEÇ; aynı değeri
     Vercel'deki ana projeye de `PHONE_BRIDGE_SECRET` adıyla ekle.
   - `TWILIO_WEBHOOK_PATH_SECRET` — rastgele, uzun başka bir string seç
     (diğer webhook secret'larıyla aynı mantık).
   - `REALTIME_MODEL` — `gpt-realtime-2.1` (varsayılan; hacim artıp maliyet
     önemli olursa `gpt-realtime-2.1-mini` yapılabilir, kod değişikliği
     gerekmez).
9. Deploy et, Render'ın verdiği genel adresi not al (ör. `https://riona-phone-bridge.onrender.com`).

## Kurulum (Twilio tarafı)

1. [twilio.com](https://www.twilio.com)'da hesap aç.
2. Console'dan bir ABD telefon numarası satın al (~$1.15/ay).
3. Numaranın ayarlarına git → "Voice Configuration" → "A call comes in" →
   **Webhook**, URL:
   `https://<render-adresin>/incoming-call/<TWILIO_WEBHOOK_PATH_SECRET-degerin>`
   HTTP metodu: `HTTP POST`.
4. Kaydet.

## Test

Numarayı ara — bağlanınca Riona seninle konuşmaya başlamalı. Aramanın
kaydı ana uygulamada (sol menü, sohbet listesi) "📞 ..." başlıklı yeni bir
konuşma olarak görünür. Arayan bir istek/mesaj bırakırsa, bu Ayarlar'daki
"Bekleyen İşlemler" listesine düşer.

## Sınırlamalar (bilinçli, ilk sürüm)

- Sadece `take_message` aracı var — mail/takvim gibi kişisel bilgilere bu
  hat üzerinden erişim YOK (herkese açık bir hat olduğu için kasıtlı).
- Tüm aramalar aynı, dar yetkili asistanla karşılanıyor — "kişisel" ve
  "iş" ayrımı yok, tek numara.
