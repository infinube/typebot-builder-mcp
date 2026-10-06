#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { TypebotApi } from './api.js';
import { SnapshotStore } from './snapshots.js';
import { BuilderService } from './service.js';
import { createMcpServer } from './tools.js';
import { createHttpApp } from './server.js';
try {
  const config = loadConfig(), service = new BuilderService(new TypebotApi(config), new SnapshotStore(config), config);
  let close;
  if (config.transport === 'stdio') {
    const server = createMcpServer(service); await server.connect(new StdioServerTransport()); close = () => server.close();
  } else {
    const server = createHttpApp(service).listen(config.port, config.host, () => console.error('Typebot Builder MCP HTTP ready'));
    server.requestTimeout = 120000; server.headersTimeout = 15000;
    server.on('error', () => { console.error('HTTP startup failed'); process.exitCode = 1; });
    close = () => new Promise(resolve => { server.close(resolve); server.closeIdleConnections(); });
  }
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, async () => {
    const deadline = setTimeout(() => process.exit(1), 15000); deadline.unref();
    await close(); clearTimeout(deadline); process.exit(0);
  });
} catch (error) { console.error(`Startup failed: ${error.message}`); process.exitCode = 1; }
