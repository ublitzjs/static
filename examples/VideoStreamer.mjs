import uWS from "uWebSockets.js";
import { analyzeFolder, staticServe } from "@ublitzjs/static/serving";
import { c400, HeadersMap } from "@ublitzjs/core";
const server = uWS.App();
const serving = staticServe(
  {
    dirPath: "examples",
    fullRoute: "",
    paths: await analyzeFolder("examples", true),
  },
  { maxChunk: 10 * 1024 * 1024, logs: true, requireRange: false }
);
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
