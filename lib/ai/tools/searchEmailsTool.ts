import type { Tool } from "../tool";
import { searchEmails } from "../../integrations/google/gmail";

// get_recent_emails sadece Gmail'in en son birkaç mesajını getiriyor —
// kullanıcı "5 ay önce gelen X maili" gibi geçmişe dönük bir şey sorduğunda
// bu yetersiz kalıyor. Bu araç Gmail'in kendi arama motorunu (canlı posta
// kutusunun tamamı, bizim veritabanımızla sınırlı değil) doğrudan kullanır.
export const searchEmailsTool: Tool = {
  definition: {
    name: "search_emails",
    description:
      "Kullanıcının GERÇEK Gmail posta kutusunun TAMAMINDA arama yapar (sadece son birkaç mail değil, geçmişteki herhangi bir tarihe kadar). Kullanıcı belirli bir gönderen, konu veya geçmiş bir zamandan bahsettiğinde ('geçen ay', 'X ay/hafta önce', 'X kişisinden gelen mail' gibi) bu aracı get_recent_emails yerine kullan. Gmail'in kendi arama sözdizimini kullan: 'from:isim', 'subject:kelime', 'after:YYYY/AA/GG', 'before:YYYY/AA/GG', ya da düz metin. Örnek: 'from:ahmet after:2025/04/01 fatura'.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Gmail arama sorgusu (Gmail'in arama çubuğuyla aynı sözdizimi)" },
        account: { type: "string", description: "Hangi hesap: etiket veya e-posta adresi. Belirtilmezse tüm bağlı hesaplar taranır." },
        max_results: { type: "number", description: "Kaç sonuç getirileceği (varsayılan 10)" },
      },
      required: ["query"],
    },
  },
  riskLevel: "low",
  async execute(args) {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    if (!query) return "Arama sorgusu belirtilmedi.";
    const account = typeof args.account === "string" ? args.account : undefined;
    const maxResults = typeof args.max_results === "number" ? args.max_results : 10;
    return searchEmails(query, maxResults, account);
  },
};
