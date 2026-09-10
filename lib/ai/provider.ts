import type { AIProvider } from "./types";
import { OpenAIAdapter } from "./adapters/openai";

export function getProvider(): AIProvider {
  const providerName = process.env.AI_PROVIDER ?? "openai";
  switch (providerName) {
    case "openai":
      return new OpenAIAdapter(process.env.OPENAI_API_KEY ?? "");
    default:
      throw new Error(`Bilinmeyen AI_PROVIDER: ${providerName}`);
  }
}
