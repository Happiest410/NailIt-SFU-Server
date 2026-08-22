import { Interviewer } from "./Interviewer.ts";
import { Candidate } from "./candidate.ts";
export const ParticipantRegistry = {
    Candidate: Candidate,
    Interviewer: Interviewer
} as const;