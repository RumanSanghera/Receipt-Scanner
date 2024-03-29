// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import * as http from "http";
import * as https from "https";
import * as zlib from "zlib";
import { Transform } from "stream";
import { AbortController, AbortError } from "@azure/abort-controller";
import { createHttpHeaders } from "./httpHeaders";
import { RestError } from "./restError";
import { URL } from "./util/url";
import { logger } from "./log";
function isReadableStream(body) {
    return body && typeof body.pipe === "function";
}
function isStreamComplete(stream) {
    return new Promise((resolve) => {
        stream.on("close", resolve);
        stream.on("end", resolve);
        stream.on("error", resolve);
    });
}
function isArrayBuffer(body) {
    return body && typeof body.byteLength === "number";
}
class ReportTransform extends Transform {
    constructor(progressCallback) {
        super();
        this.loadedBytes = 0;
        this.progressCallback = progressCallback;
    }
    // eslint-disable-next-line @typescript-eslint/ban-types
    _transform(chunk, _encoding, callback) {
        this.push(chunk);
        this.loadedBytes += chunk.length;
        try {
            this.progressCallback({ loadedBytes: this.loadedBytes });
            callback();
        }
        catch (e) {
            callback(e);
        }
    }
}
/**
 * A HttpClient implementation that uses Node's "https" module to send HTTPS requests.
 * @internal
 */
