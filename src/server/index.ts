import { createApp } from "./app";
import path from "node:path";

const port = Number(process.env.PORT ?? 8787);
const dataDir = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < 20) {
  console.error(`Node ${process.versions.node} is too old. Use Node 20 or newer.`);
  process.exit(1);
}

const app = createApp(dataDir);
app.listen(port, "127.0.0.1", () => {
  console.log(`Agent Routing Lab API at http://127.0.0.1:${port}`);
});
