import { MutationCtx, QueryCtx } from "./_generated/server";

export async function getMessagesByAuthor(ctx: QueryCtx, author: string) {
  return await ctx.db
    .query("messages")
    .withIndex("author", (q) => q.eq("author", author))
    .collect();
}

export async function countMessages(ctx: QueryCtx) {
  const messages = await ctx.db.query("messages").collect();
  return messages.length;
}

export async function getMessageBodies(ctx: QueryCtx, author: string) {
  const messages = await getMessagesByAuthor(ctx, author);
  return messages.map((m) => m.body);
}

export async function insertMessage(
  ctx: MutationCtx,
  author: string,
  body: string,
) {
  return await ctx.db.insert("messages", { author, body });
}

export async function insertMessages(
  ctx: MutationCtx,
  messages: { author: string; body: string }[],
) {
  const ids = [];
  for (const msg of messages) {
    ids.push(await insertMessage(ctx, msg.author, msg.body));
  }
  return ids;
}
