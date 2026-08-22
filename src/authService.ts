import Express from "express";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import type { AuthRequest } from "./interfaces/AuthRequest.ts";
import types from "express";
import bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import cookieParser from "cookie-parser";
import { AuthMiddleware } from "./middleware/auth.ts";
import prisma from "./prisma.ts";
import { validateRecruitmentInput, validateApplicationInput, validateScheduleInput } from "./utils/validation.ts";
import { sendCandidateCredentialsEmail } from "./services/emailService.ts";

dotenv.config();

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3001";

const app = Express();

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl) or matching dev/prod origins
      if (!origin || origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1") || origin === FRONTEND_URL) {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
    credentials: true,
  })
);

app.use(Express.json());
app.use(cookieParser());

const VALID_ROLES = ["Candidate", "Interviewer"] as const;

app.get("/me", AuthMiddleware, (req: AuthRequest, res: types.Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthenticated" });
  }
  return res.status(200).json(req.user);
});
app.post("/login",async(req:types.Request,res:types.Response)=>{
   const data=req.body
   const username=data.username
   const password=data.password
   const role=data.role
   let secret=process.env.JWT_SECRET || ""

   if(!role || !VALID_ROLES.includes(role)){
     return res.status(400).send("Invalid role. Must be 'Candidate' or 'Interviewer'");
   }

   let user;
   if(role === "Candidate"){
     user = await prisma.candidate.findUnique({where:{username:username}})
   } else {
     user = await prisma.interviewer.findUnique({where:{username:username}})
   }
  
    if(!user){
      return res.status(404).send("User not found");
    }
    
     const isMatch = await bcrypt.compare(password, user.passwordHash);
       if (!isMatch) return res.status(401).send("Invalid credentials");

        const d={
       id: user.id,
      username:username,
      role: role
   }

      const token=jwt.sign(d,secret)
      res.cookie("token", token, {
  httpOnly: true,
  secure: false,      // true in production with HTTPS
  sameSite: "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
});
res.status(200).json({
  message: "Login successful",
});


})

// --- RECRUITMENT ROUTES ---

// Create a new recruitment and generate application form link
app.post("/recruitments", AuthMiddleware, async (req: AuthRequest, res: types.Response) => {
  try {
    if (req.user?.role !== "Interviewer") {
      return res.status(403).json({ error: "Only Interviewers can create recruitments" });
    }

    const validation = validateRecruitmentInput(req.body);
    if (!validation.isValid || !validation.data) {
      return res.status(400).json({ error: "Validation failed", details: validation.errors });
    }

    const { name, domain } = validation.data;
    const interviewerId = req.user.id;

    // 1. Initial DB record creation
    const recruitment = await prisma.recruitment.create({
      data: {
        name,
        domain,
        formLink: "",
        interviewerId,
      },
    });

    // 2. Generate application form link
    const formLink = `${FRONTEND_URL}/apply/${recruitment.id}`;

    // 3. Update recruitment record
    const updatedRecruitment = await prisma.recruitment.update({
      where: { id: recruitment.id },
      data: { formLink },
    });

    return res.status(201).json({
      message: "Recruitment created successfully",
      recruitment: updatedRecruitment,
    });
  } catch (err) {
    console.error("Error creating recruitment:", err);
    return res.status(500).json({ error: "Failed to create recruitment" });
  }
});

