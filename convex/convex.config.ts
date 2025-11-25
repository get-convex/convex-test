import { defineApp } from "convex/server";
import counter from "./counter/component/convex.config.js";

const app = defineApp();
app.use(counter);

export default app;
