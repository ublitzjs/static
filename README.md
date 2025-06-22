![ublitzjs](https://github.com/ublitzjs/core/blob/main/logo.png)

# @ublitzjs/static package

This package simplifies sending static content<br/>

## sendFile and basicSendFile

_basicSendFile_

```typescript
import { basicSendFile } from "@ublitzjs/static";
import { App } from "uWebSockets.js";
var server = App();
server.get(
  "/index.html",
  basicSendFile(
    //path to file
    "public/index.html",
    // Content-Type
    "text/html",
    /*log if error occurs*/ true
  ) as any
);
```

Code snippet above is same as this:<br>
_sendFile_

```typescript
import { registerAbort } from "@ublitzjs/core";
import { sendFile } from "@ublitzjs/static";
import { App } from "uWebSockets.js";
var server = App();
server.get("/index.html", async (res) => {
  registerAbort(res);
  const error = await sendFile({
    res: res as any,
    totalSize: Infinity,
    contentType: "text/html",
    path: "public/index.html",
  });
  if (error) console.error(error);
});
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
var staticMethods = staticServe({
  dirPath: "public",
  fullRoute: "/prefix/public",
  paths: await analyzeFolder("public", { deleteMimesList: false }),
  logs: true, // log errors from get method
});
server
  // finds file and sends
  .get("/*", staticMethods.get as any)
  //finds file and sends size with Content-Type
  .head("/*", staticMethods.head as any)
  // if finds file - code 405 (wrong method), else - 404
  .any("/*", staticMethods.any as any);
```

_staticServeMulti_

```typescript
var staticMethods = staticServeMulti({
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
});
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
  }
);
server
  .get("/*", dynamicMethods.get as any)
  .head("/*", dynamicMethods.head as any)
  .any("/*", dynamicMethods.any as any);
```
