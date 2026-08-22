import { GoogleGenAI, Modality } from "@google/genai";
import { AIProvider } from "./AIProvider.ts";
export class GeminiProvider extends AIProvider {

    private readonly ai: GoogleGenAI;

    private session: any;

    constructor(apiKey: string) {
        super();

        this.ai = new GoogleGenAI({
            apiKey
        });
    }

    async connect(): Promise<void> {

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
                 systemInstruction:
      
           `
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

                    console.log("Gemini connected");

                    // this.emit("connected");

                    resolveOpen();

                },

                onmessage: (message) => {
                    
                    this.handleMessage(message);

                },

                onerror: (err) => {

                    console.error(err);

                    this.emit("error", err);

                },

                onclose: (event) => {

                    console.log(event.reason);

                    this.emit("closed");

                }

            }

        });

        await openPromise;

    }

    async startConversation(
       
        initialMessage: string
    ): Promise<void> {

        await this.session.sendClientContent({

            turns: [

                {

                    role: "user",

                    parts: [

                        {

                            text: initialMessage

                        }

                    ]

                }

            ],

            turnComplete: true

        });

    }

    async sendAudio(
        pcm: Buffer
    ): Promise<void> {

        await this.session.sendRealtimeInput({

            audio: {

                data: pcm.toString("base64"),

                mimeType: "audio/pcm;rate=48000"

            }

        });

    }

    async sendText(
        text: string
    ): Promise<void> {

        await this.session.sendClientContent({

            turns: [

                {

                    role: "user",

                    parts: [

                        {

                            text

                        }

                    ]

                }

            ],

            turnComplete: true

        });

    }

    async interrupt(): Promise<void> {

        

    }

    async disconnect(): Promise<void> {

        await this.session.close();

    }

    async close(): Promise<void> {

        await this.disconnect();

    }

    private handleMessage(message: any): void {
    
       if (message.serverContent?.interrupted) {
            this.emit("interrupted");
        }
console.log("on message fired")
        const content = message.serverContent;

        if (content?.inputTranscription?.text) {

            this.emit(
                "candidateTranscript",
                content.inputTranscription.text
            );

        }

        if (content?.outputTranscription?.text) {

            this.emit(
                "aiTranscript",
                content.outputTranscription.text
            );

        }

        if (content?.modelTurn?.parts) {

            for (const part of content.modelTurn.parts) {

                if (part.inlineData?.data) {
                    console.log("haa re bhadvu")

                    console.log(
                "Received AI audio:",
                Buffer.from(part.inlineData.data, "base64").length
            );


                    this.emit(
                        "audio",
                        Buffer.from(
                            part.inlineData.data,
                            "base64"
                        )
                    );

                }

            }

        }

    }

}