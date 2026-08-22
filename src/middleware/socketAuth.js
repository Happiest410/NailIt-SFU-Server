import { Server, Socket } from "socket.io";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";

dotenv.config();

type SocketMiddleware = Parameters<Server["use"]>[0];

const secret = process.env.JWT_SECRET || "kavya";

export const SocketAuth: SocketMiddleware = async (socket, next) => {
    try {
        const cookieHeader = socket.handshake.headers.cookie ?? "";

        let token = cookieHeader
            .split("; ")
            .find(c => c.startsWith("token="))
            ?.split("=")[1];

        if (!token && socket.handshake.auth?.token) {
          token = socket.handshake.auth.token as string;
        }

        if (token) {
          try {
            const user = jwt.verify(token, secret);
            socket.data.user = user;
            return next();
          } catch (e) {}
        }

        // Allow candidate / interviewee connection if roomId is present
        const roomId = socket.handshake.query.roomId;
        if (roomId) {
          socket.data.user = { role: "Candidate", roomId };
          return next();
        }

        return next(new Error("Unauthorized"));
    } catch (err) {
        return next();
    }
};
