import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction, internalQuery } from "./_generated/server";

const http = httpRouter();

http.route({
  path: "/foo",
  method: "GET",
  handler: httpAction(async (_, request) => {
    const url = new URL(request.url);
    return new Response(url.searchParams.get("arg"), { status: 200 });
  }),
});

http.route({
  path: "/buzz",
  method: "POST",
  handler: httpAction(async (_, request) => {
    const { text } = await request.json();
    return new Response(text, { status: 200 });
  }),
});

http.route({
  pathPrefix: "/bla/",
  method: "POST",
  handler: httpAction(async (_, request) => {
    const url = new URL(request.url);
    const text = url.pathname.split("/").at(-1);
    return new Response(text, { status: 200 });
  }),
});

http.route({
  path: "/readQuery",
  method: "POST",
  handler: httpAction(async (ctx) => {
    const message = await ctx.runQuery(internal.http.getFirst);
    return new Response(JSON.stringify(message), { status: 200 });
  }),
});

export const getFirst = internalQuery(async (ctx) => {
  return await ctx.db.query("messages").first();
});

http.route({
  path: "/metadata",
  method: "GET",
  handler: httpAction(async () => {
    const syscalls = (global as any).Convex;
    const metadata = JSON.parse(
      await syscalls.asyncSyscall(
        "1.0/getFunctionMetadata",
        JSON.stringify({}),
      ),
    );
    return new Response(JSON.stringify(metadata), { status: 200 });
  }),
});

export default http;
