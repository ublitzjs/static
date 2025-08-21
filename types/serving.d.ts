import { HttpControllerFn } from "@ublitzjs/core";
import type { HttpResponse as uwsHttpResponse } from "uWebSockets.js";
type fileData<full extends boolean> = {
  CT: string;
  size: number;
} & (
  full extends true
  ? {
    "atime": string;
    "ctime" :string;
    "mtime":string;
    "birthtime":string;
  }
  : {});
/**
 * recursively analyses folder for all files.
 * @param dirPath has same constraints, as "fullRoute" for staticServe
 * @example
 * analyzeFolder("src", { deleteMimesList: true, avoid: /(.env)|(.*\.map)/)
 * @returns paths to files (without first slash), their mime types and size in bytes (and if specified 'includeDates' - also time of file modification and more)
 * @example
 * {"src/index.html": { CT: "text/html", size: 100}, "src/main.js": {CT:"text/javascript", size: 467 } }
 */
export function analyzeFolder<full extends boolean | undefined>(
  dirPath: string,
  opts: {
    deleteMimesList: boolean;
    avoid?: RegExp;
    /**
     * whether include 'atime, mtime, ctime, birthtime' of file system stats
     */
    includeDates?: full;
  }
): Promise<
  Record<string, fileData<full extends true ? true : false>>
>;
/**
 * This function analyses folder, gets all essential metadata, and is suitable for cases, when no files are added or deleted in the directory.
 * @param mainOpts just main options
 * @param opts just additional options
 * @compatibilityChange version 0.1.0
 */
export function staticServe(
  mainOpts: {
  /**
   * full route containing all prefixes. It:
   * 1) starts with slash ("/yourPrefix/route");
   * 2) doesn't end with slash. If it is a "/" route, put empty string ("", but not "/route/");
   * 3) doesn't contain params or wildcards (not "/:id" or "/*")
   */
  fullRoute: string;
  /**
   * path, used for file system:
   * 1) doesn't start from and slash or dot ("src", but not "./src")
   */
  dirPath: string;
  /**
   * get them from analyzeFolder
   */
  paths: Record<string, fileData<boolean>>;
  },opts?:{
  /**
   * whether to log errors to console or not
   * @default false
   */
  logs?: boolean;
  /**
   * function which sets headers (like return of HeadersMap.prepare() )
   */
  headers?: setHeaders
  /**
   * for range requests when you get "Range: bytes=0-" without end byte specified, maxChunk is used to send ONLY the size you wish
   * @since version 0.1.0
   * @default Infinity // as much as possible
   */
  maxChunk?: number
  /**
   * Whether Http Range header is required
   */
  requireRange?: boolean
}): Record<"get" | "head" | "any", HttpControllerFn>;
/**
 * This function serves same purpose and almost same params as staticServeStatic, but collects data about files in runtime using file system. Is suitable when files are constantly added or removed from the folder.
 * @compatibilityChange version 0.1.0
 */
export function dynamicServe(
  /**
   * get it from "urlStartsWith" function
   **/
  routeRegex: RegExp,
  /**
   * path to directory
   */
  dir: string,
  conf?: {
    /**
     * Regexp of those files / folders to avoid
     */
  avoid?: RegExp;
  /**
   * whether to log errors to console or not
   * @default false
   */
  logs?: boolean;
  /**
   * function which sets headers (like return of HeadersMap.prepare() )
   */
  headers?: setHeaders
  /**
   * for range requests when you get "Range: bytes=0-" without end byte specified, maxChunk is used to send ONLY the size you wish
   * @since version 0.1.0
   * @default Infinity // as much as possible
   */
  maxChunk?: number
  /**
   * Whether Http Range header is required
   */
  requireRange?: boolean
  }
): Record<"get" | "head" | "any", HttpControllerFn>;

/**
 * It lets you serve multiple folders over one server.get or server.head call
 * @compatibilityChange version 0.1.0
 * @example
 *staticServeMulti({ folders: [
    {
      dir: "public",
      paths: await analyzeFolder("public", false, /.git/),
      regex: urlStartsWith("/VERY-PUBLIC"),
    },
    {
      dir: "meta",
      paths: await analyzeFolder("meta", false),
      regex: urlStartsWith("/meta"),
    },
],
  // fallback with no special url. just http://localhost:9001/index.html (like this)
  fallback: { paths: await analyzeFolder("static", true), dir: "static" },
  {headers: new HeadersMap({ Allow: "GET, HEAD" }).prepare()}
);
 */
export function staticServeMulti(params: {
  folders: {
    /**
     * get from "urlStartsWith"
     */
    regex: RegExp;
    /**
     * get them from "analyzeFolder"
     */
    paths: Record<string, fileData<boolean>>;
    dir: string;
  }[];
  fallback?: { dir: string; paths: Record<string, fileData<boolean>> };
},
/**
 * @since version 0.1.0
 */
opts?:{
  /**
   * whether to log errors to console or not
   * @default false
   */
  logs?: boolean;
  /**
   * function which sets headers (like return of HeadersMap.prepare() )
   */
  headers?: setHeaders
  /**
   * for range requests when you get "Range: bytes=0-" without end byte specified, maxChunk is used to send ONLY the size you wish
   * @since version 0.1.0
   * @default Infinity // as much as possible
   */
  maxChunk?: number
  /**
   * Whether Http Range header is required
   */
  requireRange?: boolean 
}): Record<"get" | "head" | "any", HttpControllerFn>;
type setHeaders = (res: uwsHttpResponse) => uwsHttpResponse;
