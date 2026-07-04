import { messages } from "@kinly/db";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { publicProcedure, router } from "../index";

export const messagesRouter = router({
  /** All messages for one conversation, oldest first. */
  list: publicProcedure.input(z.object({ contactId: z.string() })).query(async ({ ctx, input }) => {
    return ctx.db.select().from(messages).where(eq(messages.contactId, input.contactId)).orderBy(asc(messages.at));
  }),

  /** Send a message from the user to a contact. */
  send: publicProcedure
    .input(z.object({ contactId: z.string(), text: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const msg = {
        id: `m_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`,
        contactId: input.contactId,
        text: input.text.trim(),
        mine: true,
        at: Date.now(),
      };
      await ctx.db.insert(messages).values(msg);
      return msg;
    }),
});
