import type { Tool } from "../tool";

// Telefon köprü sunucusunun (bkz. phone-bridge/) çağırdığı tek araç — telefonla
// arayan biri bir istek/mesaj bıraktığında bunu kaydeder. Riskli sayılıyor
// (riskLevel: "medium") ki hiçbir zaman doğrudan çalıştırılmasın, her zaman
// mevcut "onay bekleyen işlemler" kuyruğuna düşsün — arayan kişi telefonda
// hiçbir şeyi onaylamış olmuyor, kullanıcı bunu Ayarlar'dan kendisi görüp
// değerlendiriyor. execute() burada gerçek bir işlem yapmıyor çünkü asıl kayıt
// zaten pending_actions'a düşerken (createPendingAction ile) oluşuyor —
// onaylandığında sadece bunu doğrulayan bir mesaj dönüyor.
export const takeMessageTool: Tool = {
  definition: {
    name: "take_message",
    description:
      "Telefonla arayan biri bir mesaj, istek veya geri arama talebi bıraktığında bunu kaydetmek için kullan. Bu bir not oluşturur ve kullanıcının onayına/değerlendirmesine sunulur — arayana hemen bir işlem yapıldığını söyleme, sadece notunun alındığını ve kendisine dönüş yapılacağını söyle.",
    parameters: {
      type: "object",
      properties: {
        caller_name: { type: "string", description: "Arayan kişinin adı (belirttiyse), yoksa boş bırak." },
        caller_number: { type: "string", description: "Arayan kişinin telefon numarası (varsa)." },
        message: { type: "string", description: "Arayan kişinin ilettiği istek/mesajın kısa ve net özeti." },
        callback_requested: { type: "boolean", description: "Arayan kişi geri arama istedi mi." },
      },
      required: ["message"],
    },
  },
  riskLevel: "medium",
  async execute() {
    return "Mesaj kaydedildi ve onaya sunuldu.";
  },
};
