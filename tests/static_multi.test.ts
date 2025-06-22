import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { request } from "undici";
import { staticServeMulti, analyzeFolder, urlStartsWith } from "../index.mjs";
import {
  App,
  us_listen_socket_close,
  us_socket_local_port,
  type us_listen_socket,
} from "uWebSockets.js";
var socket: us_listen_socket;
var port: number;

var server = App();

var methods = staticServeMulti({
  folders: [
    {
      dir: "tests/samples1",
      paths: await analyzeFolder("tests/samples1", {
        deleteMimesList: false,
        avoid: /avoid/,
        includeDates: false,
      }),
      regex: urlStartsWith("/static"),
    },
    {
      dir: "tests/samples2",
      paths: await analyzeFolder("tests/samples2", {
        deleteMimesList: false,
        avoid: /avoid/,
        includeDates: false,
      }),
      regex: urlStartsWith("/public"),
    },
  ],
  fallback: {
    paths: await analyzeFolder("tests/samples3", {
      deleteMimesList: true,
    } as any),
    dir: "tests/samples3",
  },
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
var genLink = (route: string) => `http://localhost:${port}${route}`;
describe("static multi", { concurrent: true }, () => {
  describe("samples 1 - first folder", () => {
    it(
      "sends index.html using directory url with slash",
      testOneCaseOfIndexHtml("/static/index.html")
    );
    it(
      "sends index.html using directory url without slash",
      testOneCaseOfIndexHtml("/static/")
    );
    it(
      "sends index.html using directory url without slash",
      testOneCaseOfIndexHtml("/static")
    );
  });
  describe("samples 2 - second folder", () => {
    it("just sends index.html form another folder", async () => {
      var response = await request(genLink("/public")).then((res) =>
        res.body.text()
      );
      expect(response).toMatch("<h1>hello from samples2</h1>");
    });
  });
  describe("samples 3 - fallback folder", () => {
    it("sends index.html from localhost itself", async () => {
      var response = await request(genLink("/")).then((res) => res.body.text());
      expect(response).toMatch("<h1>hello</h1>");
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
