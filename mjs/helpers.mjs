"use strict";
var rangeRegex = /^bytes=(\d+)?-(\d+)?$/,
  getRanges = (range, maxEnd, maxChunk) => {
    var match = range.match(rangeRegex);
    if (!match) throw new Error("Range header is wrong");
    var points = [
      match[1] !== undefined ? Number(match[1]) || 0 : undefined,
      match[2] !== undefined ? Number(match[2]) : undefined,
    ];
    if (points[0] >= points[1] || points[0] === points[1])
      throw new Error("Range header is wrong");
    if (points[1] === undefined)
      points[1] = maxChunk ? Math.min(points[0] + maxChunk, maxEnd) : maxEnd;
    else if (points[0] === undefined) {
      points[0] = maxEnd - points[1];
      points[1] = maxEnd;
    }
    return points;
  },
  urlStartsWith = (url) => new RegExp("^" + url + "/?");
export { getRanges, urlStartsWith };
