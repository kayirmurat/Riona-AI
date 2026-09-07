// Riona AI - Model Adapter Interface
// AI Core bu arayüzden başka HİÇBİR sağlayıcıya özel detay bilmez.
// Yeni bir sağlayıcı eklemek = bu arayüzü uygulayan yeni bir adapter yazmak.

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIProvider {
  name: string;
  chat(messages: ChatMessage[]): Promise<string>;
}
