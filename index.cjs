"use strict";
var fs = require("node:fs"),
  fsPromises = fs.promises,
  { createRequire } = require("node:module"),
  path = require("node:path"),
  { c404, c405, registerAbort, toAB } = require("@ublitzjs/core"),
  notFoundMessage = toAB("NOT FOUND"),
  CT_header = toAB("Content-Type"),
  CL_header = toAB("Content-Length"),
  shouldAddDirectorySlash = (path) =>
    path !== "/" && path !== "" && !path.endsWith("/"),
  allowHeaderArray = [toAB("Allow"), toAB("GET, HEAD")],
  wrongMethodMessage = toAB("Wrong method"),
  chunkSize = 64 * 1024,
  drainEndEvent = Symbol(),
  globalEndEvent = Symbol();

function bindTryEnd(res, totalSize) {
  return (chunk) =>
    new Promise((resolve) =>
      res.cork(() => resolve(res.tryEnd(chunk, totalSize)))
    );
}
async function sendFile({ path, contentType, res, totalSize }) {
  //!__________important
  res.cork(() => res.writeHeader(toAB("Content-Type"), toAB(contentType)));
  try {
    var maxSize = (await fs.promises.stat(path)).size;
    if (totalSize > maxSize) totalSize = maxSize;
    if (totalSize === 0) {
      res.finished = true;
      return void res.cork(() => res.end());
    }
    var readStream = fs.createReadStream(path, {
      highWaterMark: chunkSize,
      end: totalSize - 1,
    });
  } catch (error) {
    res.close();
    return error;
  }
  var queue = [],
    processingChunks = false,
    corkedTryEnd = bindTryEnd(res, totalSize),
    checkIfReqEnded = () => {
      if (res.aborted || res.done) {
        readStream.destroy();
        return !!res.emitter.removeAllListeners();
      }
      return false;
    },
    readEnded = false;
  function onData({ buffer }) {
    if (queue.length >= 64 && !readStream.isPaused()) readStream.pause();
    if (checkIfReqEnded() || processingChunks) return queue.push(buffer);
    processingChunks = true;
    processChunks(queue.length > 0 ? void 0 : buffer);
  }
  async function processChunks(buffer) {
    if (!buffer && !(buffer = queue.shift())) return;
    do {
      if (checkIfReqEnded()) return;
      if (readStream.isPaused() && queue.length < 32) readStream.resume();
      var prevOffset = res.getWriteOffset();
      var { 0: ok, 1: done } = await corkedTryEnd(buffer);
      res.done = done;
      if (!ok && !done) {
        res.unsentChunk = buffer;
        res.lastOffset = prevOffset;
        res.onWritable(drainHandler);
        await new Promise((resolve) =>
          res.emitter.once(drainEndEvent, resolve)
        );
      }
    } while ((buffer = queue.shift()));
    if (readEnded && res.done) res.emitter.emit(globalEndEvent);
    processingChunks = false;
  }
  function drainHandler(offset) {
    var { 0: ok, 1: done } = res.tryEnd(
      res.unsentChunk.slice(offset - res.lastOffset),
      totalSize
    );
    res.done = done;
    if (ok) {
      delete res.unsentChunk;
      delete res.lastOffset;
      res.emitter.emit(drainEndEvent);
    }
    if (done) res.emitter.emit(globalEndEvent);

    return done || ok;
  }
  res.emitter.once("abort", () => {
    if (!res.error) res.error = new Error("Aborted");
    readStream.destroy();
    res.emitter.emit(globalEndEvent);
  });
  //!___________registration
  readStream
    .on("data", onData)
    .once("error", (err) => {
      if (!res.aborted) res.close();
      if (!res.error) res.error = err;
      res.emitter.emit(globalEndEvent);
    })
    .once("end", () => {
      readEnded = true;
      if (!processingChunks) res.emitter.emit(globalEndEvent);
    });
  await new Promise((resolve) => {
    res.emitter.once(globalEndEvent, resolve);
  });
  if (res.done) res.finished = true;
  readStream.removeAllListeners();
  return res.error;
}
async function analyzeFolder(
  outerPath,
  { deleteMimesList, avoid, includeDates }
) {
  const mrmire = require("mrmime");
  // path: {size, content-type}
  var fullPaths = {};
  async function recursiveAnalysis(currentPath, first) {
    var files = await fsPromises.readdir(
      first ? outerPath : outerPath + "/" + currentPath
    );
    var promises = [];
    for (const name of files) {
      if (avoid && avoid.test(name)) continue;
      const innerPath = first ? name : currentPath + "/" + name;
      promises.push(
        fsPromises.stat(outerPath + "/" + innerPath).then((stats) => {
          if (stats.isDirectory()) return recursiveAnalysis(innerPath, false);
          var data = {
            CT:
              mrmire.lookup(path.extname(innerPath)) ||
              "application/octet-stream",
            size: stats.size,
          };
          if (includeDates) {
            data.atime = stats.atime;
            data.mtime = stats.mtime;
            data.ctime = stats.ctime;
            data.birthtime = stats.birthtime;
          }
          fullPaths[innerPath] = data;
        })
      );
    }
    await Promise.all(promises);
  }
  await recursiveAnalysis(outerPath, true);
  // clear unwanted dependency
  if (deleteMimesList) deepDeleteFromCache(require.resolve("mrmime"));
  return fullPaths;
}
function deepDeleteFromCache(modulePath) {
  var mod = require.cache[modulePath];
  if (!mod) return;
  mod.children.forEach((child) => deepDeleteFromCache(child.id));
  delete require.cache[modulePath];
}
function staticServe({ fullRoute, dirPath, paths, headers, logs }) {
  var prefixRegex = urlStartsWith(fullRoute);
  var getCurrentPath = (req) => req.getUrl().replace(prefixRegex, "");
  function createFileMonolith(res, req) {
    var monolith = {
      givenUrl: getCurrentPath(req),
      file: undefined,
    };
    if ((monolith.file = paths[monolith.givenUrl])) return monolith;
    let slash = "";
    if (shouldAddDirectorySlash(monolith.givenUrl)) slash = "/";
    // if there is no file and no index.html
    return (monolith.file = paths[(monolith.givenUrl += slash + "index.html")])
      ? monolith
      : undefined;
  }

  return {
    async get(res, req) {
      registerAbort(res);
      var monolith = createFileMonolith(res, req);
      if (!monolith) return res.writeStatus(c404).end(notFoundMessage);
      if (headers) headers(res);
      res.writeHeader(allowHeaderArray[0], allowHeaderArray[1]);
      const err = await sendFile({
        res,
        contentType: monolith.file.CT,
        path: dirPath + "/" + monolith.givenUrl,
        totalSize: monolith.file.size,
      });
      if (err && logs) console.error("sendFile error", err);
    },
    head(res, req) {
      registerAbort(res);
      var monolith = createFileMonolith(res, req);
      if (!monolith) return res.writeStatus(c404).end(notFoundMessage);
      if (headers) headers(res);
      res
        .writeHeader(CT_header, monolith.file.CT)
        .writeHeader(allowHeaderArray[0], allowHeaderArray[1])
        .endWithoutBody(monolith.file.size);
    },
    any(res, req) {
      registerAbort(res);
      var monolith = createFileMonolith(res, req);
      if (!monolith) return res.writeStatus(c404).end(notFoundMessage);
      res.writeStatus(c405);
      if (headers) headers(res);
      res
        .writeHeader(allowHeaderArray[0], allowHeaderArray[1])
        .end(wrongMethodMessage);
    },
  };
}
var dynamicServe = (routeRegex, dirPath, conf) => {
  var getCurrentPath = (req) =>
    dirPath + "/" + req.getUrl().replace(routeRegex, "");
  var mrmime = require("mrmime");
  return {
    async get(res, req) {
      registerAbort(res);
      var currentPath = getCurrentPath(req);
      //#region find file stats
      try {
        if (conf.avoid && conf.avoid.test(currentPath))
          throw new Error("Avoid regex matched");

        var file = await fs.promises.stat(currentPath);

        if (file.isDirectory()) {
          //#region look for index.html
          let str = "";
          if (shouldAddDirectorySlash(currentPath)) str = "/";
          currentPath += str + "index.html";
          file = await fs.promises.stat(currentPath);
          //#endregion
        }
      } catch {
        return res.cork(() => res.writeStatus(c404).end(notFoundMessage));
      }
      //#endregion

      if (conf.headers) res.cork(() => conf.headers(res));
      res.cork(() => res.writeHeader(allowHeaderArray[0], allowHeaderArray[1]));
      //#region send file
      const err = await sendFile({
        res,
        contentType:
          mrmime.lookup(path.extname(currentPath)) ||
          "application/octet-stream",
        path: currentPath,
        totalSize: file.size,
      });
      if (err && conf.logs) console.error(err);
      //#endregion
    },
    async head(res, req) {
      registerAbort(res);
      var currentPath = getCurrentPath(req);
      try {
        var file = await fs.promises.stat(currentPath);
        if (file.isDirectory() /*get html*/) {
          let str = "";
          if (shouldAddDirectorySlash(currentPath)) str = "/";
          currentPath += str + "index.html";
          file = await fs.promises.stat(currentPath);
        }
      } catch {
        return res.cork(() => res.writeStatus(c404).end(notFoundMessage));
      }
      if (conf.headers) conf.headers(res);
      res.cork(() => {
        res
          .writeHeader(allowHeaderArray[0], allowHeaderArray[1])
          .writeHeader(CT_header, file.CT)
          .endWithoutBody(file.size);
      });
    },
    async any(res, req) {
      registerAbort(res);
      var currentPath = getCurrentPath(req);
      try {
        var file = await fs.promises.stat(currentPath);
        if (file.isDirectory() /*get html*/) {
          let str = "";
          if (shouldAddDirectorySlash(currentPath)) str = "/";
          currentPath += str + "index.html";
          file = await fs.promises.stat(currentPath);
        }
      } catch {
        return res.cork(() => res.writeStatus(c404).end(notFoundMessage));
      }
      res.cork(() => {
        res.writeStatus(c405);
        if (conf.headers) conf.headers(res);
        res
          .writeHeader(allowHeaderArray[0], allowHeaderArray[1])
          .end(wrongMethodMessage);
      });
    },
  };
};

