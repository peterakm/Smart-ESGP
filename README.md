# Smart-ESGP

Smart-ESGP is a React + Express proof-of-concept for palm oil smallholder compliance workflows: a dealer/auditor dashboard, a WhatsApp-style farmer assistant, and a public certificate verification view.

## Prerequisites

- Node.js 22 or newer
- npm

## Run Locally

1. Install dependencies:

   ```bash
   npm.cmd install
   ```

2. Optional: create `.env.local` and add an Anthropic key for live Claude responses:

   ```bash
   ANTHROPIC_API_KEY=your_api_key_here
   ```

   If no key is configured, the chat endpoint runs in deterministic simulation mode.

3. Start the full-stack development server:

   ```bash
   npm.cmd run dev
   ```

4. Open `http://localhost:3000`.

## Production Check

Build and run the production bundle:

```bash
npm.cmd run build
npm.cmd start
```

The dashboard and WhatsApp chatbot can also be built as separate containers. See [docs/deployment.md](docs/deployment.md), the [WhatsApp deployment runbook](docs/whatsapp-deployment-runbook.md), and the [demo handoff checklist](docs/demo-handoff-checklist.md).

## Useful Scripts

- `npm.cmd run lint` checks TypeScript without emitting files.
- `npm.cmd run build` creates the Vite client bundle and ESM Express server bundle.
- `npm.cmd run db:migrate` applies PostgreSQL migrations using `DATABASE_URL`.
- `npm.cmd start` runs the built production server.
- `npm.cmd run start:whatsapp` runs the standalone WhatsApp chatbot service.
- `npm.cmd run smoke:deployment-config` validates the container/compose deployment files.
- `npm.cmd run clean` removes generated build output on Windows, macOS, and Linux.
