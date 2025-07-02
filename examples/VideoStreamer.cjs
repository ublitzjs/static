var uWS = require("uWebSockets.js");
var { analyzeFolder, staticServe } = require("@ublitzjs/static/serving");
var { HeadersMap, c400 } = require("@ublitzjs/core");
const server = uWS.App();
(async () => {
  const serving = staticServe({
    dirPath: "examples",
    fullRoute: "",
    paths: await analyzeFolder("examples", true),
  });
  server.get("/", (res, req) => {
    var video = Number(req.getQuery("v"));
    if (!video || video < 1 || video > 4)
      return res.writeStatus(c400).end("Wrong video");
    res.end(
      "<!DOCTYPE html><body><video controls autoplay width='600' muted height='400'><source src='/video" +
        video +
        ".mp4'/></video></body>"
    );
  });
  server.get("/*", serving.get).head("/*", serving.head).any("/*", serving.any);
  server.listen(9001, () => {});
})();
