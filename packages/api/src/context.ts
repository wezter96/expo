import { db } from "@kinly/db";
import type { Context as HonoContext } from "hono";

export type CreateContextOptions = {
  context: HonoContext;
};

export async function createContext(_options: CreateContextOptions) {
  return {
    db,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
