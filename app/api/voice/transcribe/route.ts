import { NextRequest, NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";

export const dynamic = "force-dynamic";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// MediaRecorder'ın ürettiği konteyner tarayıcıya göre değişiyor (Chrome/Edge
// webm, Safari mp4 üretiyor) — Whisper'a doğru uzantıyla göndermek için
// istemcinin bildirdiği MIME tipinden bir dosya adı türetiliyor.
function extensionFor(mimeType: string): string {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("wav")) return "wav";
  return "webm";
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const audio = formData.get("audio");

  if (!audio || !(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json({ text: "" });
  }

  try {
    const buffer = Buffer.from(await audio.arrayBuffer());
    const mimeType = audio.type || "audio/webm";
    const file = await toFile(buffer, `audio.${extensionFor(mimeType)}`, { type: mimeType });

    const result = await client.audio.transcriptions.create({
      file,
      model: "gpt-4o-mini-transcribe",
      language: "tr",
    });

    return NextResponse.json({ text: (result.text ?? "").trim() });
  } catch (e) {
    console.error("Transkripsiyon hatası:", e);
    return NextResponse.json({ error: "Ses metne çevrilemedi." }, { status: 500 });
  }
}
