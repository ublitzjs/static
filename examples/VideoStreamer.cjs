var uWS = require("uWebSockets.js");
var { analyzeFolder, staticServe } = require("@ublitzjs/static");
var { HeadersMap } = require("@ublitzjs/core");
const server = uWS.App();
(async () => {
  const serving = await staticServe({
    dirPath: "examples",
    fullRoute: "",
    paths: await analyzeFolder("examples", true),
  });
  server.get("/*", serving.get).head("/*", serving.head).any("/*", serving.any);
  server.listen(9001, () => {});
})();
