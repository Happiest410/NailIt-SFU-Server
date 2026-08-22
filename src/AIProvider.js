import { EventEmitter } from "events";

export abstract class AIProvider extends EventEmitter {

    abstract connect(): Promise<void>;

    abstract disconnect(): Promise<void>;

    abstract startConversation(
        systemPrompt: string,
        initialMessage?: string
    ): Promise<void>;

    abstract sendAudio(pcm: Buffer): Promise<void>;

    abstract sendText(text: string): Promise<void>;

    abstract interrupt(): Promise<void>;

    abstract close(): Promise<void>;

    
}