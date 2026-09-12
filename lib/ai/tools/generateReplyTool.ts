import type { Tool } from "../tool";
import { supabase } from "../../db/supabase";
import { generateDraftForEmail } from "../mailProcessing";

// Sohbette "şu kişiden/konudan gelen maile cevap taslağı hazırla" dendiğinde
// çağrılır — create_email_draft'tan farklı olarak SIFIRDAN bir mail yazmaz,
// zaten taranmış (scanned_emails) bir maile Mail panelindeki "Onay Bekleyen"
// akışıyla aynı şekilde bir cevap taslağı üretir. riskLevel "low" olarak
// ayarlı: bu araç sadece taslak HAZIRLAR, göndermez — gerçek onay zaten
// Mail panelinde ayrıca isteniyor, o yüzden burada ekstra bir sohbet-içi
// onay adımına gerek yok.
export const generateReplyTool: Tool = {
  definition: {
    name: "generate_reply_draft",
    description:
      "Daha önce taranmış bir e-postaya (scanned_emails) cevap taslağı hazırlar ve Mail panelindeki 'Onay Bekleyen' sekmesine ekler. Kullanıcı 'şu kişiden/konudan gelen maile cevap taslağı hazırla' gibi bir şey söylediğinde bu aracı çağır. Yeni, alıcısı belirtilmiş sıfırdan bir mail için bunun yerine create_email_draft kullan.",
    parameters: {
      type: "object",
      properties: {
        from_contains: { type: "string", description: "Gönderenin adının veya e-posta adresinin bir kısmı (biliniyorsa)" },
        subject_contains: { type: "string", description: "Konu satırının bir kısmı (biliniyorsa)" },
      },
    },
  },
  riskLevel: "low",
  async execute(args) {
    const fromContains = typeof args.from_contains === "string" ? args.from_contains.trim() : "";
    const subjectContains = typeof args.subject_contains === "string" ? args.subject_contains.trim() : "";

    if (!fromContains && !subjectContains) {
      return "Hangi maile cevap taslağı hazırlanacağını anlayamadım — gönderen adını veya konuyu belirt.";
    }

    let query = supabase
      .from("scanned_emails")
      .select("id, subject, from_address, pending_action_id")
      .order("created_at", { ascending: false })
      .limit(10);
    if (fromContains) query = query.ilike("from_address", `%${fromContains}%`);
    if (subjectContains) query = query.ilike("subject", `%${subjectContains}%`);

    const { data } = await query;
    const rows = data ?? [];
    if (rows.length === 0) return "Eşleşen bir mail bulamadım.";

    const candidate = rows.find((row: any) => !row.pending_action_id);
    if (!candidate) {
      const first = rows[0];
      return `"${first.subject}" (${first.from_address}) için zaten bir taslak/aksiyon var, Mail panelinden kontrol edebilirsin.`;
    }

    const result = await generateDraftForEmail(candidate.id);
    if (!result.success) return `Taslak oluşturulamadı: ${result.error}`;

    return `"${candidate.subject}" (${candidate.from_address}) mailine cevap taslağı hazırladım — Mail panelindeki Onay Bekleyen sekmesinde onayını bekliyor.`;
  },
};
