import { tool, jsonSchema } from "ai";
import { type } from "arktype";

// import type { Chat } from "./agent.ts";
// import { getCurrentAgent } from "agents";
// import { unstable_scheduleSchema } from "agents/schedule";

/**
 * Export all available tools
 * These will be provided to the AI model to describe available capabilities
 */
// Omitting execute function makes this tool require human confirmation

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
  // displayHtml: async ({ html, title }: { html: string; title?: string }) => {
  //   const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  //   console.log(`Displaying HTML content in new tab${title ? ` with title: ${title}` : ''}`);
  //   // Return JSON string for the client to parse
  //   return JSON.stringify({ dataUrl, title: title || 'HTML Content' });
  // },
  // deployDocker: async ({ gitUrl, dockerfilePath }: { gitUrl: string; dockerfilePath?: string }) => {
  //   console.log(`Deploying Docker container from ${gitUrl}`);
  //   try {
  //     const dockerPath = dockerfilePath //  || 'Dockerfile';
      
  //     // Call the Docker service running on port 5196
  //     const response = await fetch('http://localhost:5196/deploy', {
  //       method: 'POST',
  //       headers: {
  //         'Content-Type': 'application/json',
  //       },
  //       body: JSON.stringify({
  //         gitUrl,
  //         dockerfilePath: dockerPath
  //       })
  //     });
      
  //     const result = await response.json();
      
  //     if (!response.ok) {
  //       return `Docker deployment failed: ${result.error || 'Unknown error'}`;
  //     }
      
  //     return `Docker deployment successful! Deployment ID: ${result.deploymentId}. Status: ${result.status}. ${result.message}`;
  //   } catch (error) {
  //     console.error('Deploy request failed:', error);
  //     return `Docker deployment failed: ${error.message}`;
  //   }
  // },
}
