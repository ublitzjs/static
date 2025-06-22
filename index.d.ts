import type {
  HeadersMap,
  HttpControllerFn,
  HttpResponse,
} from "@ublitzjs/core";
/**
 * Efficiently send file of large size with max of 4mb of memory buffered and backpressure handling.
 * Automatically closes the response if an error occurs.
 * @returns Error or undefined (if ok).
 */
export function sendFile(opts: {
  path: string;
  contentType: string;
  res: HttpResponse & {
    done?: boolean;
    unsentChunk?: ArrayBuffer;
    lastOffset?: number;
    error?: undefined | Error;
  };
  /**
   * The amount in bytes you want to send.
   */
  totalSize: number;
}): Promise<undefined | Error>;
type fileData<full extends boolean> = {
  CT: string;
  size: number;
} & full extends true
  ? Record<"atime" | "ctime" | "mtime" | "birthtime", string>
  : {};
/**
 * recursively analyses folder for all files.
 * @param dirPath has same constraints, as "fullRoute" for staticServe
 * @example
 * analyzeFolder("src", { deleteMimesList: true, avoid: /(.env)|(.*\.map)/)
 * @returns paths to files (without first slash), their mime types and size in bytes (and if specified 'includeDates' - also time of file modification and more)
 * @example
 * {"src/index.html": { CT: "text/html", size: 100}, "src/main.js": {CT:"text/javascript", size: 467 } }
 */
export function analyzeFolder(
  dirPath: string,
  opts: {
    deleteMimesList: boolean;
    avoid?: RegExp;
    /**
     * whether include 'atime, mtime, ctime, birthtime' of file system stats
     */
    includeDates?: boolean;
  }
): Promise<
  Record<string, fileData<typeof opts.includeDates extends true ? true : false>>
>;
/**
 * This function analyses folder, gets all essential metadata, and is suitable for cases, when no files are added or deleted in the directory.
 * @param fullRoute full route containing all prefixes. It:
 * 1) starts with slash ("/yourPrefix/route");
 * 2) doesn't end with slash. If it is a "/" route, put empty string ("", but not "/route/");
 * 3) doesn't contain params or wildcards (not "/:id" or "/*")
 * @param dirPath path, used for file system:
 * 1) doesn't start from and slash or dot ("src" but not "./src")
 * @param paths get them from analyzeFolder
 * @param headers function which sets headers (like return of HeadersMap.prepare() )
 */
export function staticServe(opts: {
  fullRoute: string;
  dirPath: string;
  logs?: boolean;
  paths: Record<string, fileData<boolean>>;
  headers?: ReturnType<HeadersMap<any>["prepare"]>;
}): Record<"get" | "head" | "any", HttpControllerFn>;
/**
 * This function serves same purpose and almost same params as staticServeStatic, but collects data about files in runtime using file system. Is suitable when files are constantly added or removed from the folder.
 */
export function dynamicServe(
  routeRegex: RegExp,
  dir: string,
  conf?: {
    logs?: boolean;
    avoid?: RegExp;
    headers?: ReturnType<HeadersMap<any>["prepare"]>;
  }
): Record<"get" | "head" | "any", HttpControllerFn>;

/**
 * template function for sendFile. Very plain, not adjustable.
 * @param path path to file
 * @param CT content-type
 * @example
 * server.get("/index.html", basicSendFile("public/index.html", "text/html"))
 */
export function basicSendFile(
  path: string,
  CT: string,
  /**
   * Whether to log the error to terminal
   */
  logs?: boolean
): HttpControllerFn;
/**
 * you give it url - it returns regex, which identifies url in /* request
 */
export function urlStartsWith(str: string): RegExp;
/**
 * It lets you serve multiple folders over one server.get or server.head call
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
  headers: new HeadersMap({ Allow: "GET, HEAD" }).prepare()
);
 */
export function staticServeMulti(params: {
  folders: {
    regex: RegExp;
    paths: Record<string, fileData<boolean>>;
    dir: string;
  }[];
  logs?: boolean;
  fallback?: { dir: string; paths: Record<string, fileData<boolean>> };
  headers?: (res: HttpResponse) => HttpResponse;
}): Record<"get" | "head" | "any", HttpControllerFn>;
