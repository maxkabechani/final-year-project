# CL3 Access Web

TanStack Start administration dashboard for the CL3 smart access project.

## Stack

- TanStack Start / Router
- TanStack Query
- TanStack Table
- React 19
- Bun
- TypeScript

## Development

```bash
bun install
cp .env.example .env
bun run dev
```

Set `VITE_API_URL` to the public Fastify API origin. You can also change the API URL and administrator token from the dashboard Settings screen.

## Production

```bash
bun run build
bun run start
```

The Docker image builds the Start application with the configured `VITE_API_URL` and serves it on port 3000.