function createFileMonolithForStaticMulti(folders, fallback, res, req) {
  var monolith = {
    givenUrl: req.getUrl(),
    file: undefined,
    dir: undefined,
  };
  //#region find the right folder AND replace givenUrl
  var rightFolder;
  for (const folder of folders) {
    if (!folder.regex.test(monolith.givenUrl)) continue;
    monolith.givenUrl = monolith.givenUrl.replace(folder.regex, "");
    rightFolder = folder;
    monolith.dir = rightFolder.dir;
    break;
  }
  //#endregion

  //#region if no right folder - use fallback or return
  if (!rightFolder) {
    if (!fallback) return undefined;
    monolith.givenUrl = monolith.givenUrl.replace("/", "");
    monolith.dir = fallback.dir;
    monolith.file = fallback.paths[monolith.givenUrl];
    if (monolith.file) return monolith;
    setIndexHtmlOnMonolith(monolith, fallback.paths);
    return monolith.file ? monolith : undefined;
  }
  //#endregion

  //#region set monolith.file to needed one or index.html
  monolith.file = rightFolder.paths[monolith.givenUrl];
  if (monolith.file) return monolith;
  setIndexHtmlOnMonolith(monolith, rightFolder.paths);
  return monolith.file ? monolith : undefined;
  //#endregion
}
function staticServeMulti({ folders, fallback, headers, logs }) {
  return {
    async get(res, req) {
      registerAbort(res);
      var monolith = createFileMonolithForStaticMulti(
        folders,
        fallback,
        res,
        req
      );
      if (res.aborted) return;
      if (!monolith) return res.writeStatus(c404).end(notFoundMessage);
      res.writeHeader(allowHeaderArray[0], allowHeaderArray[1]);
      //#region send file
      const error = await sendFile({
        res,
        path: monolith.dir + "/" + monolith.givenUrl,
        contentType: monolith.file.CT,
        totalSize: monolith.file.size,
      });
      if (error && logs) console.error(error);
      //#endregion
    },
    head(res, req) {
      registerAbort(res);
      var monolith = createFileMonolithForStaticMulti(
        folders,
        fallback,
        res,
        req
      );
      if (res.aborted) return;
      if (!monolith) return res.writeStatus(c404).end("NOT FOUND");
      res
        .writeHeader(CT_header, monolith.file.CT)
        .writeHeader(allowHeaderArray[0], allowHeaderArray[1])
        .endWithoutBody(monolith.file.size);
    },
    any(res, req) {
      registerAbort(res);
      var monolith = createFileMonolithForStaticMulti(
        folders,
        fallback,
        res,
        req
      );
      if (res.aborted) return;
      if (!monolith) return res.writeStatus(c404).end(notFoundMessage);

      return res.writeStatus(c405);
      if (headers) headers(res);
      res
        .writeHeader(allowHeaderArray[0], allowHeaderArray[1])
        .end(wrongMethodMessage);
    },
  };
}
function urlStartsWith(url) {
  return new RegExp("^" + url + "/?");
}
function setIndexHtmlOnMonolith(monolith, paths) {
  var slash = "";
  if (shouldAddDirectorySlash(monolith.givenUrl)) slash = "/";
  monolith.givenUrl += slash + "index.html";
  monolith.file = paths[monolith.givenUrl];
}
function basicSendFile(path, CT, logs) {
  return async (res) => {
    registerAbort(res);
    const error = await sendFile({
      res,
      totalSize: Infinity,
      contentType: CT,
      path,
    });
    if (error && logs) console.error(error);
  };
}
module.exports = {
  basicSendFile,
  sendFile,
  analyzeFolder,
  staticServe,
  dynamicServe,
  staticServeMulti,
  urlStartsWith,
};
