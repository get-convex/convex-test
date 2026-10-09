import type { ComponentRegistration } from "../../index";
import type { ComponentApi } from "./component/_generated/component";
import schema from "./component/schema";

export type { ComponentApi } from "./component/_generated/component";

const modules = import.meta.glob("./component/**/*.ts");

// Match the testing entry point convention used by published components.
export const register: ComponentRegistration<ComponentApi> = (
  t,
  name = "counter",
) => {
  t.registerComponent(name, schema, modules);
};

export default { register, schema, modules };
