import { Server, Socket } from "socket.io";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";

dotenv.config();

type SocketMiddleware = Parameters<Server["use"]>[0];

const secret = process.env.JWT_SECRET || "";

export const SocketAuth: SocketMiddleware = async (socket, next) => {
    try {
        console.log("Headers:", socket.handshake.headers);

        const cookieHeader = socket.handshake.headers.cookie ?? "";

        console.log("Cookie Header:", cookieHeader);

        const token = cookieHeader
            .split("; ")
            .find(c => c.startsWith("token="))
            ?.split("=")[1];

        console.log("Extracted Token:", token);

        if (!token) {
            return next(new Error("Unauthorized"));
        }

        const user = jwt.verify(token, secret);

        console.log("Verified User:", user);

        socket.data.user = user;

        next();
    } catch (err) {
        console.error("Socket Authentication Error:", err);
        next(new Error("Authentication failed"));
    }
};