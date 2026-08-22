import { GoogleGenAI, Modality } from "@google/genai";
import { AIProvider } from "./AIProvider.ts";

export class GeminiProvider extends AIProvider {
    private ai?: GoogleGenAI;
    private session: any;
    private apiKey: string;

    constructor(apiKey?: string) {
        super();
        this.apiKey = apiKey || process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GOOGLE_API_KEY || "";
    }

    async connect(): Promise<void> {
        const key = this.apiKey || process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GOOGLE_API_KEY || "";
        
        if (!key) {
            console.error("CRITICAL ERROR: GEMINI_API_KEY is missing in environment variables!");
            throw new Error("GEMINI_API_KEY is missing from server environment variables.");
        }

        this.ai = new GoogleGenAI({ apiKey: key });

        let resolveOpen!: () => void;
        const openPromise = new Promise<void>((resolve) => {
            resolveOpen = resolve;
        });

        this.session = await this.ai.live.connect({
            model: "gemini-3.1-flash-live-preview",
            config: {
                responseModalities: [Modality.AUDIO],
                inputAudioTranscription: {},
                outputAudioTranscription: {},
                systemInstruction: `
You are an AI interviewer.
Your responsibilities:
- Begin the interview immediately after the session starts.
- Introduce yourself briefly.
- Explain the interview format.
- Ask the first question without waiting for the candidate.
- Conduct the interview naturally.
- Ask one question at a time.
- Wait for the candidate's response before continuing.
`
            },
            callbacks: {
                onopen: () => {
                    console.log("Gemini connected successfully");
                    resolveOpen();
                },
                onmessage: (message) => {
                    this.handleMessage(message);
                },
                onerror: (err) => {
                    console.error("Gemini connection error:", err);
                    this.emit("error", err);
                },
                onclose: (event) => {
                    console.log("Gemini connection closed:", event?.reason);
                    this.emit("closed");
                }
            }
        });

        await openPromise;
    }

    async startConversation(initialMessage: string): Promise<void> {
        if (!this.session) throw new Error("Gemini session not initialized");
        await this.session.sendClientContent({
            turns: [
                {
                    role: "user",
                    parts: [{ text: initialMessage }]
                }
            ],
            turnComplete: true
        });
    }

    async sendAudio(pcm: Buffer): Promise<void> {
        if (!this.session) return;
        await this.session.sendRealtimeInput({
            audio: {
                data: pcm.toString("base64"),
                mimeType: "audio/pcm;rate=48000"
            }
        });
    }

    async sendText(text: string): Promise<void> {
        if (!this.session) return;
        await this.session.sendClientContent({
            turns: [
                {
                    role: "user",
                    parts: [{ text }]
                }
            ],
            turnComplete: true
        });
    }

    async interrupt(): Promise<void> {}

    async disconnect(): Promise<void> {
        if (this.session) {
            await this.session.close();
        }
    }

    async close(): Promise<void> {
        await this.disconnect();
    }

    private handleMessage(message: any): void {
        if (message.serverContent?.interrupted) {
            this.emit("interrupted");
        }
        const content = message.serverContent;

        if (content?.inputTranscription?.text) {
            this.emit("candidateTranscript", content.inputTranscription.text);
        }

        if (content?.outputTranscription?.text) {
            this.emit("aiTranscript", content.outputTranscription.text);
        }

        if (content?.modelTurn?.parts) {
            for (const part of content.modelTurn.parts) {
                if (part.inlineData?.data) {
                    this.emit(
                        "audio",
                        Buffer.from(part.inlineData.data, "base64")
                    );
                }
            }
        }
    }
}
