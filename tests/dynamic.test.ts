import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { request } from "undici";
import {
  App,
  us_listen_socket_close,
  us_socket_local_port,
  type us_listen_socket,
} from "uWebSockets.js";
import { dynamicServe, urlStartsWith } from "../index.mjs";
import { HeadersMap } from "@ublitzjs/core";
import { unlink, writeFile } from "node:fs/promises";
var socket: us_listen_socket;
var port: number;

var server = App();

var methods = dynamicServe(
  /*route regex*/ urlStartsWith("/uploads"),
  /*directory*/ "tests/samples3",
  {
    avoid: /*doesn't send these files*/ /.no/,
    logs: true /*logging errors from sending file*/,
    // setting your custom headers ( also is in static versions )
    headers: new HeadersMap({ ...HeadersMap.baseObj })
      .remove("Cross-Origin-Opener-Policy")
      .prepare(),
  }
);
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
describe("dynamic version", { concurrent: true }, () => {
  describe("basic index.html", () => {
    it(
      "sends index.html using directory url with slash",
      testOneCaseOfIndexHtml("/uploads/index.html")
    );
    it(
      "sends index.html using directory url without slash",
      testOneCaseOfIndexHtml("/uploads/")
    );
    it(
      "sends index.html using directory url without slash",
      testOneCaseOfIndexHtml("/uploads")
    );
  });
  it("sends recently created files", async () => {
    await writeFile("tests/samples3/new.txt", "hello");
    var response = await request(genLink("/uploads/new.txt"));
    expect(response.statusCode).toBe(200);
    expect(await response.body.text()).toBe("hello");
    await unlink("tests/samples3/new.txt");
  });
  it("avoids files, specified in regex", async () => {
    await writeFile("tests/samples3/new.no.txt", "hello");
    var response = await request(genLink("/uploads/new.no.txt"));
    expect(response.statusCode).toBe(404);
    await unlink("tests/samples3/new.no.txt");
  });
  describe('"any" method', () => {
    it("sends 404 if not found file", async () => {
      var response = await request(genLink("/something/random"), {
        method: "POST",
      });
      expect(response.statusCode).toBe(404);
    });
    it("sends 405 if found file, but wrong method", async () => {
      var response = await request(genLink("/uploads/empty.json"), {
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
