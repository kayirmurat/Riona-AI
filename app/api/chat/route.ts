import { NextRequest, NextResponse } from "next/server";
import { askRiona } from "../../../lib/ai/core";
import type { ChatMessage } from "../../../lib/ai/types";

export async function POST(req: NextRequest) {
  try {
    const { message, history } = (await req.json()) as {
      message: string;
      history?: ChatMessage[];
    };

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Mesaj boş olamaz." }, { status: 400 });
    }

    const reply = await askRiona(message, history ?? []);
    return NextResponse.json({ reply });
  } catch (err) {
    console.error("Riona AI Core error:", err);
    return NextResponse.json(
      { error: "Bir şeyler ters gitti. Lütfen tekrar dene." },
      { status: 500 }
    );
  }
}
