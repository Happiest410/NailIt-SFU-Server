import { Participant } from "./participant.ts"
import createGeminiSession from "./gemini.ts";
import { MediaBridge } from "./mediaBridge.ts";
import { AIState } from "./AIstate.ts";
import { GeminiProvider } from "./geminiProvider.ts";
import type { types } from "mediasoup";
import type { AIProvider } from "./AIProvider.ts";
export class AIInterviewer {

    provider: AIProvider

    mediaBridge: MediaBridge;

    state: AIState;

    constructor(mediaBridge:MediaBridge){
       this.provider=new GeminiProvider(process.env.GEMINI_API_KEY || "")
       this.mediaBridge=mediaBridge
       this.state=AIState.CREATED
       this.provider.on("audio", (pcm: Buffer) => {
        this.mediaBridge.interruptGeneration = false;
    this.mediaBridge.enqueueGeminiAudioChunk(pcm);
});
this.provider.on("candidateTranscript",(transcript:string)=>{
    mediaBridge.interruptGeneration=false
   console.log("USER:", transcript);
})
this.provider.on("aiTranscript",(transcript:string)=>{
   
   console.log("USER:", transcript);
})
    }

        async sendAudio(pcm: Buffer) {


        await this.provider.sendAudio(pcm);
    }

}