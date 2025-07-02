import type {
  HttpControllerFn,
  HttpResponse,
} from "@ublitzjs/core";
import type {HttpResponse as uwsHttpResponse } from "uWebSockets.js"

/**
   * function which writes headers (needn't cork the response here)
   */
type setHeaders = (res:uwsHttpResponse)=>uwsHttpResponse

type memoryConfig = {
  /** 
   * goes to createReadStream
   * @default 64 * 1024 // or 64 kilobytes
   */
  highWaterMark?:number
  /**
   * sendFile uses queses (arrays of chunks with size of highWaterMark) to get more speed. minQ - minimal length of queue, when readStream should resume reading file. Maximum size of queue, when readStream stops reading file = minQ * 2
   * @default 32 // if highWaterMark === 64 kilobytes, then minimal queue size === 2 megabytes. Maximal size === 4 megabytes.
   */
  minQ?:number
}
/**
 * Efficiently stream files of different sizes of different ranges (support Range http header) with backpressure handling and configurable memory usage. If error occurs before sending anything = uses res.end() method. If sent something + error = res.close()
 * @returns Error or undefined (if ok).
 * @param mainOpts just main options
 * @param specOpts additional options (for ranged requests or own headers)
 * @param memoryOpts sendFile uses queues for chunks from files. You can adjust them.
 * @compatibilityChange version 0.1.0
 */
export function sendFile(mainOpts: {
  path: string;
  /**
   * @default "application/octet-stream"
   */
  contentType?: string;
  res: HttpResponse;
  /**
   * The amount in bytes the file has (or you can afford to send for some reason). Get it from fs.stat method
   * @since 0.1.0
   */
  maxSize: number;
}, specOpts?: {
  /**
   * starting byte index of chunk to send. Goes to createReadStream
   */
  start?: number
  /**
   * ending byte index of chunk to send. Goes to createReadStream
   */
  end?:number
  headers: setHeaders,
}, memoryOpts?: memoryConfig): Promise<undefined | Error>;
/**
 * template function for sendFile.
 * @param path path to file
 * @param CT content-type
 * @example
 * server.get("/index.html", basicSendFile({path: "public/index.html", contentType: "text/html" }))
 * @compatibilityChange version 0.1.0
 */
export function basicSendFile(mainOpts: {
  path: string,
  /**
   * @default "application/octet-stream"
   */
  contentType?: string,
  /**
   * max size in bytes of the file
   * @since version 0.1.0
   */
  maxSize: number
}, specOpts?:{
  headers?: setHeaders, 
  /**
   * if there is a range request with a header like "bytes=0-" without an end, function uses maxChunk and sends only the size specified
   */
  maxChunk?:number, 
  /**
   * Whether to log the error to terminal
   */
  logs?:boolean, 
  /**
   * whether Range http header is required. Suitable for videos
   */
  requireRange?:boolean
}, memoryOpts?: memoryConfig): HttpControllerFn;
/**
 * you give it url - it returns regex, which identifies url in /* request
 */
export function urlStartsWith(str: string): RegExp;
/**
 * you put inside the Range header (like req.getHeader("range")), function parses it with a regex and gives [startIndex, endIndex] array. Currently doesn't support multiple ranges.
 */
export function getRanges(range:string, maxEndIndex: number, maxChunk: number): [number, number]