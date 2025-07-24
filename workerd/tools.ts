/**
 * Tool definitions for the AI chat agent
 * Tools can either require human confirmation or execute automatically
 */
import { tool } from "ai";
import { z } from "zod";

import type { Chat } from "./agent.ts";
import { getCurrentAgent } from "agents";
import { unstable_scheduleSchema } from "agents/schedule";

/**
 * Weather information tool that requires human confirmation
 * When invoked, this will present a confirmation dialog to the user
 * The actual implementation is in the executions object below
 */
const getWeatherInformation = tool({
  description: "show the weather in a given city to the user",
  parameters: z.object({ city: z.string() }),
  // Omitting execute function makes this tool require human confirmation
});

/**
 * Local time tool that executes automatically
 * Since it includes an execute function, it will run without user confirmation
 * This is suitable for low-risk operations that don't need oversight
 */
const getLocalTime = tool({
  description: "get the local time for a specified location",
  parameters: z.object({ location: z.string() }),
  execute: async ({ location }) => {
    console.log(`Getting local time for ${location}`);
    return "10am";
  },
});

const scheduleTask = tool({
  description: "A tool to schedule a task to be executed at a later time",
  parameters: unstable_scheduleSchema,
  execute: async ({ when, description }) => {
    // we can now read the agent context from the ALS store
    const { agent } = getCurrentAgent<Chat>();

    function throwError(msg: string): string {
      throw new Error(msg);
    }
    if (when.type === "no-schedule") {
      return "Not a valid schedule input";
    }
    const input =
      when.type === "scheduled"
        ? when.date // scheduled
        : when.type === "delayed"
          ? when.delayInSeconds // delayed
          : when.type === "cron"
            ? when.cron // cron
            : throwError("not a valid schedule input");
    try {
      agent!.schedule(input!, "executeTask", description);
    } catch (error) {
      console.error("error scheduling task", error);
      return `Error scheduling task: ${error}`;
    }
    return `Task scheduled for type "${when.type}" : ${input}`;
  },
});

/**
 * Tool to list all scheduled tasks
 * This executes automatically without requiring human confirmation
 */
const getScheduledTasks = tool({
  description: "List all tasks that have been scheduled",
  parameters: z.object({}),
  execute: async () => {
    const { agent } = getCurrentAgent<Chat>();

    try {
      const tasks = agent!.getSchedules();
      if (!tasks || tasks.length === 0) {
        return "No scheduled tasks found.";
      }
      return tasks;
    } catch (error) {
      console.error("Error listing scheduled tasks", error);
      return `Error listing scheduled tasks: ${error}`;
    }
  },
});

/**
 * Tool to cancel a scheduled task by its ID
 * This executes automatically without requiring human confirmation
 */
const cancelScheduledTask = tool({
  description: "Cancel a scheduled task using its ID",
  parameters: z.object({
    taskId: z.string().describe("The ID of the task to cancel"),
  }),
  execute: async ({ taskId }) => {
    const { agent } = getCurrentAgent<Chat>();
    try {
      await agent!.cancelSchedule(taskId);
      return `Task ${taskId} has been successfully canceled.`;
    } catch (error) {
      console.error("Error canceling scheduled task", error);
      return `Error canceling task ${taskId}: ${error}`;
    }
  },
});

/**
 * Export all available tools
 * These will be provided to the AI model to describe available capabilities
 */
export const tools = {
  getWeatherInformation,
  getLocalTime,
  scheduleTask,
  getScheduledTasks,
  cancelScheduledTask,
  readPageContent: tool({
    description: "read current tab page content, optional with a xpath selector or only text access if not specific html structure requiring task is performed",
    parameters: z.object({ selector: z.optional(z.string()), textOnly: z.optional(z.boolean()) }),
    // Omitting execute function makes this tool require human confirmation
  }),
  openNewTab: tool({
    description: "open a new tab in the current space, optionally with a specific URL",
    parameters: z.object({ 
      url: z.optional(z.string()).describe("URL to open in the new tab - if not provided, opens a new tab page"),
      title: z.optional(z.string()).describe("Title for the new tab - if not provided, will be determined from the URL")
    }),
    // Omitting execute function makes this tool require human confirmation
  }),
  displayHtml: tool({
    description: "display pure HTML content in a new tab using a data: URL",
    parameters: z.object({
      html: z.string().describe("The HTML content to display"),
      title: z.optional(z.string()).describe("Title for the new tab")
    }),
    // Omitting execute function makes this tool require human confirmation
  }),
  deployDocker: tool({
    description: "deploy a Docker container from a git repository URL",
    parameters: z.object({
      gitUrl: z.string().describe("Git/GitHub URL to deploy from"),
      dockerfilePath: z.optional(z.string()).describe("Path to Dockerfile in repo (defaults to ./Dockerfile)")
    }),
    // Omitting execute function makes this tool require human confirmation
  }),
};

/**
 * Implementation of confirmation-required tools
 * This object contains the actual logic for tools that need human approval
 * Each function here corresponds to a tool above that doesn't have an execute function
 * NOTE: keys below should match toolsRequiringConfirmation in app.tsx
 */
export const executions = {
  getWeatherInformation: async ({ city }: { city: string }) => {
    console.log(`Getting weather information for ${city}`);
    return `The weather in ${city} is sunny`;
  },
  openNewTab: async ({ url, title }: { url?: string; title?: string }) => {
    console.log(`Opening new tab with URL: ${url || 'about:newtab'}`);
    // This will be handled by the client-side code when the tool is approved
    return `New tab opened${url ? ` with URL: ${url}` : ''}${title ? ` (${title})` : ''}`;
  },
  displayHtml: async ({ html, title }: { html: string; title?: string }) => {
    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
    console.log(`Displaying HTML content in new tab${title ? ` with title: ${title}` : ''}`);
    // Return JSON string for the client to parse
    return JSON.stringify({ dataUrl, title: title || 'HTML Content' });
  },
  deployDocker: async ({ gitUrl, dockerfilePath }: { gitUrl: string; dockerfilePath?: string }) => {
    console.log(`Deploying Docker container from ${gitUrl}`);
    try {
      const dockerPath = dockerfilePath || './Dockerfile';
      
      // Basic validation of git URL
      if (!gitUrl.match(/^https?:\/\/(github\.com|gitlab\.com|bitbucket\.org)/)) {
        return 'Error: Only GitHub, GitLab, and Bitbucket URLs are supported';
      }
      
      // Generate deployment ID
      const deploymentId = `deploy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      console.log(`Docker deployment initiated for ${gitUrl} using ${dockerPath}`);
      
      return `Docker deployment initiated for ${gitUrl} using ${dockerPath} (ID: ${deploymentId})`;
    } catch (error) {
      console.error('Deploy request failed:', error);
      return `Docker deployment failed: ${error.message}`;
    }
  },
};
