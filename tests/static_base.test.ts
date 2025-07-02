import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { request } from "undici";
import { staticServe, analyzeFolder } from "../mjs/serving.mjs";
import {
  App,
  us_listen_socket_close,
  us_socket_local_port,
  type us_listen_socket,
} from "uWebSockets.js";
var socket: us_listen_socket;
var port: number;

var server = App();
var paths = (await analyzeFolder("tests/samples1", {
  avoid: /avoid/,
  deleteMimesList: true,
  includeDates: false,
})) as any;
var methods = staticServe({
  dirPath: "tests/samples1",
  fullRoute: "/static",
  paths, // if sends files - works,
} as any);
server.get("/*", methods.get).head("/*", methods.head).any("/*", methods.any);
beforeAll(() => {
  server.listen(0, (token) => {
    port = us_socket_local_port(token);
    socket = token;
  });
});
afterAll(() => {
  us_listen_socket_close(socket);
});
var genLink = (route: string) => `http://localhost:${port}/static${route}`;

describe("analyzeFolder samples1", () => {
  it("has index.html", () => {
    var html = paths["index.html"];
    expect(html.CT).toBe("text/html");
    expect(html.size < 17 && html.size > 14).toBe(true);
  });
  it("doesn't have avoid.txt", () =>
    expect(paths["avoid.txt"]).toBe(undefined));
  it("analyzed folder recursively and has folder/empty.json", () => {
    expect(paths["folder/empty.json"]).toEqual({
      CT: "application/json",
      size: 0,
    });
  });
});
describe("staticServe", { concurrent: true }, () => {
  it("sends index.html as usual", testOneCaseOfIndexHtml("/index.html"));
  it(
    "sends index.html using directory url with slash",
    testOneCaseOfIndexHtml("/")
  );
  it(
    "sends index.html using directory url without slash",
    testOneCaseOfIndexHtml("")
  );
  it("accepts range request", async () => {
    var link = genLink("/index.html");
    var response = await request(link, {
      method: "GET",
      headers: {
        Range: "bytes=0-3",
      },
    });
    expect(response.headers["accept-ranges"]).toBe("bytes");
    expect(response.headers["content-range"]).toMatch("bytes 0-3/");
    expect(response.headers["content-length"]).toBe("4");
    expect(await response.body.text()).toBe("<h1>");
  });
  it("actually doesn't send anything, absent in paths", async () => {
    var response = await request(genLink("/avoid.txt"));
    expect(response.statusCode).toBe(404);
    response.body.on("error", () => {});
    response.body.destroy();
  });
  it(`doesn't crash "sendFile" even if file is empty`, async () => {
    var response = await request(genLink("folder/empty.json"));
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-length"]).toBe("0");
  });
  describe('"any" method', () => {
    it("sends 404 if not found file", async () => {
      var response = await request(genLink("something/random"), {
        method: "POST",
      });
      expect(response.statusCode).toBe(404);
    });
    it("sends 405 if found file, but wrong method", async () => {
      var response = await request(genLink("folder/empty.json"), {
        method: "POST",
      });
      expect(response.statusCode).toBe(405);
      expect(response.headers["allow"]).toBe("GET, HEAD");
    });
  });
});
function testOneCaseOfIndexHtml(url: string) {
  return async () => {
    var link = genLink(url);
    var [get, head] = await Promise.all([
      request(link),
      request(link, { method: "HEAD" }),
    ]);
    const txt = await get.body.text();

    expect(get.statusCode).toBe(200);
    expect(head.statusCode).toBe(200);

    expect(get.headers["allow"]).toBe("GET, HEAD");
    expect(head.headers["allow"]).toBe("GET, HEAD");

    expect(txt).toMatch("<h1>hello</h1>");
  };
}
