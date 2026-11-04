/**
 * MCP's messages, free of any transport: one parsed JSON-RPC 2.0 message in, the response out (MCP
 * 2025-06-18, and the earlier versions a client asks for). A client that renders MCP Apps also gets
 * views (mcpViews.js). No node: imports: stdio (mcp.js) and a host's HTTP endpoint both call this.
 */
import PACKAGE from '../package.json' with { type: 'json' };
import { checkSchema } from './validate.js';
import { VIEWS, VIEW_EXTENSION, VIEW_MIME, viewHtml } from './mcpViews.js';
import { trace } from './mcpTools.js';

// Newest first; a client asking for another version gets the newest, and decides whether to go on.
export const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
export const MAX_ARGUMENTS = 1024 * 1024;
export const SERVER_INFO = { name: 'viable-harness', version: PACKAGE.version };

// The legacy flat key too, as the extension's own SDK writes it, for hosts that read only that one.
const viewMeta = (view) => ({ ui: { resourceUri: view.uri }, 'ui/resourceUri': view.uri });
const VIEW_RESOURCE_META = { ui: { prefersBorder: true } };

const response = (id, result) => ({ jsonrpc: '2.0', id, result });
export const failure = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
const toolError = (message) => ({ content: [{ type: 'text', text: message }], isError: true });

async function callTool(tool, args, services, structured) {
  const size = new TextEncoder().encode(JSON.stringify(args)).length;
  if (size > MAX_ARGUMENTS) return toolError(`The arguments are ${(size / 1048576).toFixed(1)} MB as JSON; ${tool.name} takes at most 1 MB per call. Send a smaller document, or fewer cases or events.`);
  const errors = checkSchema(tool.inputSchema, args);
  if (errors.length) return toolError(`The arguments don't fit ${tool.name}'s input schema:\n${errors.map((error) => `- ${error.replace(/^\$/, 'arguments')}`).join('\n')}`);
  try {
    const { summary, data } = await tool.run(args, services);
    // The JSON goes in the text too, for clients that pass only content to the model.
    return { content: [{ type: 'text', text: `${summary}\n\n${JSON.stringify(data, null, 2)}` }], ...(structured ? { structuredContent: data } : {}) };
  } catch (error) {
    const steps = error?.agentSteps?.length ? `\n\nSteps:\n${trace(error.agentSteps).map((step) => `${step.step}. ${step.id} (${step.type}) ${step.status}${step.error ? `: ${step.error}` : ''}`).join('\n')}` : '';
    return toolError(`${tool.name} failed: ${[error?.message || String(error), ...(error?.details || [])].join(' ')}${steps}`);
  }
}

/**
 * The response to one message, or null for a notification. tools: what mcpTools gives, as this
 * connection may use them. resources: the views on offer; only those of a tool in tools are served.
 * services: passed to each tool's run. session: what the client negotiated, { version, views },
 * updated by initialize. A transport with a connection keeps it between messages; one without builds
 * it for each request.
 */
export async function handleMcpMessage(message, { tools, resources = VIEWS, services = {}, serverInfo = SERVER_INFO, instructions, session = { version: PROTOCOL_VERSIONS[0], views: false } }) {
  if (Array.isArray(message)) return failure(null, -32600, 'Batches aren\'t supported: send one JSON-RPC message at a time.');
  if (!message || typeof message !== 'object' || message.jsonrpc !== '2.0') return failure(null, -32600, 'Expected a JSON-RPC 2.0 message.');
  const { id, method, params } = message;
  if (typeof method !== 'string') return 'result' in message || 'error' in message ? null : failure(id ?? null, -32600, 'A request needs a method.');
  if (id === undefined) return null; // notifications/initialized, notifications/cancelled: nothing to answer
  if (typeof id !== 'string' && typeof id !== 'number') return failure(null, -32600, 'A request\'s id is a string or a number.');
  if (params !== undefined && (!params || typeof params !== 'object' || Array.isArray(params))) return failure(id, -32602, 'params must be an object.');
  try {
    if (method === 'initialize') {
      if (typeof params?.protocolVersion !== 'string') return failure(id, -32602, 'initialize needs params.protocolVersion.');
      session.version = PROTOCOL_VERSIONS.includes(params.protocolVersion) ? params.protocolVersion : PROTOCOL_VERSIONS[0];
      // Views only for a client that says it renders them; every other client sees the server as before.
      const apps = params.capabilities?.extensions?.[VIEW_EXTENSION];
      session.views = Array.isArray(apps?.mimeTypes) && apps.mimeTypes.includes(VIEW_MIME);
    }
    const views = session.views ? resources.filter((view) => tools.some((tool) => tool.name === view.tool)) : [];
    if (method === 'initialize') {
      const capabilities = { tools: { listChanged: false }, ...(views.length ? { resources: { listChanged: false }, extensions: { [VIEW_EXTENSION]: {} } } : {}) };
      return response(id, { protocolVersion: session.version, capabilities, serverInfo, ...(instructions ? { instructions } : {}) });
    }
    if (method === 'ping') return response(id, {});
    if (method === 'tools/list') {
      return response(id, { tools: tools.map(({ name, description, inputSchema }) => {
        const view = views.find((item) => item.tool === name);
        return { name, description, inputSchema, ...(view ? { _meta: viewMeta(view) } : {}) };
      }) });
    }
    if (views.length && method === 'resources/list') return response(id, { resources: views.map(({ uri, name, title, description }) => ({ uri, name, title, description, mimeType: VIEW_MIME, _meta: VIEW_RESOURCE_META })) });
    if (views.length && method === 'resources/templates/list') return response(id, { resourceTemplates: [] });
    if (views.length && method === 'resources/read') {
      if (typeof params?.uri !== 'string') return failure(id, -32602, 'resources/read needs params.uri.');
      const view = views.find((item) => item.uri === params.uri);
      if (!view) return failure(id, -32002, `Resource not found: ${params.uri}. The resources are ${views.map((item) => item.uri).join(', ')}.`);
      return response(id, { contents: [{ uri: view.uri, mimeType: VIEW_MIME, text: viewHtml(view, { name: serverInfo.name, version: serverInfo.version }), _meta: VIEW_RESOURCE_META }] });
    }
    if (method === 'tools/call') {
      const tool = tools.find((item) => item.name === params?.name);
      if (!tool) return failure(id, -32602, `Unknown tool ${JSON.stringify(params?.name ?? null)}; the tools are ${tools.map((item) => item.name).join(', ')}.`);
      const args = params.arguments ?? {};
      if (!args || typeof args !== 'object' || Array.isArray(args)) return failure(id, -32602, 'params.arguments must be an object.');
      // structuredContent came with 2025-06-18; earlier clients get the same JSON as text.
      return response(id, await callTool(tool, args, services, session.version >= '2025-06-18'));
    }
    return failure(id, -32601, `Method not found: ${method}. This server has initialize, ping, tools/list${views.length ? ', tools/call, resources/list, resources/templates/list and resources/read' : ' and tools/call'}.`);
  } catch (error) {
    return failure(id, -32603, `Internal error: ${error?.message || error}`);
  }
}
