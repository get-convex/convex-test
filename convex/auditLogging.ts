import { log } from "convex/server";
import { query } from "./_generated/server";

export const loggedQuery = query({
  args: {},
  handler: async () => {
    await log.audit({
      action: "meow",
      ip: log.vars.ip,
    });
    return "ok";
  },
});
