import type { GenericSchema, SchemaDefinition } from "convex/server";
import type { TestConvex } from "../../index";
import schema from "./component/schema";

const modules = import.meta.glob("./component/**/*.ts");

// Match the testing entry point convention used by published components.
export function register<
  Schema extends SchemaDefinition<GenericSchema, boolean>,
>(t: TestConvex<Schema>, name = "counter") {
  t.registerComponent(name, schema, modules);
}

export default { register, schema, modules };
