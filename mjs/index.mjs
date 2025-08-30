"use strict";
import fs from "node:fs";
import { registerAbort } from "@ublitzjs/core";
import { getRanges, urlStartsWith } from "./helpers.mjs";
var drainEndEvent = Symbol(),
  globalEndEvent = Symbol(),
  bindTryEnd = (res, totalSize) => (chunk) =>
    new Promise((resolve) =>
      res.cork(() => resolve(res.tryEnd(chunk, totalSize)))
    ),
  standardHighWaterMark = 65536;

async function sendFile(
  { res, path, fd, maxSize, contentType = "application/octet-stream" },
  { start, end, headers } = {},
  memory = {}
) {
  var totalSize = (end || maxSize - 1) - (start || 0) + 1;
  if (totalSize === 0) {
    res.cork(() => {
      res.writeHeader("Content-Type", contentType);
      if (headers) headers(res);
      res.endWithoutBody(0);
    });
    return undefined;
  }
  try {
    var readStream = fs.createReadStream(path, {
      fd,
      highWaterMark: memory.highWaterMark || standardHighWaterMark,
      end,
      start,
    });
  } catch (error) {
    return (
      res.cork(() => res.writeStatus("500").end("Internal server error")), error
    );
  }
  res.emitter.once("abort", () => {
    if (!globalError) globalError = new Error("Aborted");
    readStream.destroy(), res.emitter.emit(globalEndEvent);
  });

  //#region write headers
  res.cork(() => {
    if (totalSize < maxSize)
      res
        .writeStatus("206")
        .writeHeader(
          "Content-Range",
          `bytes ${start}-${end || maxSize - 1}/${maxSize}`
        );
    res.writeHeader("Content-Type", contentType);
    if (headers) headers(res);
  });
  //#endregion

  //#region variables
  var queue = [],
    processingChunks = false,
    corkedTryEnd = bindTryEnd(res, totalSize),
    checkIfReqEnded = () =>
      res.aborted || res.finished
        ? (readStream.destroy(), res.emitter.emit(drainEndEvent), true)
        : false,
    readEnded = false,
    lastOffset,
    unsentChunk,
    globalError,
    minQ = memory.minQ || 32,
    maxQ = minQ * 2;
  //#endregion

  //#region functions
  function onData({ buffer }) {
    if (queue.length >= maxQ && !readStream.isPaused()) readStream.pause();
    if (checkIfReqEnded() || processingChunks) return queue.push(buffer);
    processingChunks = true;
    processChunks(queue.length > 0 ? undefined : buffer);
  }
  async function processChunks(buffer) {
    if (!buffer && !(buffer = queue.shift())) return;
    do {
      if (checkIfReqEnded()) return;
      if (readStream.isPaused() && queue.length < minQ) readStream.resume();

      var prevOffset = res.getWriteOffset(),
        { 0: ok, 1: done } = await corkedTryEnd(buffer);
      res.finished = done;
      if (!ok && !done) {
        unsentChunk = buffer;
        lastOffset = prevOffset;
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
      unsentChunk.slice(offset - lastOffset),
      totalSize
    );
    res.finished = done;
    if (ok) {
      unsentChunk = undefined;
      lastOffset = undefined;
      res.emitter.emit(drainEndEvent);
    }
    if (done) res.emitter.emit(globalEndEvent);
    return done || ok;
  }
  //#endregion

  //#region readStream.on
  readStream
    .on("data", onData)
    .once("error", (err) => {
      console.log("ERROR");
      if (!res.aborted) res.close();
      if (!globalError) globalError = err;
      res.emitter.emit(globalEndEvent);
    })
    .once("end", () => {
      readEnded = true;
      if (!processingChunks) res.emitter.emit(globalEndEvent);
    });
  //#endregion
  await new Promise((resolve) => res.emitter.once(globalEndEvent, resolve));
  return readStream.removeAllListeners(), globalError;
}

function basicSendFile(
  { contentType = "application/octet-stream", path, maxSize },
  { headers, maxChunk, logs, requireRange } = {},
  memory
) {
  return async (res, req) => {
    registerAbort(res);
    //#region get "Range" header
    var range = req.getHeader("range");
    if (range) {
      try {
        var { 0: start, 1: end } = getRanges(range, maxSize - 1, maxChunk);
        if (end - start + 1 > maxSize)
          return res.cork(() =>
            res.writeStatus("416").end("Range not satisfiable")
          );
      } catch (error) {
        return res.writeStatus("400").end(error.message);
      }
    } else if (requireRange)
      return res.writeStatus("400").end("range header required");
    //#endregion
    var err = await sendFile(
      { res, path, maxSize, contentType },
      { start, end, headers },
      memory
    );
    if (err && logs) console.error("ERROR", err);
  };
}

export { basicSendFile, sendFile, getRanges, urlStartsWith };
