# Smart Access Web

TanStack Start administration dashboard for Smart Access.

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


## Backend API discovery

The production API origin is supplied at build time through `VITE_API_URL`.

In the root Docker Compose deployment, Dokploy provides `API_PUBLIC_URL`, which is passed into the frontend Docker build as `VITE_API_URL`.

At runtime the dashboard uses that value as its default API URL. The Settings page can override the API URL and administrator token in browser local storage under `smart-access-admin-config`. This allows the same frontend build to be pointed at another API when needed.
