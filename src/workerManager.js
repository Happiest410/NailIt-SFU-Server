import { createWorker } from "mediasoup";
import type { types } from "mediasoup";

export class WorkerManager {
    private worker?: types.Worker;

    async initialize(): Promise<void> {
        this.worker = await createWorker({
            rtcMinPort: 40000,
            rtcMaxPort: 40019,
        });

        this.worker.on("died", () => {
            console.error("Mediasoup worker died");
            process.exit(1);
        });

        console.log("Mediasoup worker initialized (ports 40000-40019)");
    }

    getWorker(): types.Worker {
        if (!this.worker) {
            throw new Error("Worker has not been initialized.");
        }

        return this.worker;
    }

    async close(): Promise<void> {
        this.worker?.close();
    }
}
