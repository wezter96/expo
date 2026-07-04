import { publicProcedure, router } from "../index";
import { assistantRouter } from "./assistant";
import { contactsRouter } from "./contacts";
import { messagesRouter } from "./messages";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  contacts: contactsRouter,
  messages: messagesRouter,
  assistant: assistantRouter,
});
export type AppRouter = typeof appRouter;
