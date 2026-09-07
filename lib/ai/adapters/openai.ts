import OpenAI from "openai";
import type { AIProvider, ChatMessage } from "../types";

export class OpenAIAdapter implements AIProvider {
  name = "openai";
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model = "gpt-4o-mini") {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages,
    });
    return response.choices[0]?.message?.content ?? "";
  }
}
