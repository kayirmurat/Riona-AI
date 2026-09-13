import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const dynamic = "force-dynamic";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ALLOWED_VOICES = new Set(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]);

export async function POST(req: NextRequest) {
  const { text, voice, speed } = await req.json();

  if (!text || typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "Metin eksik." }, { status: 400 });
  }

  const selectedVoice = typeof voice === "string" && ALLOWED_VOICES.has(voice) ? voice : "alloy";
  const selectedSpeed = typeof speed === "number" && speed >= 0.25 && speed <= 4 ? speed : 1;

  try {
    const response = await client.audio.speech.create({
      model: "tts-1",
      voice: selectedVoice as any,
      input: text.slice(0, 4000),
      speed: selectedSpeed,
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("Seslendirme hatası:", e);
    return NextResponse.json({ error: "Metin seslendirilemedi." }, { status: 500 });
  }
}
