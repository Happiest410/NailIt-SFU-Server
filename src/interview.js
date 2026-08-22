import { AIInterviewer } from "./AiInterviewer.ts";
import { Activity } from "./Activity.ts";
import { GeminiProvider } from "./geminiProvider.ts";
import type { AIProvider } from "./AIProvider.ts";
export class Interview extends Activity {
    public AiIntevriewer:AIInterviewer

    constructor(AiInterviewer:AIInterviewer){
        super()
      this.AiIntevriewer=AiInterviewer
    }

}