class NodeHttpClient {
    /**
     * Makes a request over an underlying transport layer and returns the response.
     * @param request - The request to be made.
     */
    async sendRequest(request) {
        const abortController = new AbortController();
        let abortListener;
        if (request.abortSignal) {
            if (request.abortSignal.aborted) {
                throw new AbortError("The operation was aborted.");
            }
            abortListener = (event) => {
                if (event.type === "abort") {
                    abortController.abort();
                }
            };
            request.abortSignal.addEventListener("abort", abortListener);
        }
        if (request.timeout > 0) {
            setTimeout(() => {
                abortController.abort();
            }, request.timeout);
        }
        const acceptEncoding = request.headers.get("Accept-Encoding");
        const shouldDecompress = (acceptEncoding === null || acceptEncoding === void 0 ? void 0 : acceptEncoding.includes("gzip")) || (acceptEncoding === null || acceptEncoding === void 0 ? void 0 : acceptEncoding.includes("deflate"));
        let body = request.body;
        if (body && !request.headers.has("Content-Length")) {
            const bodyLength = getBodyLength(body);
            if (bodyLength !== null) {
                request.headers.set("Content-Length", bodyLength);
            }
        }
        let responseStream;
        try {
            const result = await new Promise((resolve, reject) => {
                if (body && request.onUploadProgress) {
                    const onUploadProgress = request.onUploadProgress;
                    const uploadReportStream = new ReportTransform(onUploadProgress);
                    uploadReportStream.on("error", reject);
                    if (isReadableStream(body)) {
                        body.pipe(uploadReportStream);
                    }
                    else {
                        uploadReportStream.end(body);
                    }
                    body = uploadReportStream;
                }
                const req = this.makeRequest(request, async (res) => {
                    var _a, _b;
                    const headers = getResponseHeaders(res);
                    const status = (_a = res.statusCode) !== null && _a !== void 0 ? _a : 0;
                    const response = {
                        status,
                        headers,
                        request
                    };
                    // Responses to HEAD must not have a body.
                    // If they do return a body, that body must be ignored.
                    if (request.method === "HEAD") {
                        res.destroy();
                        resolve(response);
                        return;
                    }
                    responseStream = shouldDecompress ? getDecodedResponseStream(res, headers) : res;
                    const onDownloadProgress = request.onDownloadProgress;
                    if (onDownloadProgress) {
                        const downloadReportStream = new ReportTransform(onDownloadProgress);
                        downloadReportStream.on("error", reject);
                        responseStream.pipe(downloadReportStream);
                        responseStream = downloadReportStream;
                    }
                    if ((_b = request.streamResponseStatusCodes) === null || _b === void 0 ? void 0 : _b.has(response.status)) {
                        response.readableStreamBody = responseStream;
                    }
                    else {
                        try {
                            response.bodyAsText = await streamToText(responseStream);
                        }
                        catch (e) {
                            reject(e);
                        }
                    }
                    resolve(response);
                });
                req.on("error", (err) => {
                    reject(new RestError(err.message, { code: RestError.REQUEST_SEND_ERROR, request }));
                });
                abortController.signal.addEventListener("abort", () => {
                    req.abort();
                    reject(new AbortError("The operation was aborted."));
                });
                if (body && isReadableStream(body)) {
                    body.pipe(req);
                }
                else if (body) {
                    if (typeof body === "string" || Buffer.isBuffer(body)) {
                        req.end(body);
                    }
                    else if (isArrayBuffer(body)) {
                        req.end(ArrayBuffer.isView(body) ? Buffer.from(body.buffer) : Buffer.from(body));
                    }
                    else {
                        logger.error("Unrecognized body type", body);
                        throw new RestError("Unrecognized body type");
                    }
                }
                else {
                    // streams don't like "undefined" being passed as data
                    req.end();
                }
            });
            return result;
        }
        finally {
            // clean up event listener
            if (request.abortSignal && abortListener) {
                let uploadStreamDone = Promise.resolve();
                if (isReadableStream(body)) {
                    uploadStreamDone = isStreamComplete(body);
                }
                let downloadStreamDone = Promise.resolve();
                if (isReadableStream(responseStream)) {
                    downloadStreamDone = isStreamComplete(responseStream);
                }
                Promise.all([uploadStreamDone, downloadStreamDone])
                    .then(() => {
                    var _a;
                    (_a = request.abortSignal) === null || _a === void 0 ? void 0 : _a.removeEventListener("abort", abortListener);
                    return;
                })
                    .catch((e) => {
                    logger.warning("Error when cleaning up abortListener on httpRequest", e);
                });
            }
        }
    }
    makeRequest(request, callback) {
        var _a;
        const url = new URL(request.url);
        const isInsecure = url.protocol !== "https:";
        if (isInsecure && !request.allowInsecureConnection) {
            throw new Error(`Cannot connect to ${request.url} while allowInsecureConnection is false.`);
        }
        const agent = (_a = request.agent) !== null && _a !== void 0 ? _a : this.getOrCreateAgent(request, isInsecure);
        const options = {
            agent,
            hostname: url.hostname,
            path: `${url.pathname}${url.search}`,
            port: url.port,
            method: request.method,
            headers: request.headers.toJSON()
        };
        if (isInsecure) {
            return http.request(options, callback);
        }
        else {
            return https.request(options, callback);
        }
    }
    getOrCreateAgent(request, isInsecure) {
        if (!request.disableKeepAlive) {
            if (isInsecure) {
                if (!this.httpKeepAliveAgent) {
                    this.httpKeepAliveAgent = new http.Agent({
                        keepAlive: true
                    });
                }
                return this.httpKeepAliveAgent;
            }
            else {
                if (!this.httpsKeepAliveAgent) {
                    this.httpsKeepAliveAgent = new https.Agent({
                        keepAlive: true
                    });
                }
                return this.httpsKeepAliveAgent;
            }
        }
        else if (isInsecure) {
            return http.globalAgent;
        }
        else {
            return https.globalAgent;
        }
    }
}
function getResponseHeaders(res) {
    const headers = createHttpHeaders();
    for (const header of Object.keys(res.headers)) {
        const value = res.headers[header];
        if (Array.isArray(value)) {
            if (value.length > 0) {
                headers.set(header, value[0]);
            }
        }
        else if (value) {
            headers.set(header, value);
        }
    }
    return headers;
}
function getDecodedResponseStream(stream, headers) {
    const contentEncoding = headers.get("Content-Encoding");
    if (contentEncoding === "gzip") {
        const unzip = zlib.createGunzip();
        stream.pipe(unzip);
        return unzip;
    }
    else if (contentEncoding === "deflate") {
        const inflate = zlib.createInflate();
        stream.pipe(inflate);
        return inflate;
    }
    return stream;
}
function streamToText(stream) {
    return new Promise((resolve, reject) => {
        const buffer = [];
        stream.on("data", (chunk) => {
            if (Buffer.isBuffer(chunk)) {
                buffer.push(chunk);
            }
            else {
                buffer.push(Buffer.from(chunk));
            }
        });
        stream.on("end", () => {
            resolve(Buffer.concat(buffer).toString("utf8"));
        });
        stream.on("error", (e) => {
            reject(new RestError(`Error reading response as text: ${e.message}`, {
                code: RestError.PARSE_ERROR
            }));
        });
    });
}
/** @internal */
export function getBodyLength(body) {
    if (!body) {
        return 0;
    }
    else if (Buffer.isBuffer(body)) {
        return body.length;
    }
    else if (isReadableStream(body)) {
        return null;
    }
    else if (isArrayBuffer(body)) {
        return body.byteLength;
    }
    else if (typeof body === "string") {
        return Buffer.from(body).length;
    }
    else {
        return null;
    }
}
/**
 * Create a new HttpClient instance for the NodeJS environment.
 * @internal
 */
export function createNodeHttpClient() {
    return new NodeHttpClient();
}
//# sourceMappingURL=nodeHttpClient.js.map