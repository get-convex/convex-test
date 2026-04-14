/// <reference types="vite/client" />

import { expect, test } from "vitest";
import { convexTest } from "../index";
import schema from "./schema";
import { api, components } from "./_generated/api";
import counterSchema from "./counter/component/schema";

const counterModules = import.meta.glob("./counter/component/**/*.ts");

async function getFunctionMetadata() {
  const syscalls = (global as any).Convex;
  return JSON.parse(
    await syscalls.asyncSyscall("1.0/getFunctionMetadata", JSON.stringify({})),
  );
}

test("inline query", async () => {
  const t = convexTest({ schema });
  const metadata = await t.query(async () => {
    return await getFunctionMetadata();
  });
  expect(metadata).toEqual({ name: "inline", componentPath: "" });
});

test("inline mutation", async () => {
  const t = convexTest({ schema });
  const metadata = await t.mutation(async () => {
    return await getFunctionMetadata();
  });
  expect(metadata).toEqual({ name: "inline", componentPath: "" });
});

test("inline action", async () => {
  const t = convexTest({ schema });
  const metadata = await t.action(async () => {
    return await getFunctionMetadata();
  });
  expect(metadata).toEqual({ name: "inline", componentPath: "" });
});

test("named query", async () => {
  const t = convexTest({ schema });
  const metadata = await t.query(api.getFunctionMetadata.metadataQuery);
  expect(metadata).toEqual({
    name: "getFunctionMetadata:metadataQuery",
    componentPath: "",
  });
});

test("named mutation", async () => {
  const t = convexTest({ schema });
  const metadata = await t.mutation(api.getFunctionMetadata.metadataMutation);
  expect(metadata).toEqual({
    name: "getFunctionMetadata:metadataMutation",
    componentPath: "",
  });
});

test("named action", async () => {
  const t = convexTest({ schema });
  const metadata = await t.action(api.getFunctionMetadata.metadataAction);
  expect(metadata).toEqual({
    name: "getFunctionMetadata:metadataAction",
    componentPath: "",
  });
});

test("default export", async () => {
  const t = convexTest({ schema });
  const metadata = await t.query(api.getFunctionMetadata.default);
  expect(metadata).toEqual({
    name: "getFunctionMetadata",
    componentPath: "",
  });
});

test("http action", async () => {
  const t = convexTest(schema);
  const response = await t.fetch("/metadata", { method: "GET" });
  const metadata = await response.json();
  expect(metadata).toEqual({ name: "http", componentPath: "" });
});

test("component function has component path", async () => {
  const t = convexTest(schema);
  t.registerComponent("counter", counterSchema, counterModules);
  const metadata = await t.query(components.counter.public.metadata);
  expect(metadata).toEqual({
    name: "public:metadata",
    componentPath: "counter",
  });
});
