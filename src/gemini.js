import { GoogleGenAI, Modality } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!
});



export default async function createGeminiSession(
  onAudioChunk: (pcmBuffer: Buffer) => void,
    onUserSpeech: () => void
) {
  
  
  let resolveOpen: () => void;
  const openPromise = new Promise<void>((resolve) => {
    resolveOpen = resolve;
  });

  const session = await ai.live.connect({
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
      onopen() {
        console.log("Gemini connected");
        resolveOpen();
      },
      onmessage(message) {
        const content = message.serverContent;

        if (content?.inputTranscription?.text) {
          console.log("USER:", content.inputTranscription.text);
          onUserSpeech();
        }

        if (content?.outputTranscription?.text) {
          console.log("GEMINI:", content.outputTranscription.text);
        }

        if (content?.modelTurn?.parts) {
          for (const part of content.modelTurn.parts) {
            if (part.inlineData?.data) {
              const pcmBuffer = Buffer.from(part.inlineData.data, "base64");
              console.log("Gemini chunk size (raw base64 bytes):", pcmBuffer.length);

              onAudioChunk(pcmBuffer);
            }
          }
        }
      },
      onerror(err) {
        console.error("Gemini error:", err);
      },
      onclose(event) {
        console.log("Gemini closed:", event?.reason);
      }
    }
  });

  await openPromise;
  await session.sendClientContent({
  turns: [
    {
      role: "user",
      parts: [
        {
          text: "The candidate has entered the interview room."
        }
      ]
    }
  ],
  turnComplete: true,
});
  console.log(
  "SESSION METHODS:",
  Object.getOwnPropertyNames(
    Object.getPrototypeOf(session)
  )
);

console.log("SESSION:", session);
  console.log("Gemini session ready for realtime input");

  return session;
}