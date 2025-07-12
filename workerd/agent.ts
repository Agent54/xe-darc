import { routeAgentRequest, type Schedule } from "agents";

import { unstable_getSchedulePrompt } from "agents/schedule";

import { AIChatAgent as Agent  } from "agents/ai-chat-agent";
import {
  createDataStreamResponse,
  generateId,
  streamText,
  type StreamTextOnFinishCallback,
  type ToolSet,
} from "ai";
import { anthropic } from "@ai-sdk/anthropic"; // createAnthropic
// import { openai } from "@ai-sdk/openai";
import { processToolCalls } from "./utils.ts";
import { tools, executions } from "./tools.ts";
// import { env } from "cloudflare:workers";

// function addCorsHeaders(response: Response): Response {
//   const headers = new Headers(response.headers);
//   headers.set('Access-Control-Allow-Origin', '*');
//   headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
//   headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
//   return new Response(response.body, {
//     status: response.status,
//     statusText: response.statusText,
//     headers
//   });
// }

// const anthropic = createAnthropic({
//   apiKey
// });

// await generateText({
//   model: anthropic('claude-4-opus-20250514'),
//   prompt: 'How many people will live in the world in 2040?',
//   providerOptions: {
//     anthropic: {
//       thinking: { type: 'enabled', budgetTokens: 12000 },
//     } satisfies AnthropicProviderOptions,
//   },
// });

// claude-4-opus-20250514
// claude-3-5-haiku-20241022
// claude-3-7-sonnet-20250219

const model = anthropic('claude-4-sonnet-20250514')

// Cloudflare AI Gateway
// const openai = createOpenAI({
//   apiKey: env.ANTHROPIC_API_KEY,
//   baseURL: env.GATEWAY_BASE_URL,
// });

/**
 * Chat Agent implementation that handles real-time AI chat interactions
 */
export class Chat extends Agent<Env> {
  /**
   * Handles incoming chat messages and manages the response stream
   * @param onFinish - Callback function executed when streaming completes
   */

  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    _options?: { abortSignal?: AbortSignal }
  ) {
    // const mcpConnection = await this.mcp.connect(
    //   "https://path-to-mcp-server/sse"
    // );

    // Collect all tools, including MCP tools
    const allTools = {
      ...tools,
      ...this.mcp.unstable_getAITools(),
    };

    // Create a streaming response that handles both text and tool outputs
    const dataStreamResponse = createDataStreamResponse({
      execute: async (dataStream) => {
        // Process any pending tool calls from previous messages
        // This handles human-in-the-loop confirmations for tools
        // const processedMessages = await processToolCalls({
        //   messages: this.messages,
        //   dataStream,
        //   tools: allTools,
        //   executions,
        // });


        const result = streamText({
          model,
          system: `You are a helpful assistant that can do various tasks... 

${unstable_getSchedulePrompt({ date: new Date() })}

If the user asks to schedule a task, use the schedule tool to schedule the task.
`,
          messages: this.messages, //: processedMessages,
          tools: allTools,
          onFinish: async (args) => {
            onFinish(
              args as Parameters<StreamTextOnFinishCallback<ToolSet>>[0]
            );
            // await this.mcp.closeConnection(mcpConnection.id);
          },
          onError: (error) => {
            console.error("Error while streaming:", error);
          },
          maxSteps: 10,
        });

        // Merge the AI response stream with tool execution outputs
        result.mergeIntoDataStream(dataStream);
      },
    });

    return dataStreamResponse;
  }
  async executeTask(description: string, _task: Schedule<string>) {
    await this.saveMessages([
      ...this.messages,
      {
        id: generateId(),
        role: "user",
        content: `Running scheduled task: ${description}`,
        createdAt: new Date(),
      },
    ]);
  }
}

/**
 * Worker entry point that routes incoming requests to the appropriate handler
 */
export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
    const url = new URL(request.url);

    return (
      // Route the request to our agent or return 404 if not found
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
