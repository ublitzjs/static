import uWS from "uWebSockets.js";
import { analyzeFolder, staticServe } from "@ublitzjs/static";
import { HeadersMap } from "@ublitzjs/core";
const server = uWS.App();
const serving = await staticServe({
  dirPath: "examples",
  fullRoute: "",
  logs: true,
  paths: await analyzeFolder("examples", true),
});
server.get("/*", serving.get).head("/*", serving.head).any("/*", serving.any);
server.listen(9001, () => {});
