import dgram from "dgram";

const server =
dgram.createSocket("udp4");

server.on("message",
(buffer,rinfo)=>{

    console.log(
        "Received RTP",
        buffer.length
    );
    console.log(
        buffer[0],
         buffer[1],
          buffer[2],
           buffer[3],
       
    );

});

server.bind(5004);