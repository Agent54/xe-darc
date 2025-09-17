import { tool, jsonSchema } from "ai";
import { type } from "arktype";

const getWeatherInformation = tool({
    description: "show the weather in a given city to the user",
    inputSchema: type({ city: "string" }).toJsonSchema() as any,
    // Omitting execute function makes this tool require human confirmation
    execute: async ({ city }) => ({
        city,
        temperature: 72 + Math.floor(Math.random() * 21) - 10
    })
})

const getLocalTime = tool({
    description: "get the local time for a specified location",
    inputSchema: type({ location: "string" }).toJsonSchema() as any,
    execute: async ({ location }) => {
        console.log(`Getting local time for ${location}`);
        return "23:13";
    }
})

const scheduleTask = tool({
  description: "A tool to schedule a task to be executed at a later time",
  inputSchema: type({ when: "string", description: "string" }).toJsonSchema() as any,
//   execute: async ({ when, description }) => {
//     // we can now read the agent context from the ALS store
//     // const { agent } = getCurrentAgent<Chat>();

//     function throwError(msg: string): string {
//       throw new Error(msg);
//     }
//     if (when.type === "no-schedule") {
//       return "Not a valid schedule input";
//     }
//     const input =
//       when.type === "scheduled"
//         ? when.date // scheduled
//         : when.type === "delayed"
//           ? when.delayInSeconds // delayed
//           : when.type === "cron"
//             ? when.cron // cron
//             : throwError("not a valid schedule input");
//     try {
//       // agent!.schedule(input!, "executeTask", description);
//     } catch (error) {
//       console.error("error scheduling task", error);
//       return `Error scheduling task: ${error}`;
//     }
//     return `Task scheduled for type "${when.type}" : ${input}`;
//   }
})

/**
 * Tool to list all scheduled tasks
 * This executes automatically without requiring human confirmation
 */
const getScheduledTasks = tool({
    description: "List all tasks that have been scheduled",
    inputSchema: type({}).toJsonSchema() as any,
    // execute: async () => {
    //     // const { agent } = getCurrentAgent<Chat>();

    //     try {
    //     // const tasks = agent!.getSchedules();
    //     // if (!tasks || tasks.length === 0) {
    //     //   return "No scheduled tasks found.";
    //     // }
    //     // return tasks;
    //     } catch (error) {
    //     console.error("Error listing scheduled tasks", error);
    //     return `Error listing scheduled tasks: ${error}`;
    //     }
    // }
})

/**
 * Tool to cancel a scheduled task by its ID
 * This executes automatically without requiring human confirmation
 */
const cancelScheduledTask = tool({
    description: "Cancel a scheduled task using its ID",
    inputSchema: type({ taskId: "string" }).toJsonSchema() as any,
    // execute: async ({ taskId }) => {
    //   // const { agent } = getCurrentAgent<Chat>();
    //   try {
    //     // await agent!.cancelSchedule(taskId);
    //     return `Task ${taskId} has been successfully canceled.`;
    //   } catch (error) {
    //     console.error("Error canceling scheduled task", error);
    //     return `Error canceling task ${taskId}: ${error}`;
    //   }
    // },
})

export const toolTags = {
    browsing: ['readPageContent', 'openNewTab', 'displayHtml'],
    scheduling: ['scheduleTask', 'getScheduledTasks', 'cancelScheduledTask'],
    orga: ['getWeatherInformation', 'getLocalTime'],
    platform: ['listPlatformTools', 'executePlatformTool']
}

export const tools = {
    scheduleTask,
    getWeatherInformation,
    getLocalTime,
    getScheduledTasks,
    cancelScheduledTask,
    readPageContent: tool({
        description: "read current tab page content, optional with a xpath selector or only text access if not specific html structure requiring task is performed",
        inputSchema: type({ selector: "string?", textOnly: "boolean?" }).toJsonSchema() as any,
    }),

    openNewTab: tool({
        description: "open a new tab in the current space, optionally with a specific URL",
        inputSchema: type({  // Todo: handle description per schema field
        url: "string?", 
        title: "string?"
        }).toJsonSchema() as any
    }),

    displayHtml: tool({
        description: "display pure HTML content in a new tab using a data: URL",
        inputSchema: type({
        html: "string",
        title: "string?"
        }).toJsonSchema() as any,
    }),

    // deployDocker: tool({
    //   description: "deploy a Docker container from a git repository URL",
    //   parameters: z.object({
    //     gitUrl: z.string().describe("Git/GitHub URL to deploy from"),
    //     dockerfilePath: z.optional(z.string()).describe("Path to Dockerfile in repo (defaults to ./Dockerfile)")
    //   }),
    //   // Omitting execute function makes this tool require human confirmation
    // })
}
