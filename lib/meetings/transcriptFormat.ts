// Meeting BaaS'ın gerçek transkript satırı şekli düz bir "text" alanı DEĞİL,
// kelime bazlı bir dizi: {speaker, words: [{start, end, word}, ...]}. Önceki
// kod "line.words ?? line.text" gibi bir düşüşle words dizisini doğrudan
// string'e çevirmeye çalışıyordu — bir obje dizisi template literal içinde
// kullanılınca Array.toString() devreye girip her obje "[object Object]"e
// dönüşüyordu (canlı testte "Unknown: [object Object],[object Object],..."
// olarak görüldü ve bu bozuk metin özetleme AI'sine gönderildiği için özet
// de konuşmayla alakasız çıktı). Gerçek metni kelimeleri birleştirerek kurmak
// gerekiyor.
interface TranscriptWord {
  word?: string;
}

interface TranscriptLine {
  speaker?: string;
  speaker_name?: string;
  name?: string;
  text?: string;
  message?: string;
  words?: (TranscriptWord | string)[];
}

function extractLineText(line: TranscriptLine): string {
  if (typeof line?.text === "string" && line.text.trim()) return line.text.trim();
  if (typeof line?.message === "string" && line.message.trim()) return line.message.trim();
  if (Array.isArray(line?.words)) {
    return line.words
      .map((w) => (typeof w === "string" ? w : w?.word ?? ""))
      .join("")
      .trim();
  }
  return "";
}

export function formatTranscriptLines(transcript: unknown): { speaker: string; text: string }[] {
  if (!Array.isArray(transcript)) return [];
  return transcript
    .map((line: any) => ({
      speaker: line?.speaker ?? line?.speaker_name ?? line?.name ?? "Konuşmacı",
      text: extractLineText(line),
    }))
    .filter((line) => line.text.length > 0);
}

export function formatTranscriptText(transcript: unknown): string {
  return formatTranscriptLines(transcript)
    .map((line) => `${line.speaker}: ${line.text}`)
    .join("\n");
}
