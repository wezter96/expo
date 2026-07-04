import { contacts } from "@kinly/db";

import { publicProcedure, router } from "../index";

export const contactsRouter = router({
  /** All contacts and groups, in stored order. */
  list: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(contacts);
  }),
});
