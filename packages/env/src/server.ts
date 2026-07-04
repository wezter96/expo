import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    CORS_ORIGIN: z.url(),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    /**
     * Optional Anthropic API key. When set, the assistant uses Claude to
     * understand free-form requests; otherwise it falls back to a built-in
     * rule-based parser. Keeping the key on the server means it never ships
     * to the device.
     */
    ANTHROPIC_API_KEY: z.string().optional(),
    AI_MODEL: z.string().default("claude-haiku-4-5-20251001"),
  },
  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
