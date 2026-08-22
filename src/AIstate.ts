export enum AIState {
    CREATED,        // AIInterviewer object exists
    CONNECTING,     // Connecting to Gemini/OpenAI
    READY,          // Connected and waiting to start
    LISTENING,      // Listening to candidate audio
    THINKING,       // Waiting for provider to generate a response
    SPEAKING,       // Streaming AI audio to candidate
    INTERRUPTED,    // Current response cancelled
    CLOSED,         // Session closed
    ERROR           // Provider/media failure
}