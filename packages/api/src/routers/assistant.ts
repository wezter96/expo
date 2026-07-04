import { contacts } from "@kinly/db";
import { env } from "@kinly/env/server";
import { z } from "zod";

import { publicProcedure, router } from "../index";
import { runAgent } from "../lib/agent";

export const assistantRouter = router({
  /**
   * Interpret a plain-language request and return what the app should do
   * (call / send a message / open a chat / read messages), plus a warm reply.
   */
  run: publicProcedure.input(z.object({ text: z.string() })).mutation(async ({ ctx, input }) => {
    const all = await ctx.db.select().from(contacts);
    return runAgent(input.text, all, {
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.AI_MODEL,
    });
  }),
});
