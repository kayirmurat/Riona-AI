import { NextRequest, NextResponse } from "next/server";
import { askRiona } from "../../../lib/ai/core";

export async function POST(req: NextRequest) {
  try {
    const { message, conversationId } = (await req.json()) as {
      message: string;
      conversationId: string;
    };

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Mesaj boş olamaz." }, { status: 400 });
    }
    if (!conversationId || typeof conversationId !== "string") {
      return NextResponse.json({ error: "conversationId eksik." }, { status: 400 });
    }

    const reply = await askRiona(conversationId, message);
    return NextResponse.json({ reply });
  } catch (err) {
    console.error("Riona AI Core error:", err);
    return NextResponse.json(
      { error: "Bir şeyler ters gitti. Lütfen tekrar dene." },
      { status: 500 }
    );
  }
}