// Fetch all recruitments for the logged-in interviewer
app.get("/recruitments", AuthMiddleware, async (req: AuthRequest, res: types.Response) => {
  try {
    if (req.user?.role !== "Interviewer") {
      return res.status(403).json({ error: "Only Interviewers can access recruitments" });
    }

    const recruitments = await prisma.recruitment.findMany({
      where: { interviewerId: req.user.id },
      include: {
        _count: {
          select: { applications: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json(recruitments);
  } catch (err) {
    console.error("Error fetching recruitments:", err);
    return res.status(500).json({ error: "Failed to fetch recruitments" });
  }
});

// Fetch a single recruitment with all form entries / candidate applications
app.get("/recruitments/:id", AuthMiddleware, async (req: AuthRequest, res: types.Response) => {
  try {
    const recruitmentId = parseInt(req.params.id || "0", 10);
    if (!recruitmentId || isNaN(recruitmentId)) {
      return res.status(400).json({ error: "Invalid recruitment ID" });
    }

    const recruitment = await prisma.recruitment.findUnique({
      where: { id: recruitmentId },
      include: {
        applications: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!recruitment) {
      return res.status(404).json({ error: "Recruitment not found" });
    }

    if (req.user?.role === "Interviewer" && recruitment.interviewerId !== req.user.id) {
      return res.status(403).json({ error: "Access denied" });
    }

    return res.status(200).json(recruitment);
  } catch (err) {
    console.error("Error fetching recruitment details:", err);
    return res.status(500).json({ error: "Failed to fetch recruitment details" });
  }
});

// Delete a recruitment
app.delete("/recruitments/:id", AuthMiddleware, async (req: AuthRequest, res: types.Response) => {
  try {
    if (req.user?.role !== "Interviewer") {
      return res.status(403).json({ error: "Only Interviewers can delete recruitments" });
    }

    const recruitmentId = parseInt(req.params.id || "0", 10);
    if (!recruitmentId || isNaN(recruitmentId)) {
      return res.status(400).json({ error: "Invalid recruitment ID" });
    }

    const recruitment = await prisma.recruitment.findUnique({
      where: { id: recruitmentId },
    });

    if (!recruitment || recruitment.interviewerId !== req.user.id) {
      return res.status(404).json({ error: "Recruitment not found or access denied" });
    }

    await prisma.recruitment.delete({ where: { id: recruitmentId } });

    return res.status(200).json({ message: "Recruitment deleted successfully" });
  } catch (err) {
    console.error("Error deleting recruitment:", err);
    return res.status(500).json({ error: "Failed to delete recruitment" });
  }
});

// Submit a candidate application / form entry for a recruitment
app.post("/recruitments/:id/applications", async (req: types.Request, res: types.Response) => {
  try {
    const recruitmentId = parseInt(req.params.id || "0", 10);
    if (!recruitmentId || isNaN(recruitmentId)) {
      return res.status(400).json({ error: "Invalid recruitment ID" });
    }

    const recruitment = await prisma.recruitment.findUnique({
      where: { id: recruitmentId },
    });

    if (!recruitment) {
      return res.status(404).json({ error: "Recruitment not found" });
    }

    // Strict payload type-checking & validation
    const validation = validateApplicationInput(req.body);
    if (!validation.isValid || !validation.data) {
      return res.status(400).json({ error: "Validation failed", details: validation.errors });
    }

    const { firstName, lastName, email, linkedin, github, resumeUrl } = validation.data;

    const application = await prisma.application.create({
      data: {
        recruitmentId,
        firstName,
        lastName,
        email,
        linkedin,
        github,
        resumeUrl,
      },
    });

    return res.status(201).json({
      message: "Application submitted successfully",
      application,
    });
  } catch (err) {
    console.error("Error submitting application:", err);
    return res.status(500).json({ error: "Failed to submit application" });
  }
});

// --- SCHEDULE & CANDIDATE CREDENTIAL ROUTES ---

function generateMeetingCode(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  const getChunk = (len: number) => {
    let chunk = "";
    for (let i = 0; i < len; i++) {
      chunk += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return chunk;
  };
  return `apl-${getChunk(4)}-${getChunk(4)}`;
}

function generateCandidateUsername(name: string): string {
  const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, "_");
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `${cleanName}_${randomNum}`;
}

function generateTempPassword(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let pass = "";
  for (let i = 0; i < 8; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass;
}

function generateCandidateUserId(): string {
  return `cand_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 6)}`;
}

// 1. Create a Schedule & Generate Candidate Credentials + Dispatch Emails
app.post("/schedules", AuthMiddleware, async (req: AuthRequest, res: types.Response) => {
  try {
    if (req.user?.role !== "Interviewer") {
      return res.status(403).json({ error: "Only Interviewers can schedule interviews" });
    }

    const validation = validateScheduleInput(req.body);
    if (!validation.isValid || !validation.data) {
      return res.status(400).json({ error: "Validation failed", details: validation.errors });
    }

    const { recruitmentId, startTime, endTime } = validation.data;
    const interviewerId = req.user.id;

    // Verify recruitment ownership
    const recruitment = await prisma.recruitment.findUnique({
      where: { id: recruitmentId },
      include: { applications: true },
    });

    if (!recruitment || recruitment.interviewerId !== interviewerId) {
      return res.status(404).json({ error: "Recruitment not found or access denied" });
    }

    const meetRoom = generateMeetingCode();

    // Create Schedule
    const schedule = await prisma.schedule.create({
      data: {
        interviewerId,
        recruitmentId,
        meetRoom,
        startTime,
        endTime,
        status: "SCHEDULED",
      },
    });

    // Generate Candidate Credentials for all applicants in this recruitment
    const createdCredentials = [];

    for (const appRecord of recruitment.applications) {
      // Check if credential already generated for this application and this schedule
      const existing = await prisma.candidateCredential.findFirst({
        where: {
          applicationId: appRecord.id,
          scheduleId: schedule.id,
        },
      });

      if (existing) {
        createdCredentials.push(existing);
        continue;
      }

      // Generate a fresh, unique random username for this credential
      let username = generateCandidateUsername(appRecord.firstName);
      let attempts = 0;
      while (attempts < 20) {
        const checkCred = await prisma.candidateCredential.findFirst({ where: { username } });
        const checkCand = await prisma.candidate.findUnique({ where: { username } });
        if (!checkCred && !checkCand) break;
        username = generateCandidateUsername(appRecord.firstName);
        attempts++;
      }

      const tempPassword = generateTempPassword();
      const passwordHash = await bcrypt.hash(tempPassword, 10);
      const candidateUserId = generateCandidateUserId();

      // Create candidate user account
      await prisma.candidate.create({
        data: { username, passwordHash },
      });

      // Save credential for this schedule
      const cred = await prisma.candidateCredential.create({
        data: {
          applicationId: appRecord.id,
          scheduleId: schedule.id,
          username,
          passwordHash,
          tempPassword,
          candidateUserId,
          emailSent: true,
        },
      });

      // Dispatch invitation email with direct room link ${FRONTEND_URL}/interview/:room_id/:client_id
      const meetLink = `${FRONTEND_URL}/interview/${schedule.meetRoom}/${candidateUserId}`;
      await sendCandidateCredentialsEmail({
        candidateEmail: appRecord.email,
        candidateName: `${appRecord.firstName} ${appRecord.lastName}`,
        recruitmentName: recruitment.name,
        domain: recruitment.domain,
        startTime,
        endTime,
        username,
        tempPassword,
        candidateUserId,
        meetLink,
      });

      createdCredentials.push(cred);
    }

    const fullSchedule = await prisma.schedule.findUnique({
      where: { id: schedule.id },
      include: {
        recruitment: true,
        candidateCredentials: {
          include: { application: true },
        },
      },
    });

    return res.status(201).json({
      message: "Schedule created and candidate credentials dispatched!",
      schedule: fullSchedule,
    });
  } catch (err) {
    console.error("Error creating schedule:", err);
    return res.status(500).json({ error: "Failed to create schedule" });
  }
});

// 2. Fetch all schedules for interviewer
app.get("/schedules", AuthMiddleware, async (req: AuthRequest, res: types.Response) => {
  try {
    if (req.user?.role !== "Interviewer") {
      return res.status(403).json({ error: "Only Interviewers can access schedules" });
    }

    const schedules = await prisma.schedule.findMany({
      where: { interviewerId: req.user.id },
      include: {
        recruitment: true,
        candidateCredentials: {
          include: { application: true },
        },
      },
      orderBy: { startTime: "asc" },
    });

    return res.status(200).json(schedules);
  } catch (err) {
    console.error("Error fetching schedules:", err);
    return res.status(500).json({ error: "Failed to fetch schedules" });
  }
});

// 3. Fetch single schedule details
app.get("/schedules/:id", AuthMiddleware, async (req: AuthRequest, res: types.Response) => {
  try {
    const scheduleId = parseInt(req.params.id || "0", 10);
    if (!scheduleId || isNaN(scheduleId)) {
      return res.status(400).json({ error: "Invalid Schedule ID" });
    }

    const schedule = await prisma.schedule.findUnique({
      where: { id: scheduleId },
      include: {
        recruitment: true,
        candidateCredentials: {
          include: { application: true },
        },
      },
    });

    if (!schedule) {
      return res.status(404).json({ error: "Schedule not found" });
    }

    if (req.user?.role === "Interviewer" && schedule.interviewerId !== req.user.id) {
      return res.status(403).json({ error: "Access denied" });
    }

    return res.status(200).json(schedule);
  } catch (err) {
    console.error("Error fetching schedule:", err);
    return res.status(500).json({ error: "Failed to fetch schedule" });
  }
});

// 4. Verify Meeting Access for /interview/:room_id/:client_id
app.get(["/interview/verify-access/:room_id/:client_id", "/interview/verify-access/:room_id"], async (req: types.Request, res: types.Response) => {
  try {
    const { room_id, client_id } = req.params;
    const identifier = room_id || req.params.identifier;
    const now = new Date();

    // Check user authentication from cookie if available
    let loggedUser: any = null;
    const cookieHeader = req.cookies?.token;
    if (cookieHeader) {
      try {
        const secret = process.env.JWT_SECRET || "";
        loggedUser = jwt.verify(cookieHeader, secret);
      } catch (e) {}
    }

    // Find schedule by meetRoom OR candidateUserId
    let schedule = await prisma.schedule.findFirst({
      where: {
        OR: [
          { meetRoom: identifier },
          { candidateCredentials: { some: { candidateUserId: client_id || identifier } } },
        ],
      },
      include: {
        recruitment: true,
        candidateCredentials: {
          include: { application: true },
        },
      },
    });

    if (!schedule) {
      return res.status(200).json({
        allowed: true,
        meetRoom: identifier,
        role: loggedUser?.role || "Candidate",
      });
    }

    // Interviewer Access Verification
    if (loggedUser && loggedUser.role === "Interviewer") {
      if (schedule.interviewerId !== loggedUser.id) {
        return res.status(403).json({
          allowed: false,
          reason: "You are not authorized to host this scheduled interview session.",
        });
      }

      return res.status(200).json({
        allowed: true,
        meetRoom: schedule.meetRoom,
        role: "Interviewer",
        recruitmentName: schedule.recruitment.name,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
      });
    }

    // Candidate Access Verification (Time Window Check)
    if (now < schedule.startTime) {
      return res.status(403).json({
        allowed: false,
        reason: `Interview has not started yet. Scheduled start time is ${schedule.startTime.toLocaleString()} to ${schedule.endTime.toLocaleString()}.`,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        recruitmentName: schedule.recruitment.name,
      });
    }

    if (now > schedule.endTime) {
      return res.status(403).json({
        allowed: false,
        reason: `Interview session ended at ${schedule.endTime.toLocaleString()}. Access is closed.`,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        recruitmentName: schedule.recruitment.name,
      });
    }

    let matchedCand = null;
    if (client_id) {
      matchedCand = schedule.candidateCredentials.find(
        (c) => c.candidateUserId === client_id
      );
    }
    if (!matchedCand && loggedUser?.username) {
      matchedCand = schedule.candidateCredentials.find(
        (c) => c.username === loggedUser.username
      );
    }

    // Mark meeting as started by interviewee (candidate)
    await prisma.schedule.update({
      where: { id: schedule.id },
      data: { isStarted: true, status: "STARTED" },
    });

    return res.status(200).json({
      allowed: true,
      meetRoom: schedule.meetRoom,
      role: "Candidate",
      candidateName: matchedCand ? `${matchedCand.application.firstName} ${matchedCand.application.lastName}` : "Candidate",
      recruitmentName: schedule.recruitment.name,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
    });
  } catch (err) {
    console.error("Error verifying interview access:", err);
    return res.status(500).json({ error: "Failed to verify access" });
  }
});

// Explicitly mark meeting as started when candidate enters room
app.post("/interview/mark-started", async (req: types.Request, res: types.Response) => {
  try {
    const { meetRoom } = req.body;
    if (!meetRoom) {
      return res.status(400).json({ error: "Missing meetRoom" });
    }

    const updated = await prisma.schedule.update({
      where: { meetRoom },
      data: { isStarted: true, status: "STARTED" },
    });

    return res.status(200).json({ message: "Meeting marked as started", schedule: updated });
  } catch (err) {
    console.error("Error marking meeting as started:", err);
    return res.status(500).json({ error: "Failed to mark meeting as started" });
  }
});

const PORT = Number(process.env.auth_port) || 3002;

const server = app.listen(PORT, () => {
  console.log(`Server is running and listening on port ${PORT}`);
});

server.on("error", (err: any) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use by another running process!`);
  } else {
    console.error("Server startup error:", err);
  }
});