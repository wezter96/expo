import { serve } from "@hono/node-server";
import { trpcServer } from "@hono/trpc-server";
import { createContext } from "@kinly/api/context";
import { appRouter } from "@kinly/api/routers/index";
import { seedIfEmpty } from "@kinly/db/seed";
import { env } from "@kinly/env/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
  }),
);

app.use(
  "/trpc/*",
  trpcServer({
    router: appRouter,
    createContext: (_opts, context) => {
      return createContext({ context });
    },
  }),
);

app.get("/", (c) => {
  return c.text("OK");
});

// Populate sample family/friends data on first boot.
await seedIfEmpty();

serve(
  {
    fetch: app.fetch,
    port: 3000,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);
