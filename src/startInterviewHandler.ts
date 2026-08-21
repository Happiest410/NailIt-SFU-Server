import type { startMeetData } from "./types.js";
import { Interview} from "./interview.ts";
import { Room } from "./Room.ts";
import dotenv from 'dotenv'
import { IncomingAudioPipeline } from "./IncomingAudioPipeline.ts";
import { AIInterviewer } from "./AiInterviewer.ts";
import { MediaBridge } from "./mediaBridge.ts";
import { Socket } from "socket.io";
import dgram from "dgram";
import { GeminiProvider } from "./geminiProvider.ts";
dotenv.config()
const AI_SSRC = 22222222;
const AI_PAYLOAD_TYPE = 101;
export async function handleStartInterview(socket:Socket,data:startMeetData,room:Room,resampler:any,opusEncoderAI:any){
   //check wether the particular user is allowed to start the meet or not

   //get interview details as in how this particular interview needs to be conducted
   
   //create a intevriew class

    console.log("1. handleStartInterview entered");
   
    const AiInputTransport = await room.router.createPlainTransport({
      listenInfo: { protocol: "udp", ip: "127.0.0.1" },
      rtcpMux: true,
      comedia: false
    });

   const participant = room.participants.get(socket.data.user.id);

if (!participant) {
    throw new Error("Participant not found");
}

const audioProducer = [...participant.producers.values()].find(
    (producer) => producer.kind === "audio"
);

if (!audioProducer) {
    throw new Error("Audio producer not found");
}

const aiConsumer = await AiInputTransport.consume({
    producerId: audioProducer.id,
    rtpCapabilities: room.router.rtpCapabilities,
});


   

    
    const aiOutputTransport = await room.router.createPlainTransport({
      listenInfo: { protocol: "udp", ip: "127.0.0.1" },
      rtcpMux: true,
      comedia: false
    });

    const aiOutputProducer = await aiOutputTransport.produce({
      kind: "audio",
      rtpParameters: {
        codecs: [
          {
            mimeType: "audio/opus",
            payloadType: AI_PAYLOAD_TYPE,
            clockRate: 48000,
            channels: 2,
            parameters: {}
          }
        ],
        encodings: [{ ssrc: AI_SSRC }]
      }
    });

aiOutputProducer.on("score", (score) => {
    console.log("Producer score:", score);
});

aiOutputProducer.on("trace", (trace) => {
    console.log("Producer trace:", trace);
});


const rtpSendSocket = dgram.createSocket("udp4");

await new Promise<void>((resolve, reject) => {
    rtpSendSocket.bind(0, (err?: Error) => {
        if (err) reject(err);
        else resolve();
    });
});

const senderAddress = rtpSendSocket.address();

if (typeof senderAddress === "string") {
    throw new Error("Unexpected UNIX socket");
}

   
await aiOutputTransport.connect({
    ip: "127.0.0.1",
    port: senderAddress.port
});

console.log("Output transport:", aiOutputTransport.tuple);

     const mediaBridge=new MediaBridge(resampler,opusEncoderAI,rtpSendSocket,AiInputTransport,aiOutputTransport,aiOutputProducer,aiConsumer)

    const AiInterviewer=new AIInterviewer(mediaBridge)
    const interview:Interview=new Interview(AiInterviewer)

  

    room.interview=interview

      console.log("bhwhdehdhkjehd",room.interview.AiIntevriewer.mediaBridge.outputProducer)

    await AiInterviewer.provider.connect();
    await AiInterviewer.provider.startConversation(
    
    "client has entered"
);

    const incomingAudioPipeline=new IncomingAudioPipeline(mediaBridge,AiInterviewer);

    

    const port=await incomingAudioPipeline.start();

     await AiInputTransport.connect({ ip:process.env.UDP_SERVER_IP , port });
   


}