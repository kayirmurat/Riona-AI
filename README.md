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
