"use strict";
var path = require("node:path"),
  {
    HeadersMap,
    c405,
    c404,
    toAB,
    registerAbort,
    c400,
  } = require("@ublitzjs/core"),
  { urlStartsWith, getRanges } = require("./helpers.cjs"),
  { readdir, stat } = require("node:fs/promises"),
  { sendFile } = require("./index.cjs"),
  shouldAddDirSlash = (path) =>
    path !== "/" && path !== "" && !path.endsWith("/"),
  allowHeaderArray = [toAB("Allow"), toAB("GET, HEAD")],
  simpleHeaders = new HeadersMap({
    Allow: "GET, HEAD",
    "Accept-Ranges": "bytes",
  }).prepare();

async function analyzeFolder(
  outerPath,
  { deleteMimesList, avoid, includeDates }
) {
  var mrmire = require("mrmime");
  // path: {size, content-type}
  var fullPaths = {};
  async function recursiveAnalysis(currentPath, first) {
    var files = await readdir(
      first ? outerPath : outerPath + "/" + currentPath
    );
    var promises = [];
    for (const name of files) {
      if (avoid && avoid.test(name)) continue;
      const innerPath = first ? name : currentPath + "/" + name;
      promises.push(
        stat(outerPath + "/" + innerPath).then((stats) => {
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
function staticServe({ fullRoute, dirPath, paths }, opts = {}) {
  if (!opts.maxChunk) opts.maxChunk = Infinity;
  var prefixRegex = urlStartsWith(fullRoute);
  var getCurrentPath = (req) => req.getUrl().replace(prefixRegex, "");
  function createFileMonolith(req) {
    var monolith = {
      givenUrl: getCurrentPath(req),
      file: undefined,
    };
    if ((monolith.file = paths[monolith.givenUrl])) return monolith;
    var slash = "";
    if (shouldAddDirSlash(monolith.givenUrl)) slash = "/";
    // if there is no file and no index.html
    return (monolith.file = paths[(monolith.givenUrl += slash + "index.html")])
      ? monolith
      : undefined;
  }

  return {
    async get(res, req) {
      registerAbort(res);
      var monolith = createFileMonolith(req);
      if (!monolith) return res.writeStatus(c404).end("NOT FOUND");
      //#region get "range" header
      var range = req.getHeader("range");
      if (range) {
        try {
          var { 0: start, 1: end } = getRanges(
            range,
            monolith.file.size - 1,
            opts.maxChunk
          );
          if (end - start + 1 > opts.maxSize)
            return res.cork(() =>
              res.writeStatus("416").end("Range not satisfiable")
            );
        } catch (error) {
          return res.writeStatus(c400).end(error.message);
        }
      } else if (opts.requireRange)
        return res.writeStatus(c400).end("Range header required");
      //#endregion
      const err = await sendFile(
        {
          res,
          contentType: monolith.file.CT,
          path: dirPath + "/" + monolith.givenUrl,
          maxSize: monolith.file.size,
        },
        {
          start,
          end,
          headers: (res) => {
            if (opts.headers) opts.headers(res);
            simpleHeaders(res);
          },
        }
      );
      if (err && opts.logs) console.error("sendFile error", err);
    },
    head(res, req) {
      res.onAborted(() => {
        res.aborted = true;
      });
      var monolith = createFileMonolith(req);
      if (res.aborted) return;
      if (!monolith) return res.writeStatus(c404).end("NOT FOUND");
      if (opts.headers) opts.headers(res);
      simpleHeaders(
        res.writeHeader("Content-Type", monolith.file.CT)
      ).endWithoutBody(monolith.file.size);
    },
    any(res, req) {
      res.onAborted(() => {
        res.aborted = true;
      });
      var monolith = createFileMonolith(req);
      if (res.aborted) return;
      if (!monolith) return res.writeStatus(c404).end("NOT FOUND");
      res.writeStatus(c405);
      if (opts.headers) opts.headers(res);
      simpleHeaders(res).end("Wrong method");
    },
  };
}
var dynamicRangeHandling = ()=>`
  if (range) {
    try {
      var { 0: start, 1: end } = addFns.getRanges(
        range,
        file.size - 1,
        conf.maxChunk
      );
      if (end - start + 1 > conf.maxSize)
        return res.cork(() =>
          res.writeStatus("416").end("Range not satisfiable")
        );
    } catch (error){
      return res.cork(() => res.writeStatus("400").end(error.message));
    }
  } else if (conf.requireRange)
    return res.cork(() =>
      res.writeStatus("400").end("Range header required")
    );
`
var dynamicServeFnStructure = (conf)=>`
  regAb(res);
  var currentPath = getCurrentPath(req);
  var range = req.getHeader("range");
  try{
    ${conf.avoid ? "if(conf.avoid.test(currentPath))throw new Error(\"Avoid regex matched\");":""}
    ${conf.decisionGen ? `var decisionGen = conf.decisionGen(req);decisionGen.next();` : ""}
    var file = await addFns.stat(currentPath);
    if (file.isDirectory()) {
      ${conf.noIndexHtml ? `throw new Error("no file");` : `
      let str = "";
      if (addFns.addSlash(currentPath)) str = "/";
      currentPath += str + "index.html";
      file = await addFns.stat(currentPath);
      `}
    }
  } catch {
    if (res.aborted) return;
    return res.cork(() => res.writeStatus("404").end("NOT FOUND"));
  }
  if (res.aborted) return;
`
function dynamicServe(routeRegex, dirPath, conf = {}) {
  var getCurrentPath = (req) =>
    dirPath + "/" + req.getUrl().replace(routeRegex, "");
  if(!conf.mimes) conf.mimes = require("mrmime").mimes;
  var addFns = {
    stat, getRanges, sendFile, extname: path.extname, error: console.error, addSlash: shouldAddDirSlash
  }
  return {
    get: new Function(
      "regAb",
      "getCurrentPath",
      "conf",
      "addFns",
      "simpleHeaders",
      `return async(res,req)=>{
      ${dynamicServeFnStructure(conf)}
      ${dynamicRangeHandling()}
      ${conf.decisionGen ? "if(!decisionGen.next(currentPath).value)return res.cork(()=>res.writeStatus(\"404\").end(\"Not Found\"))" : ""}
        const err = await addFns.sendFile({
            res,
            contentType:
              conf.mimes[addFns.extname(currentPath).slice(1)] ||
              "application/octet-stream",
            path: currentPath,
            maxSize: file.size,
          },
          {
            start,
            end,
            headers: (res) => {
              if (conf.headers) conf.headers(res);
              simpleHeaders(res);
            },
          }
        );
        ${conf.logs ? "if(err) addFns.error(err)":""}
      }`
    )(registerAbort, getCurrentPath, conf, addFns, simpleHeaders),
    head: new Function(
      "regAb",
      "getCurrentPath",
      "conf",
      "addFns",
      `return async(res,req)=>{
        ${dynamicServeFnStructure(conf)}
        ${dynamicRangeHandling()}
      ${conf.decisionGen ? "if(!decisionGen.next(currentPath).value)return res.cork(()=>res.writeStatus(\"404\").end(\"Not Found\"))" : ""}
        var CT = conf.mimes[addFns.extname(currentPath).slice(1)]
        res.cork(() => {
          if (conf.headers) conf.headers(res);
          res
            .writeHeader("Allow", "GET, HEAD")
            .writeHeader("Content-Type", CT)
            .endWithoutBody(file.size);
        });
      }`
    )(registerAbort, getCurrentPath, conf, addFns),
    any: new Function(
      "regAb",
      "getCurrentPath",
      "conf",
      "addFns",
      `return async(res,req)=>{
        ${dynamicServeFnStructure(conf)}
        ${conf.decisionGen ? "if(!decisionGen.next(currentPath).value)return res.cork(()=>res.writeStatus(\"404\").end(\"Not Found\"))" : ""}
        res.cork(() => {
          res.writeStatus("405");
          if (conf.headers) conf.headers(res);
          res
            .writeHeader("Allow", "GET, HEAD")
            .end("Wrong method");
        });
      }`
    )(registerAbort, getCurrentPath, conf, addFns)
  }
}

function createFileMonolithForStaticMulti(folders, fallback, req) {
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
function staticServeMulti(
  { folders, fallback },
  { headers, logs, maxChunk, requireRange } = {}
) {
  return {
    async get(res, req) {
      registerAbort(res);

      //#region check if file exists
      var monolith = createFileMonolithForStaticMulti(folders, fallback, req);
      if (res.aborted) return;
      if (!monolith) return res.writeStatus(c404).end("NOT FOUND");
      //#endregion

      //#region get "range" header
      var range = req.getHeader("range");
      if (range) {
        try {
          var { 0: start, 1: end } = getRanges(
            range,
            monolith.file.size - 1,
            maxChunk
          );
          if (end - start + 1 > monolith.file.size)
            return res.cork(() =>
              res.writeStatus("416").end("Range not satisfiable")
            );
        } catch (error) {
          return res.writeStatus(c400).end(error.message);
        }
      } else if (requireRange)
        return res.writeStatus(c400).end("Range header required");
      //#endregion

      //#region send file
      const error = await sendFile(
        {
          res,
          path: monolith.dir + "/" + monolith.givenUrl,
          contentType: monolith.file.CT,
          maxSize: monolith.file.size,
        },
        {
          start,
          end,
          headers: (res) => {
            if (headers) headers(res);
            simpleHeaders(res);
          },
        }
      );
      if (error && logs) console.error(error);
      //#endregion
    },
    head(res, req) {
      res.onAborted(() => {
        res.aborted = true;
      });
      var monolith = createFileMonolithForStaticMulti(folders, fallback, req);
      if (res.aborted) return;
      if (!monolith) return res.writeStatus(c404).end("NOT FOUND");
      simpleHeaders(
        res.writeHeader("Content-Type", monolith.file.CT)
      ).endWithoutBody(monolith.file.size);
    },
    any(res, req) {
      res.onAborted(() => {
        res.aborted = true;
      });
      var monolith = createFileMonolithForStaticMulti(folders, fallback, req);
      if (res.aborted) return;
      if (!monolith) return res.writeStatus(c404).end("NOT FOUND");

      res.writeStatus(c405);
      if (headers) headers(res);
      res
        .writeHeader(allowHeaderArray[0], allowHeaderArray[1])
        .end("Wrong method");
    },
  };
}

function setIndexHtmlOnMonolith(monolith, paths) {
  var slash = "";
  if (shouldAddDirSlash(monolith.givenUrl)) slash = "/";
  monolith.givenUrl += slash + "index.html";
  monolith.file = paths[monolith.givenUrl];
}
function clearMimes(){
  deepDeleteFromCache(require.resolve("mrmime"))
}
module.exports = { staticServe, staticServeMulti, dynamicServe, analyzeFolder, clearMimes };
