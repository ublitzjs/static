![ublitzjs](https://github.com/ublitzjs/core/blob/main/logo.png)

# @ublitzjs/static package

This package simplifies sending static content<br/>

## sendFile and basicSendFile

_basicSendFile_

```typescript
import { HeadersMap } from "@ublitzjs/core";
import { basicSendFile } from "@ublitzjs/static";
import { stat } from "node:fs/promises";
import { App } from "uWebSockets.js";
var server = App();
server.get(
  "/video.mp4",
  basicSendFile(
    {
      path: "public/video.mp4",
      contentType: "video/mp4",
      /**max file size (or max size you wnat to send) */
      maxSize: (await stat("video.mp4")).size,
    },
    /**additional options*/
    {
      headers: HeadersMap.default,
      /**log errors to console */
      logs: true,
      /**can't send more than this IF Range header is present AND has no end specified */
      maxChunk: 1024 * 1024,
      /**whether Range header is required */
      requireRange: true,
    },
    /**advanced memory options */
    {
      /**goes to createReadStream */
      highWaterMark: 64 * 1024,
      /**see this in index.d.ts. This value is default */
      minQ: 32,
    }
  ) as any
);
```

Code snippet above is same as this:<br>
_sendFile_

```typescript
import {
  closure,
  HeadersMap,
  registerAbort,
  type HttpRequest,
  type HttpResponse,
} from "@ublitzjs/core";
import { getRanges, sendFile } from "@ublitzjs/static";
import { stat } from "node:fs/promises";
import { App } from "uWebSockets.js";
var server = App();
server.get(
  "/video.mp4",
  (await closure(async () => {
    var maxSize = (await stat("public/video.mp4")).size;
    var maxChunk = 1024 * 1024;
    var logs = true;
    var requireRange = true;
    return async (res: HttpResponse, req: HttpRequest) => {
      //#region get "Range" header
      registerAbort(res);
      var range = req.getHeader("range");
      if (range) {
        try {
          var { 0: start, 1: end }: any = getRanges(
            range,
            maxSize - 1,
            maxChunk
          );
          if (end - start + 1 > maxSize)
            return res.cork(() =>
              res.writeStatus("416").end("Range not satisfiable")
            );
        } catch (error) {
          return res.writeStatus("400").end((error as any).message);
        }
      } else if (requireRange)
        return res.writeStatus("400").end("Range header required");

      //#endregion
      var err = await sendFile(
        { res, path: "public/video.mp4", maxSize, contentType: "video/mp4" },
        { start, end, headers: HeadersMap.default }
      );
      if (err && logs) console.error("ERROR", err);
    };
  })) as any
);
```

## analyzeFolder

It recursively analyzes folder once, collect most important data (content-type, size) and returns you an object like this: <br>
{ "folder1/fileName.html" : { CT:"text/html" , size: 100 } }<br>
Usually is used with staticServe and staticServeMulti, and <a href="./examples/VideoStreamer.mjs">here</a> are the <a href="./tests/static_multi.test.ts">examples</a><br>
There are several rules of writing path to directory, so read them in <a href="./index.d.ts">Index.d.ts</a>

```typescript
await analyzeFolder(
  /*directory*/ "public/nestedFolder",
  /*options*/ {
    /*clear unused mime/types (recommended if it is the last function call)*/
    deleteMimesList: true,
    /*regex of things you want to avoid analyzing*/
    avoid: /(.git)|(.ts)|(.map)/,
    /*whether to include 'atime', 'mtime', 'ctime', 'birthtime'. Can be used in @ublitzjs/sitemap package (coming soon)*/
    includeDates: true,
  }
);
```

## staticServe, staticServeMulti, urlStartsWith (in multi example)

These functions are to serve static content (sure), but, contrary to dynamicServe, which uses file system each request, you are sending only analyzed files (via analyzeFolder).<br>
They handle trailing slashed and automatically lookup index.html (as well as dynamicServe)<br>
staticServe - serves 1 folder. Good if you needn't many paths.<br>
staticServeMulti - serves many folders. Best used with wildcard route "/\*"

_staticServe_

```typescript
var server = App();
var staticMethods = staticServe(
  {
    dirPath: "public",
    fullRoute: "/prefix/public", // url to look for
    paths: await analyzeFolder("public", { deleteMimesList: false }), // files to serve
  },
  // additional options
  {
    logs: true, // log errors from get method
    maxChunk: 1024 * 1024, // for range requests when no end byte is specified
    headers: HeadersMap.default,
  }
);
server
  .get("/*", staticMethods.get as any)
  .head("/*", staticMethods.head as any)
  // if finds file - code 405 (wrong method), else - 404
  .any("/*", staticMethods.any as any);
```

_staticServeMulti_ (for better example - check "tests" folder)

```typescript
var staticMethods = staticServeMulti(
  {
    folders: [
      {
        // goes to file system
        dir: "public",
        // another built-in method, which returns regex
        // it hcecks the url. If matched - checks paths
        regex: urlStartsWith("/prefix/public"),

        paths: await analyzeFolder("public", { deleteMimesList: false }),
      },
    ],
    // checks url when other folders failed.
    fallback: {
      dir: "meta",
      paths: await analyzeFolder("meta", { deleteMimesList: true }),
    },
  },
  // additional options as before... they are OPTIONAL
  {}
);
server
  .get("/*", staticMethods.get as any)
  .head("/*", staticMethods.head as any)
  .any("/*", staticMethods.any as any);
```

## dynamicServe

This function differs from static ones in using file system each time, the request comes, instead of checking folder AND then looking up the url in an analyzed object.<br>
Suits using for folders, contents of which you can't track or control (like uploads).

```typescript
var dynamicMethods = dynamicServe(
  /*route regex*/ urlStartsWith("/your-uploads"),
  /*directory*/ "uploads",
  {
    avoid: /*doesn't send these files*/ /.special-upload/,
    logs: true /*logging errors from sending file*/,
    // setting your custom headers ( also is in static versions )
    headers: new HeadersMap({ ...HeadersMap.baseObj })
      .remove("Cross-Origin-Opener-Policy")
      .prepare(),
    maxChunk: 1024 * 1024,
    // if Range header is required (if uploads are large videos, then it needs to be required)
    requireRange: true,
  }
);
server
  .get("/*", dynamicMethods.get as any)
  .head("/*", dynamicMethods.head as any)
  .any("/*", dynamicMethods.any as any);
```
