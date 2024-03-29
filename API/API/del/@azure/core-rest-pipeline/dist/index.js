'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var logger$1 = require('@azure/logger');
var url = require('url');
var os = require('os');
var util = require('util');
var coreTracing = require('@azure/core-tracing');
var httpsProxyAgent$1 = require('https-proxy-agent');
var httpProxyAgent$1 = require('http-proxy-agent');
var FormData = _interopDefault(require('form-data'));
var http = require('http');
var https = require('https');
var zlib = require('zlib');
var stream = require('stream');
var abortController = require('@azure/abort-controller');
var uuid = require('uuid');

// Copyright (c) Microsoft Corporation.
const logger = logger$1.createClientLogger("core-rest-pipeline");

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
var _a;
/**
 * A constant that indicates whether the environment the code is running is Node.JS.
 * @internal
 */
const isNode = typeof process !== "undefined" && Boolean(process.version) && Boolean((_a = process.versions) === null || _a === void 0 ? void 0 : _a.node);
/**
 * A wrapper for setTimeout that resolves a promise after t milliseconds.
 * @internal
 * @param t - The number of milliseconds to be delayed.
 * @param value - The value to be resolved with after a timeout of t milliseconds.
 * @returns Resolved promise
 */
function delay(t, value) {
    return new Promise((resolve) => setTimeout(() => resolve(value), t));
}
/**
 * Returns a random integer value between a lower and upper bound,
 * inclusive of both bounds.
 * Note that this uses Math.random and isn't secure. If you need to use
 * this for any kind of security purpose, find a better source of random.
 * @param min - The smallest integer value allowed.
 * @param max - The largest integer value allowed.
 * @internal
 */
function getRandomIntegerInclusive(min, max) {
    // Make sure inputs are integers.
    min = Math.ceil(min);
    max = Math.floor(max);
    // Pick a random offset from zero to the size of the range.
    // Since Math.random() can never return 1, we have to make the range one larger
    // in order to be inclusive of the maximum value after we take the floor.
    const offset = Math.floor(Math.random() * (max - min + 1));
    return offset + min;
}
/**
 * @internal
 * @returns true when input is an object type that is not null, Array, RegExp, or Date.
 */
function isObject(input) {
    return (typeof input === "object" &&
        input !== null &&
        !Array.isArray(input) &&
        !(input instanceof RegExp) &&
        !(input instanceof Date));
}

// Copyright (c) Microsoft Corporation.
const RedactedString = "REDACTED";
const defaultAllowedHeaderNames = [
    "x-ms-client-request-id",
    "x-ms-return-client-request-id",
    "x-ms-useragent",
    "x-ms-correlation-request-id",
    "x-ms-request-id",
    "client-request-id",
    "ms-cv",
    "return-client-request-id",
    "traceparent",
    "Access-Control-Allow-Credentials",
    "Access-Control-Allow-Headers",
    "Access-Control-Allow-Methods",
    "Access-Control-Allow-Origin",
    "Access-Control-Expose-Headers",
    "Access-Control-Max-Age",
    "Access-Control-Request-Headers",
    "Access-Control-Request-Method",
    "Origin",
    "Accept",
    "Accept-Encoding",
    "Cache-Control",
    "Connection",
    "Content-Length",
    "Content-Type",
    "Date",
    "ETag",
    "Expires",
    "If-Match",
    "If-Modified-Since",
    "If-None-Match",
    "If-Unmodified-Since",
    "Last-Modified",
    "Pragma",
    "Request-Id",
    "Retry-After",
    "Server",
    "Transfer-Encoding",
    "User-Agent"
];
const defaultAllowedQueryParameters = ["api-version"];
/**
 * @internal
 */
class Sanitizer {
    constructor({ additionalAllowedHeaderNames: allowedHeaderNames = [], additionalAllowedQueryParameters: allowedQueryParameters = [] } = {}) {
        allowedHeaderNames = defaultAllowedHeaderNames.concat(allowedHeaderNames);
        allowedQueryParameters = defaultAllowedQueryParameters.concat(allowedQueryParameters);
        this.allowedHeaderNames = new Set(allowedHeaderNames.map((n) => n.toLowerCase()));
        this.allowedQueryParameters = new Set(allowedQueryParameters.map((p) => p.toLowerCase()));
    }
    sanitize(obj) {
        const seen = new Set();
        return JSON.stringify(obj, (key, value) => {
            // Ensure Errors include their interesting non-enumerable members
            if (value instanceof Error) {
                return Object.assign(Object.assign({}, value), { name: value.name, message: value.message });
            }
            if (key === "headers") {
                return this.sanitizeHeaders(value);
            }
            else if (key === "url") {
                return this.sanitizeUrl(value);
            }
            else if (key === "query") {
                return this.sanitizeQuery(value);
            }
            else if (key === "body") {
                // Don't log the request body
                return undefined;
            }
            else if (key === "response") {
                // Don't log response again
                return undefined;
            }
            else if (key === "operationSpec") {
                // When using sendOperationRequest, the request carries a massive
                // field with the autorest spec. No need to log it.
                return undefined;
            }
            else if (Array.isArray(value) || isObject(value)) {
                if (seen.has(value)) {
                    return "[Circular]";
                }
                seen.add(value);
            }
            return value;
        }, 2);
    }
    sanitizeHeaders(obj) {
        const sanitized = {};
        for (const key of Object.keys(obj)) {
            if (this.allowedHeaderNames.has(key.toLowerCase())) {
                sanitized[key] = obj[key];
            }
            else {
                sanitized[key] = RedactedString;
            }
        }
        return sanitized;
    }
    sanitizeQuery(value) {
        if (typeof value !== "object" || value === null) {
            return value;
        }
        const sanitized = {};
        for (const k of Object.keys(value)) {
            if (this.allowedQueryParameters.has(k.toLowerCase())) {
                sanitized[k] = value[k];
            }
            else {
                sanitized[k] = RedactedString;
            }
        }
        return sanitized;
    }
    sanitizeUrl(value) {
        if (typeof value !== "string" || value === null) {
            return value;
        }
        const url$1 = new url.URL(value);
        if (!url$1.search) {
            return value;
        }
        for (const [key] of url$1.searchParams) {
            if (!this.allowedQueryParameters.has(key.toLowerCase())) {
                url$1.searchParams.set(key, RedactedString);
            }
        }
        return url$1.toString();
    }
}

// Copyright (c) Microsoft Corporation.
/**
 * The programmatic identifier of the logPolicy.
 */
const logPolicyName = "logPolicy";
/**
 * A policy that logs all requests and responses.
 * @param options - Options to configure logPolicy.
 */
function logPolicy(options = {}) {
    var _a;
    const logger$1 = (_a = options.logger) !== null && _a !== void 0 ? _a : logger.info;
    const sanitizer = new Sanitizer({
        additionalAllowedHeaderNames: options.additionalAllowedHeaderNames,
        additionalAllowedQueryParameters: options.additionalAllowedQueryParameters
    });
    return {
        name: logPolicyName,
        async sendRequest(request, next) {
            if (!logger$1.enabled) {
                return next(request);
            }
            logger$1(`Request: ${sanitizer.sanitize(request)}`);
            const response = await next(request);
            logger$1(`Response status code: ${response.status}`);
            logger$1(`Headers: ${sanitizer.sanitize(response.headers)}`);
            return response;
        }
    };
}

// Copyright (c) Microsoft Corporation.
/**
 * @internal
 */
function getHeaderName() {
    return "User-Agent";
}
/**
 * @internal
 */
function setPlatformSpecificData(map) {
    map.set("Node", process.version);
    map.set("OS", `(${os.arch()}-${os.type()}-${os.release()})`);
}

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
const SDK_VERSION = "1.1.1";

// Copyright (c) Microsoft Corporation.
function getUserAgentString(telemetryInfo) {
    const parts = [];
    for (const [key, value] of telemetryInfo) {
        const token = value ? `${key}/${value}` : key;
        parts.push(token);
    }
    return parts.join(" ");
}
/**
 * @internal
 */
function getUserAgentHeaderName() {
    return getHeaderName();
}
/**
 * @internal
 */
function getUserAgentValue(prefix) {
    const runtimeInfo = new Map();
    runtimeInfo.set("core-rest-pipeline", SDK_VERSION);
    setPlatformSpecificData(runtimeInfo);
    const defaultAgent = getUserAgentString(runtimeInfo);
    const userAgentValue = prefix ? `${prefix} ${defaultAgent}` : defaultAgent;
    return userAgentValue;
}

// Copyright (c) Microsoft Corporation.
const UserAgentHeaderName = getUserAgentHeaderName();
/**
 * The programmatic identifier of the userAgentPolicy.
 */
const userAgentPolicyName = "userAgentPolicy";
/**
 * A policy that sets the User-Agent header (or equivalent) to reflect
 * the library version.
 * @param options - Options to customize the user agent value.
 */
function userAgentPolicy(options = {}) {
    const userAgentValue = getUserAgentValue(options.userAgentPrefix);
    return {
        name: userAgentPolicyName,
        async sendRequest(request, next) {
            if (!request.headers.has(UserAgentHeaderName)) {
                request.headers.set(UserAgentHeaderName, userAgentValue);
            }
            return next(request);
        }
    };
}

// Copyright (c) Microsoft Corporation.
/**
 * The programmatic identifier of the redirectPolicy.
 */
const redirectPolicyName = "redirectPolicy";
/**
 * Methods that are allowed to follow redirects 301 and 302
 */
const allowedRedirect = ["GET", "HEAD"];
/**
 * A policy to follow Location headers from the server in order
 * to support server-side redirection.
 * @param options - Options to control policy behavior.
 */
function redirectPolicy(options = {}) {
    const { maxRetries = 20 } = options;
    return {
        name: redirectPolicyName,
        async sendRequest(request, next) {
            const response = await next(request);
            return handleRedirect(next, response, maxRetries);
        }
    };
}
async function handleRedirect(next, response, maxRetries, currentRetries = 0) {
    const { request, status, headers } = response;
    const locationHeader = headers.get("location");
    if (locationHeader &&
        (status === 300 ||
            (status === 301 && allowedRedirect.includes(request.method)) ||
            (status === 302 && allowedRedirect.includes(request.method)) ||
            (status === 303 && request.method === "POST") ||
            status === 307) &&
        currentRetries < maxRetries) {
        const url$1 = new url.URL(locationHeader, request.url);
        request.url = url$1.toString();
        // POST request with Status code 303 should be converted into a
        // redirected GET request if the redirect url is present in the location header
        if (status === 303) {
            request.method = "GET";
            request.headers.delete("Content-Length");
            delete request.body;
        }
        const res = await next(request);
        return handleRedirect(next, res, maxRetries, currentRetries + 1);
    }
    return response;
}

// Copyright (c) Microsoft Corporation.
const custom = util.inspect.custom;

// Copyright (c) Microsoft Corporation.
const errorSanitizer = new Sanitizer();
/**
 * A custom error type for failed pipeline requests.
 */
class RestError extends Error {
    constructor(message, options = {}) {
        super(message);
        this.name = "RestError";
        this.code = options.code;
        this.statusCode = options.statusCode;
        this.request = options.request;
        this.response = options.response;
        Object.setPrototypeOf(this, RestError.prototype);
    }
    /**
     * Logging method for util.inspect in Node
     */
    [custom]() {
        return `RestError: ${this.message} \n ${errorSanitizer.sanitize(this)}`;
    }
}
/**
 * Something went wrong when making the request.
 * This means the actual request failed for some reason,
 * such as a DNS issue or the connection being lost.
 */
RestError.REQUEST_SEND_ERROR = "REQUEST_SEND_ERROR";
/**
 * This means that parsing the response from the server failed.
 * It may have been malformed.
 */
RestError.PARSE_ERROR = "PARSE_ERROR";

// Copyright (c) Microsoft Corporation.
/**
 * The programmatic identifier of the exponentialRetryPolicy.
 */
const exponentialRetryPolicyName = "exponentialRetryPolicy";
const DEFAULT_CLIENT_RETRY_COUNT = 10;
// intervals are in ms
const DEFAULT_CLIENT_RETRY_INTERVAL = 1000;
const DEFAULT_CLIENT_MAX_RETRY_INTERVAL = 1000 * 64;
/**
 * A policy that attempts to retry requests while introducing an exponentially increasing delay.
 * @param options - Options that configure retry logic.
 */
function exponentialRetryPolicy(options = {}) {
    var _a, _b, _c;
    const retryCount = (_a = options.maxRetries) !== null && _a !== void 0 ? _a : DEFAULT_CLIENT_RETRY_COUNT;
    const retryInterval = (_b = options.retryDelayInMs) !== null && _b !== void 0 ? _b : DEFAULT_CLIENT_RETRY_INTERVAL;
    const maxRetryInterval = (_c = options.maxRetryDelayInMs) !== null && _c !== void 0 ? _c : DEFAULT_CLIENT_MAX_RETRY_INTERVAL;
    /**
     * Determines if the operation should be retried and how long to wait until the next retry.
     *
     * @param statusCode - The HTTP status code.
     * @param retryData -  The retry data.
     * @returns True if the operation qualifies for a retry; false otherwise.
     */
    function shouldRetry(response, retryData) {
        const statusCode = response === null || response === void 0 ? void 0 : response.status;
        if (statusCode === 503 && (response === null || response === void 0 ? void 0 : response.headers.get("Retry-After"))) {
            return false;
        }
        if (statusCode === undefined ||
            (statusCode < 500 && statusCode !== 408) ||
            statusCode === 501 ||
            statusCode === 505) {
            return false;
        }
        const currentCount = retryData && retryData.retryCount;
        return currentCount < retryCount;
    }
    /**
     * Updates the retry data for the next attempt.
     *
     * @param retryData -  The retry data.
     * @param err - The operation's error, if any.
     */
    function updateRetryData(retryData, err) {
        if (err) {
            if (retryData.error) {
                err.innerError = retryData.error;
            }
            retryData.error = err;
        }
        // Adjust retry count
        retryData.retryCount++;
        // Exponentially increase the delay each time
        const exponentialDelay = retryInterval * Math.pow(2, retryData.retryCount);
        // Don't let the delay exceed the maximum
        const clampedExponentialDelay = Math.min(maxRetryInterval, exponentialDelay);
        // Allow the final value to have some "jitter" (within 50% of the delay size) so
        // that retries across multiple clients don't occur simultaneously.
        const delayWithJitter = clampedExponentialDelay / 2 + getRandomIntegerInclusive(0, clampedExponentialDelay / 2);
        retryData.retryInterval = delayWithJitter;
        return retryData;
    }
    async function retry(next, retryData, request, response, requestError) {
        var _a;
        retryData = updateRetryData(retryData, requestError);
        const isAborted = (_a = request.abortSignal) === null || _a === void 0 ? void 0 : _a.aborted;
        if (!isAborted && shouldRetry(response, retryData)) {
            logger.info(`Retrying request in ${retryData.retryInterval}`);
            try {
                await delay(retryData.retryInterval);
                const res = await next(request);
                return retry(next, retryData, request, res);
            }
            catch (e) {
                return retry(next, retryData, request, response, e);
            }
        }
        else if (isAborted || requestError || !response) {
            // If the operation failed in the end, return all errors instead of just the last one
            const err = retryData.error ||
                new RestError("Failed to send the request.", {
                    code: RestError.REQUEST_SEND_ERROR,
                    statusCode: response === null || response === void 0 ? void 0 : response.status,
                    request: response === null || response === void 0 ? void 0 : response.request,
                    response
                });
            throw err;
        }
        else {
            return response;
        }
    }
    return {
        name: exponentialRetryPolicyName,
        async sendRequest(request, next) {
            const retryData = {
                retryCount: 0,
                retryInterval: 0
            };
            try {
                const response = await next(request);
                return retry(next, retryData, request, response);
            }
            catch (e) {
                const error = e;
                return retry(next, retryData, request, error.response, error);
            }
        }
    };
}

// Copyright (c) Microsoft Corporation.
const createSpan = coreTracing.createSpanFunction({
    packagePrefix: "",
    namespace: ""
});
/**
 * The programmatic identifier of the tracingPolicy.
 */
const tracingPolicyName = "tracingPolicy";
/**
 * A simple policy to create OpenTelemetry Spans for each request made by the pipeline
 * that has SpanOptions with a parent.
 * Requests made without a parent Span will not be recorded.
 * @param options - Options to configure the telemetry logged by the tracing policy.
 */
function tracingPolicy(options = {}) {
    const userAgent = getUserAgentValue(options.userAgentPrefix);
    return {
        name: tracingPolicyName,
        async sendRequest(request, next) {
            var _a;
            if (!((_a = request.tracingOptions) === null || _a === void 0 ? void 0 : _a.tracingContext)) {
                return next(request);
            }
            // create a new span
            const tracingOptions = Object.assign(Object.assign({}, request.tracingOptions), { spanOptions: Object.assign(Object.assign({}, request.tracingOptions.spanOptions), { kind: coreTracing.SpanKind.CLIENT }) });
            const url$1 = new url.URL(request.url);
            const path = url$1.pathname || "/";
            const { span } = createSpan(path, { tracingOptions });
            span.setAttributes({
                "http.method": request.method,
                "http.url": request.url,
                requestId: request.requestId
            });
            if (userAgent) {
                span.setAttribute("http.user_agent", userAgent);
            }
            try {
                // set headers
                const spanContext = span.spanContext();
                const traceParentHeader = coreTracing.getTraceParentHeader(spanContext);
                if (traceParentHeader) {
                    request.headers.set("traceparent", traceParentHeader);
                    const traceState = spanContext.traceState && spanContext.traceState.serialize();
                    // if tracestate is set, traceparent MUST be set, so only set tracestate after traceparent
                    if (traceState) {
                        request.headers.set("tracestate", traceState);
                    }
                }
                const response = await next(request);
                span.setAttribute("http.status_code", response.status);
                const serviceRequestId = response.headers.get("x-ms-request-id");
                if (serviceRequestId) {
                    span.setAttribute("serviceRequestId", serviceRequestId);
                }
                span.setStatus({
                    code: coreTracing.SpanStatusCode.OK
                });
                return response;
            }
            catch (err) {
                span.setStatus({
                    code: coreTracing.SpanStatusCode.ERROR,
                    message: err.message
                });
                span.setAttribute("http.status_code", err.statusCode);
                throw err;
            }
            finally {
                span.end();
            }
        }
    };
}

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
/**
 * The programmatic identifier of the setClientRequestIdPolicy.
 */
const setClientRequestIdPolicyName = "setClientRequestIdPolicy";
/**
 * Each PipelineRequest gets a unique id upon creation.
 * This policy passes that unique id along via an HTTP header to enable better
 * telemetry and tracing.
 * @param requestIdHeaderName - The name of the header to pass the request ID to.
 */
function setClientRequestIdPolicy(requestIdHeaderName = "x-ms-client-request-id") {
    return {
        name: setClientRequestIdPolicyName,
        async sendRequest(request, next) {
            if (!request.headers.has(requestIdHeaderName)) {
                request.headers.set(requestIdHeaderName, request.requestId);
            }
            return next(request);
        }
    };
}

// Copyright (c) Microsoft Corporation.
/**
 * The programmatic identifier of the throttlingRetryPolicy.
 */
const throttlingRetryPolicyName = "throttlingRetryPolicy";
/**
 * Maximum number of retries for the throttling retry policy
 */
const DEFAULT_CLIENT_MAX_RETRY_COUNT = 3;
/**
 * A policy that retries when the server sends a 429 response with a Retry-After header.
 *
 * To learn more, please refer to
 * https://docs.microsoft.com/en-us/azure/azure-resource-manager/resource-manager-request-limits,
 * https://docs.microsoft.com/en-us/azure/azure-subscription-service-limits and
 * https://docs.microsoft.com/en-us/azure/virtual-machines/troubleshooting/troubleshooting-throttling-errors
 */
function throttlingRetryPolicy() {
    return {
        name: throttlingRetryPolicyName,
        async sendRequest(request, next) {
            let response = await next(request);
            for (let count = 0; count < DEFAULT_CLIENT_MAX_RETRY_COUNT; count++) {
                if (response.status !== 429 && response.status !== 503) {
                    return response;
                }
                const retryAfterHeader = response.headers.get("Retry-After");
                if (!retryAfterHeader) {
                    break;
                }
                const delayInMs = parseRetryAfterHeader(retryAfterHeader);
                if (!delayInMs) {
                    break;
                }
                await delay(delayInMs);
                response = await next(request);
            }
            return response;
        }
    };
}
/**
 * Returns the number of milliseconds to wait based on a Retry-After header value.
 * Returns undefined if there is no valid value.
 * @param headerValue - An HTTP Retry-After header value.
 */
function parseRetryAfterHeader(headerValue) {
    try {
        const retryAfterInSeconds = Number(headerValue);
        if (!Number.isNaN(retryAfterInSeconds)) {
            return retryAfterInSeconds * 1000;
        }
        else {
            // It might be formatted as a date instead of a number of seconds
            const now = Date.now();
            const date = Date.parse(headerValue);
            const diff = date - now;
            return Number.isNaN(diff) ? undefined : diff;
        }
    }
    catch (e) {
        return undefined;
    }
}

// Copyright (c) Microsoft Corporation.
const DEFAULT_CLIENT_RETRY_COUNT$1 = 10;
// intervals are in ms
const DEFAULT_CLIENT_RETRY_INTERVAL$1 = 1000;
const DEFAULT_CLIENT_MAX_RETRY_INTERVAL$1 = 1000 * 64;
/**
 * The programmatic identifier of the systemErrorRetryPolicy.
 */
const systemErrorRetryPolicyName = "systemErrorRetryPolicy";
/**
 * A retry policy that specifically seeks to handle errors in the
 * underlying transport layer (e.g. DNS lookup failures) rather than
 * retryable error codes from the server itself.
 * @param options - Options that customize the policy.
 */
function systemErrorRetryPolicy(options = {}) {
    var _a, _b, _c;
    const retryCount = (_a = options.maxRetries) !== null && _a !== void 0 ? _a : DEFAULT_CLIENT_RETRY_COUNT$1;
    const retryInterval = (_b = options.retryDelayInMs) !== null && _b !== void 0 ? _b : DEFAULT_CLIENT_RETRY_INTERVAL$1;
    const maxRetryInterval = (_c = options.maxRetryDelayInMs) !== null && _c !== void 0 ? _c : DEFAULT_CLIENT_MAX_RETRY_INTERVAL$1;
    function shouldRetry(retryData, err) {
        if (!isSystemError(err)) {
            return false;
        }
        const currentCount = retryData.retryCount;
        return currentCount <= retryCount;
    }
    function updateRetryData(retryData, err) {
        if (err) {
            if (retryData.error) {
                err.innerError = retryData.error;
            }
            retryData.error = err;
        }
        // Adjust retry count
        retryData.retryCount++;
        // Exponentially increase the delay each time
        const exponentialDelay = retryInterval * Math.pow(2, retryData.retryCount);
        // Don't let the delay exceed the maximum
        const clampedExponentialDelay = Math.min(maxRetryInterval, exponentialDelay);
        // Allow the final value to have some "jitter" (within 50% of the delay size) so
        // that retries across multiple clients don't occur simultaneously.
        const delayWithJitter = clampedExponentialDelay / 2 + getRandomIntegerInclusive(0, clampedExponentialDelay / 2);
        retryData.retryInterval = delayWithJitter;
        return retryData;
    }
    async function retry(next, retryData, request, response, requestError) {
        retryData = updateRetryData(retryData, requestError);
        if (shouldRetry(retryData, requestError)) {
            try {
                logger.info(`Retrying request in ${retryData.retryInterval}`);
                await delay(retryData.retryInterval);
                const res = await next(request);
                return retry(next, retryData, request, res);
            }
            catch (e) {
                return retry(next, retryData, request, response, e);
            }
        }
        else if (requestError || !response) {
            // If the operation failed in the end, return all errors instead of just the last one
            const err = retryData.error ||
                new RestError("Failed to send the request.", {
                    code: RestError.REQUEST_SEND_ERROR,
                    statusCode: response === null || response === void 0 ? void 0 : response.status,
                    request: response === null || response === void 0 ? void 0 : response.request,
                    response
                });
            throw err;
        }
        else {
            return response;
        }
    }
    return {
        name: systemErrorRetryPolicyName,
        async sendRequest(request, next) {
            const retryData = {
                retryCount: 0,
                retryInterval: 0
            };
            try {
                const response = await next(request);
                return retry(next, retryData, request, response);
            }
            catch (e) {
                const error = e;
                return retry(next, retryData, request, error.response, error);
            }
        }
    };
}
function isSystemError(err) {
    if (!err) {
        return false;
    }
    return (err.code === "ETIMEDOUT" ||
        err.code === "ESOCKETTIMEDOUT" ||
        err.code === "ECONNREFUSED" ||
        err.code === "ECONNRESET" ||
        err.code === "ENOENT");
}

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
/**
 * The programmatic identifier of the decompressResponsePolicy.
 */
const decompressResponsePolicyName = "decompressResponsePolicy";
/**
 * A policy to enable response decompression according to Accept-Encoding header
 * https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Accept-Encoding
 */
function decompressResponsePolicy() {
    return {
        name: decompressResponsePolicyName,
        async sendRequest(request, next) {
            // HEAD requests have no body
            if (request.method !== "HEAD") {
                request.headers.set("Accept-Encoding", "gzip,deflate");
            }
            return next(request);
        }
    };
}

// Copyright (c) Microsoft Corporation.
const HTTPS_PROXY = "HTTPS_PROXY";
const HTTP_PROXY = "HTTP_PROXY";
const ALL_PROXY = "ALL_PROXY";
const NO_PROXY = "NO_PROXY";
/**
 * The programmatic identifier of the proxyPolicy.
 */
const proxyPolicyName = "proxyPolicy";
const noProxyList = [];
let noProxyListLoaded = false;
const byPassedList = new Map();
let httpsProxyAgent;
let httpProxyAgent;
function getEnvironmentValue(name) {
    if (process.env[name]) {
        return process.env[name];
    }
    else if (process.env[name.toLowerCase()]) {
        return process.env[name.toLowerCase()];
    }
    return undefined;
}
function loadEnvironmentProxyValue() {
    if (!process) {
        return undefined;
    }
    const httpsProxy = getEnvironmentValue(HTTPS_PROXY);
    const allProxy = getEnvironmentValue(ALL_PROXY);
    const httpProxy = getEnvironmentValue(HTTP_PROXY);
    return httpsProxy || allProxy || httpProxy;
}
// Check whether the host of a given `uri` is in the noProxyList.
// If there's a match, any request sent to the same host won't have the proxy settings set.
function isBypassed(uri) {
    if (noProxyList.length === 0) {
        return false;
    }
    const host = new url.URL(uri).hostname;
    if (byPassedList.has(host)) {
        return byPassedList.get(host);
    }
    let isBypassedFlag = false;
    for (const pattern of noProxyList) {
        if (pattern[0] === ".") {
            // This should match either domain it self or any subdomain or host
            // .foo.com will match foo.com it self or *.foo.com
            if (host.endsWith(pattern)) {
                isBypassedFlag = true;
            }
            else {
                if (host.length === pattern.length - 1 && host === pattern.slice(1)) {
                    isBypassedFlag = true;
                }
            }
        }
        else {
            if (host === pattern) {
                isBypassedFlag = true;
            }
        }
    }
    byPassedList.set(host, isBypassedFlag);
    return isBypassedFlag;
}
function loadNoProxy() {
    const noProxy = getEnvironmentValue(NO_PROXY);
    noProxyListLoaded = true;
    if (noProxy) {
        return noProxy
            .split(",")
            .map((item) => item.trim())
            .filter((item) => item.length);
    }
    return [];
}
/**
 * This method converts a proxy url into `ProxySettings` for use with ProxyPolicy.
 * If no argument is given, it attempts to parse a proxy URL from the environment
 * variables `HTTPS_PROXY` or `HTTP_PROXY`.
 * @param proxyUrl - The url of the proxy to use. May contain authentication information.
 */
function getDefaultProxySettings(proxyUrl) {
    if (!proxyUrl) {
        proxyUrl = loadEnvironmentProxyValue();
        if (!proxyUrl) {
            return undefined;
        }
    }
    const parsedUrl = new url.URL(proxyUrl);
    const schema = parsedUrl.protocol ? parsedUrl.protocol + "//" : "";
    return {
        host: schema + parsedUrl.hostname,
        port: Number.parseInt(parsedUrl.port || "80"),
        username: parsedUrl.username,
        password: parsedUrl.password
    };
}
/**
 * @internal
 */
function getProxyAgentOptions(proxySettings, requestHeaders) {
    let parsedProxyUrl;
    try {
        parsedProxyUrl = new url.URL(proxySettings.host);
    }
    catch (_error) {
        throw new Error(`Expecting a valid host string in proxy settings, but found "${proxySettings.host}".`);
    }
    const proxyAgentOptions = {
        hostname: parsedProxyUrl.hostname,
        port: proxySettings.port,
        protocol: parsedProxyUrl.protocol,
        headers: requestHeaders.toJSON()
    };
    if (proxySettings.username && proxySettings.password) {
        proxyAgentOptions.auth = `${proxySettings.username}:${proxySettings.password}`;
    }
    else if (proxySettings.username) {
        proxyAgentOptions.auth = `${proxySettings.username}`;
    }
    return proxyAgentOptions;
}
function setProxyAgentOnRequest(request) {
    const url$1 = new url.URL(request.url);
    const isInsecure = url$1.protocol !== "https:";
    const proxySettings = request.proxySettings;
    if (proxySettings) {
        if (isInsecure) {
            if (!httpProxyAgent) {
                const proxyAgentOptions = getProxyAgentOptions(proxySettings, request.headers);
                httpProxyAgent = new httpProxyAgent$1.HttpProxyAgent(proxyAgentOptions);
            }
            request.agent = httpProxyAgent;
        }
        else {
            if (!httpsProxyAgent) {
                const proxyAgentOptions = getProxyAgentOptions(proxySettings, request.headers);
                httpsProxyAgent = new httpsProxyAgent$1.HttpsProxyAgent(proxyAgentOptions);
            }
            request.agent = httpsProxyAgent;
        }
    }
}
/**
 * A policy that allows one to apply proxy settings to all requests.
 * If not passed static settings, they will be retrieved from the HTTPS_PROXY
 * or HTTP_PROXY environment variables.
 * @param proxySettings - ProxySettings to use on each request.
 */
function proxyPolicy(proxySettings = getDefaultProxySettings()) {
    if (!noProxyListLoaded) {
        noProxyList.push(...loadNoProxy());
    }
    return {
        name: proxyPolicyName,
        async sendRequest(request, next) {
            if (!request.proxySettings && !isBypassed(request.url)) {
                request.proxySettings = proxySettings;
            }
            if (request.proxySettings) {
                setProxyAgentOnRequest(request);
            }
            return next(request);
        }
    };
}

// Copyright (c) Microsoft Corporation.
/**
 * The programmatic identifier of the formDataPolicy.
 */
const formDataPolicyName = "formDataPolicy";
/**
 * A policy that encodes FormData on the request into the body.
 */
function formDataPolicy() {
    return {
        name: formDataPolicyName,
        async sendRequest(request, next) {
            if (request.formData) {
                prepareFormData(request.formData, request);
            }
            return next(request);
        }
    };
}
async function prepareFormData(formData, request) {
    const requestForm = new FormData();
    for (const formKey of Object.keys(formData)) {
        const formValue = formData[formKey];
        if (Array.isArray(formValue)) {
            for (const subValue of formValue) {
                requestForm.append(formKey, subValue);
            }
        }
        else {
            requestForm.append(formKey, formValue);
        }
    }
    request.body = requestForm;
    request.formData = undefined;
    const contentType = request.headers.get("Content-Type");
    if (contentType && contentType.indexOf("multipart/form-data") !== -1) {
        request.headers.set("Content-Type", `multipart/form-data; boundary=${requestForm.getBoundary()}`);
    }
    try {
        const contentLength = await new Promise((resolve, reject) => {
            requestForm.getLength((err, length) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(length);
                }
            });
        });
        request.headers.set("Content-Length", contentLength);
    }
    catch (e) {
        // ignore setting the length if this fails
    }
}

// Copyright (c) Microsoft Corporation.
const ValidPhaseNames = new Set(["Deserialize", "Serialize", "Retry"]);
/**
 * A private implementation of Pipeline.
 * Do not export this class from the package.
 * @internal
 */
class HttpPipeline {
    constructor(policies = []) {
        this._policies = [];
        this._policies = policies;
        this._orderedPolicies = undefined;
    }
    addPolicy(policy, options = {}) {
        if (options.phase && options.afterPhase) {
            throw new Error("Policies inside a phase cannot specify afterPhase.");
        }
        if (options.phase && !ValidPhaseNames.has(options.phase)) {
            throw new Error(`Invalid phase name: ${options.phase}`);
        }
        if (options.afterPhase && !ValidPhaseNames.has(options.afterPhase)) {
            throw new Error(`Invalid afterPhase name: ${options.afterPhase}`);
        }
        this._policies.push({
            policy,
            options
        });
        this._orderedPolicies = undefined;
    }
    removePolicy(options) {
        const removedPolicies = [];
        this._policies = this._policies.filter((policyDescriptor) => {
            if ((options.name && policyDescriptor.policy.name === options.name) ||
                (options.phase && policyDescriptor.options.phase === options.phase)) {
                removedPolicies.push(policyDescriptor.policy);
                return false;
            }
            else {
                return true;
            }
        });
        this._orderedPolicies = undefined;
        return removedPolicies;
    }
    sendRequest(httpClient, request) {
        const policies = this.getOrderedPolicies();
        const pipeline = policies.reduceRight((next, policy) => {
            return (req) => {
                return policy.sendRequest(req, next);
            };
        }, (req) => httpClient.sendRequest(req));
        return pipeline(request);
    }
    getOrderedPolicies() {
        if (!this._orderedPolicies) {
            this._orderedPolicies = this.orderPolicies();
        }
        return this._orderedPolicies;
    }
    clone() {
        return new HttpPipeline(this._policies);
    }
    static create() {
        return new HttpPipeline();
    }
    orderPolicies() {
        /**
         * The goal of this method is to reliably order pipeline policies
         * based on their declared requirements when they were added.
         *
         * Order is first determined by phase:
         *
         * 1. Serialize Phase
         * 2. Policies not in a phase
         * 3. Deserialize Phase
         * 4. Retry Phase
         *
         * Within each phase, policies are executed in the order
         * they were added unless they were specified to execute
         * before/after other policies or after a particular phase.
         *
         * To determine the final order, we will walk the policy list
         * in phase order multiple times until all dependencies are
         * satisfied.
         *
         * `afterPolicies` are the set of policies that must be
         * executed before a given policy. This requirement is
         * considered satisfied when each of the listed policies
         * have been scheduled.
         *
         * `beforePolicies` are the set of policies that must be
         * executed after a given policy. Since this dependency
         * can be expressed by converting it into a equivalent
         * `afterPolicies` declarations, they are normalized
         * into that form for simplicity.
         *
         * An `afterPhase` dependency is considered satisfied when all
         * policies in that phase have scheduled.
         *
         */
        const result = [];
        // Track all policies we know about.
        const policyMap = new Map();
        // Track policies for each phase.
        const serializePhase = new Set();
        const noPhase = new Set();
        const deserializePhase = new Set();
        const retryPhase = new Set();
        // a list of phases in order
        const orderedPhases = [serializePhase, noPhase, deserializePhase, retryPhase];
        // Small helper function to map phase name to each Set bucket.
        function getPhase(phase) {
            if (phase === "Retry") {
                return retryPhase;
            }
            else if (phase === "Serialize") {
                return serializePhase;
            }
            else if (phase === "Deserialize") {
                return deserializePhase;
            }
            else {
                return noPhase;
            }
        }
        // First walk each policy and create a node to track metadata.
        for (const descriptor of this._policies) {
            const policy = descriptor.policy;
            const options = descriptor.options;
            const policyName = policy.name;
            if (policyMap.has(policyName)) {
                throw new Error("Duplicate policy names not allowed in pipeline");
            }
            const node = {
                policy,
                dependsOn: new Set(),
                dependants: new Set()
            };
            if (options.afterPhase) {
                node.afterPhase = getPhase(options.afterPhase);
            }
            policyMap.set(policyName, node);
            const phase = getPhase(options.phase);
            phase.add(node);
        }
        // Now that each policy has a node, connect dependency references.
        for (const descriptor of this._policies) {
            const { policy, options } = descriptor;
            const policyName = policy.name;
            const node = policyMap.get(policyName);
            if (!node) {
                throw new Error(`Missing node for policy ${policyName}`);
            }
            if (options.afterPolicies) {
                for (const afterPolicyName of options.afterPolicies) {
                    const afterNode = policyMap.get(afterPolicyName);
                    if (afterNode) {
                        // Linking in both directions helps later
                        // when we want to notify dependants.
                        node.dependsOn.add(afterNode);
                        afterNode.dependants.add(node);
                    }
                }
            }
            if (options.beforePolicies) {
                for (const beforePolicyName of options.beforePolicies) {
                    const beforeNode = policyMap.get(beforePolicyName);
                    if (beforeNode) {
                        // To execute before another node, make it
                        // depend on the current node.
                        beforeNode.dependsOn.add(node);
                        node.dependants.add(beforeNode);
                    }
                }
            }
        }
        function walkPhase(phase) {
            // Sets iterate in insertion order
            for (const node of phase) {
                if (node.afterPhase && node.afterPhase.size) {
                    // If this node is waiting on a phase to complete,
                    // we need to skip it for now.
                    continue;
                }
                if (node.dependsOn.size === 0) {
                    // If there's nothing else we're waiting for, we can
                    // add this policy to the result list.
                    result.push(node.policy);
                    // Notify anything that depends on this policy that
                    // the policy has been scheduled.
                    for (const dependant of node.dependants) {
                        dependant.dependsOn.delete(node);
                    }
                    policyMap.delete(node.policy.name);
                    phase.delete(node);
                }
            }
        }
        function walkPhases() {
            let noPhaseRan = false;
            for (const phase of orderedPhases) {
                walkPhase(phase);
                if (phase === noPhase) {
                    noPhaseRan = true;
                }
                // if the phase isn't complete
                if (phase.size > 0 && phase !== noPhase) {
                    if (noPhaseRan === false) {
                        // Try running noPhase to see if that unblocks this phase next tick.
                        // This can happen if a phase that happens before noPhase
                        // is waiting on a noPhase policy to complete.
                        walkPhase(noPhase);
                    }
                    // Don't proceed to the next phase until this phase finishes.
                    return;
                }
            }
        }
        // Iterate until we've put every node in the result list.
        while (policyMap.size > 0) {
            const initialResultLength = result.length;
            // Keep walking each phase in order until we can order every node.
            walkPhases();
            // The result list *should* get at least one larger each time.
            // Otherwise, we're going to loop forever.
            if (result.length <= initialResultLength) {
                throw new Error("Cannot satisfy policy dependencies due to requirements cycle.");
            }
        }
        return result;
    }
}
/**
 * Creates a totally empty pipeline.
 * Useful for testing or creating a custom one.
 */
function createEmptyPipeline() {
    return HttpPipeline.create();
}
/**
 * Create a new pipeline with a default set of customizable policies.
 * @param options - Options to configure a custom pipeline.
 */
function createPipelineFromOptions(options) {
    const pipeline = HttpPipeline.create();
    if (isNode) {
        pipeline.addPolicy(proxyPolicy(options.proxyOptions));
        pipeline.addPolicy(decompressResponsePolicy());
    }
    pipeline.addPolicy(formDataPolicy());
    pipeline.addPolicy(tracingPolicy(options.userAgentOptions));
    pipeline.addPolicy(userAgentPolicy(options.userAgentOptions));
    pipeline.addPolicy(setClientRequestIdPolicy());
    pipeline.addPolicy(throttlingRetryPolicy(), { phase: "Retry" });
    pipeline.addPolicy(systemErrorRetryPolicy(options.retryOptions), { phase: "Retry" });
    pipeline.addPolicy(exponentialRetryPolicy(options.retryOptions), { phase: "Retry" });
    pipeline.addPolicy(redirectPolicy(options.redirectOptions), { afterPhase: "Retry" });
    pipeline.addPolicy(logPolicy(options.loggingOptions), { afterPhase: "Retry" });
    return pipeline;
}

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
function normalizeName(name) {
    return name.toLowerCase();
}
class HttpHeadersImpl {
    constructor(rawHeaders) {
        this._headersMap = new Map();
        if (rawHeaders) {
            for (const headerName of Object.keys(rawHeaders)) {
                this.set(headerName, rawHeaders[headerName]);
            }
        }
    }
    /**
     * Set a header in this collection with the provided name and value. The name is
     * case-insensitive.
     * @param name - The name of the header to set. This value is case-insensitive.
     * @param value - The value of the header to set.
     */
    set(name, value) {
        this._headersMap.set(normalizeName(name), String(value));
    }
    /**
     * Get the header value for the provided header name, or undefined if no header exists in this
     * collection with the provided name.
     * @param name - The name of the header. This value is case-insensitive.
     */
    get(name) {
        return this._headersMap.get(normalizeName(name));
    }
    /**
     * Get whether or not this header collection contains a header entry for the provided header name.
     * @param name - The name of the header to set. This value is case-insensitive.
     */
    has(name) {
        return this._headersMap.has(normalizeName(name));
    }
    /**
     * Remove the header with the provided headerName.
     * @param name - The name of the header to remove.
     */
    delete(name) {
        this._headersMap.delete(normalizeName(name));
    }
    /**
     * Get the JSON object representation of this HTTP header collection.
     */
    toJSON() {
        const result = {};
        for (const [key, value] of this._headersMap) {
            result[key] = value;
        }
        return result;
    }
    /**
     * Get the string representation of this HTTP header collection.
     */
    toString() {
        return JSON.stringify(this.toJSON());
    }
    /**
     * Iterate over tuples of header [name, value] pairs.
     */
    [Symbol.iterator]() {
        return this._headersMap.entries();
    }
}
/**
 * Creates an object that satisfies the `HttpHeaders` interface.
 * @param rawHeaders - A simple object representing initial headers
 */
function createHttpHeaders(rawHeaders) {
    return new HttpHeadersImpl(rawHeaders);
}

// Copyright (c) Microsoft Corporation.
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
class ReportTransform extends stream.Transform {
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
        const abortController$1 = new abortController.AbortController();
        let abortListener;
        if (request.abortSignal) {
            if (request.abortSignal.aborted) {
                throw new abortController.AbortError("The operation was aborted.");
            }
            abortListener = (event) => {
                if (event.type === "abort") {
                    abortController$1.abort();
                }
            };
            request.abortSignal.addEventListener("abort", abortListener);
        }
        if (request.timeout > 0) {
            setTimeout(() => {
                abortController$1.abort();
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
                abortController$1.signal.addEventListener("abort", () => {
                    req.abort();
                    reject(new abortController.AbortError("The operation was aborted."));
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
        const url$1 = new url.URL(request.url);
        const isInsecure = url$1.protocol !== "https:";
        if (isInsecure && !request.allowInsecureConnection) {
            throw new Error(`Cannot connect to ${request.url} while allowInsecureConnection is false.`);
        }
        const agent = (_a = request.agent) !== null && _a !== void 0 ? _a : this.getOrCreateAgent(request, isInsecure);
        const options = {
            agent,
            hostname: url$1.hostname,
            path: `${url$1.pathname}${url$1.search}`,
            port: url$1.port,
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
function getBodyLength(body) {
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
function createNodeHttpClient() {
    return new NodeHttpClient();
}

// Copyright (c) Microsoft Corporation.
/**
 * Create the correct HttpClient for the current environment.
 */
function createDefaultHttpClient() {
    return createNodeHttpClient();
}

// Copyright (c) Microsoft Corporation.
/**
 * Generated Universally Unique Identifier
 *
 * @returns RFC4122 v4 UUID.
 * @internal
 */
function generateUuid() {
    return uuid.v4();
}

// Copyright (c) Microsoft Corporation.
class PipelineRequestImpl {
    constructor(options) {
        var _a, _b, _c, _d, _e, _f;
        this.url = options.url;
        this.body = options.body;
        this.headers = (_a = options.headers) !== null && _a !== void 0 ? _a : createHttpHeaders();
        this.method = (_b = options.method) !== null && _b !== void 0 ? _b : "GET";
        this.timeout = (_c = options.timeout) !== null && _c !== void 0 ? _c : 0;
        this.formData = options.formData;
        this.disableKeepAlive = (_d = options.disableKeepAlive) !== null && _d !== void 0 ? _d : false;
        this.proxySettings = options.proxySettings;
        this.streamResponseStatusCodes = options.streamResponseStatusCodes;
        this.withCredentials = (_e = options.withCredentials) !== null && _e !== void 0 ? _e : false;
        this.abortSignal = options.abortSignal;
        this.tracingOptions = options.tracingOptions;
        this.onUploadProgress = options.onUploadProgress;
        this.onDownloadProgress = options.onDownloadProgress;
        this.requestId = options.requestId || generateUuid();
        this.allowInsecureConnection = (_f = options.allowInsecureConnection) !== null && _f !== void 0 ? _f : false;
    }
}
/**
 * Creates a new pipeline request with the given options.
 * This method is to allow for the easy setting of default values and not required.
 * @param options - The options to create the request with.
 */
function createPipelineRequest(options) {
    return new PipelineRequestImpl(options);
}

// Copyright (c) Microsoft Corporation.
// Default options for the cycler if none are provided
const DEFAULT_CYCLER_OPTIONS = {
    forcedRefreshWindowInMs: 1000,
    retryIntervalInMs: 3000,
    refreshWindowInMs: 1000 * 60 * 2 // Start refreshing 2m before expiry
};
/**
 * Converts an an unreliable access token getter (which may resolve with null)
 * into an AccessTokenGetter by retrying the unreliable getter in a regular
 * interval.
 *
 * @param getAccessToken - A function that produces a promise of an access token that may fail by returning null.
 * @param retryIntervalInMs - The time (in milliseconds) to wait between retry attempts.
 * @param refreshTimeout - The timestamp after which the refresh attempt will fail, throwing an exception.
 * @returns - A promise that, if it resolves, will resolve with an access token.
 */
async function beginRefresh(getAccessToken, retryIntervalInMs, refreshTimeout) {
    // This wrapper handles exceptions gracefully as long as we haven't exceeded
    // the timeout.
    async function tryGetAccessToken() {
        if (Date.now() < refreshTimeout) {
            try {
                return await getAccessToken();
            }
            catch (_a) {
                return null;
            }
        }
        else {
            const finalToken = await getAccessToken();
            // Timeout is up, so throw if it's still null
            if (finalToken === null) {
                throw new Error("Failed to refresh access token.");
            }
            return finalToken;
        }
    }
    let token = await tryGetAccessToken();
    while (token === null) {
        await delay(retryIntervalInMs);
        token = await tryGetAccessToken();
    }
    return token;
}
/**
 * Creates a token cycler from a credential, scopes, and optional settings.
 *
 * A token cycler represents a way to reliably retrieve a valid access token
 * from a TokenCredential. It will handle initializing the token, refreshing it
 * when it nears expiration, and synchronizes refresh attempts to avoid
 * concurrency hazards.
 *
 * @param credential - the underlying TokenCredential that provides the access
 * token
 * @param tokenCyclerOptions - optionally override default settings for the cycler
 *
 * @returns - a function that reliably produces a valid access token
 */
function createTokenCycler(credential, tokenCyclerOptions) {
    let refreshWorker = null;
    let token = null;
    const options = Object.assign(Object.assign({}, DEFAULT_CYCLER_OPTIONS), tokenCyclerOptions);
    /**
     * This little holder defines several predicates that we use to construct
     * the rules of refreshing the token.
     */
    const cycler = {
        /**
         * Produces true if a refresh job is currently in progress.
         */
        get isRefreshing() {
            return refreshWorker !== null;
        },
        /**
         * Produces true if the cycler SHOULD refresh (we are within the refresh
         * window and not already refreshing)
         */
        get shouldRefresh() {
            var _a;
            return (!cycler.isRefreshing &&
                ((_a = token === null || token === void 0 ? void 0 : token.expiresOnTimestamp) !== null && _a !== void 0 ? _a : 0) - options.refreshWindowInMs < Date.now());
        },
        /**
         * Produces true if the cycler MUST refresh (null or nearly-expired
         * token).
         */
        get mustRefresh() {
            return (token === null || token.expiresOnTimestamp - options.forcedRefreshWindowInMs < Date.now());
        }
    };
    /**
     * Starts a refresh job or returns the existing job if one is already
     * running.
     */
    function refresh(scopes, getTokenOptions) {
        var _a;
        if (!cycler.isRefreshing) {
            // We bind `scopes` here to avoid passing it around a lot
            const tryGetAccessToken = () => credential.getToken(scopes, getTokenOptions);
            // Take advantage of promise chaining to insert an assignment to `token`
            // before the refresh can be considered done.
            refreshWorker = beginRefresh(tryGetAccessToken, options.retryIntervalInMs, 
            // If we don't have a token, then we should timeout immediately
            (_a = token === null || token === void 0 ? void 0 : token.expiresOnTimestamp) !== null && _a !== void 0 ? _a : Date.now())
                .then((_token) => {
                refreshWorker = null;
                token = _token;
                return token;
            })
                .catch((reason) => {
                // We also should reset the refresher if we enter a failed state.  All
                // existing awaiters will throw, but subsequent requests will start a
                // new retry chain.
                refreshWorker = null;
                token = null;
                throw reason;
            });
        }
        return refreshWorker;
    }
    return async (scopes, tokenOptions) => {
        //
        // Simple rules:
        // - If we MUST refresh, then return the refresh task, blocking
        //   the pipeline until a token is available.
        // - If we SHOULD refresh, then run refresh but don't return it
        //   (we can still use the cached token).
        // - Return the token, since it's fine if we didn't return in
        //   step 1.
        //
        if (cycler.mustRefresh)
            return refresh(scopes, tokenOptions);
        if (cycler.shouldRefresh) {
            refresh(scopes, tokenOptions);
        }
        return token;
    };
}

// Copyright (c) Microsoft Corporation.
/**
 * The programmatic identifier of the bearerTokenAuthenticationPolicy.
 */
const bearerTokenAuthenticationPolicyName = "bearerTokenAuthenticationPolicy";
/**
 * Default authorize request handler
 */
async function defaultAuthorizeRequest(options) {
    const { scopes, getAccessToken, request } = options;
    const getTokenOptions = {
        abortSignal: request.abortSignal,
        tracingOptions: request.tracingOptions
    };
    const accessToken = await getAccessToken(scopes, getTokenOptions);
    if (accessToken) {
        options.request.headers.set("Authorization", `Bearer ${accessToken.token}`);
    }
}
/**
 * We will retrieve the challenge only if the response status code was 401,
 * and if the response contained the header "WWW-Authenticate" with a non-empty value.
 */
function getChallenge(response) {
    const challenge = response.headers.get("WWW-Authenticate");
    if (response.status === 401 && challenge) {
        return challenge;
    }
    return;
}
/**
 * A policy that can request a token from a TokenCredential implementation and
 * then apply it to the Authorization header of a request as a Bearer token.
 */
function bearerTokenAuthenticationPolicy(options) {
    var _a;
    const { credential, scopes, challengeCallbacks } = options;
    const callbacks = Object.assign({ authorizeRequest: (_a = challengeCallbacks === null || challengeCallbacks === void 0 ? void 0 : challengeCallbacks.authorizeRequest) !== null && _a !== void 0 ? _a : defaultAuthorizeRequest, authorizeRequestOnChallenge: challengeCallbacks === null || challengeCallbacks === void 0 ? void 0 : challengeCallbacks.authorizeRequestOnChallenge }, challengeCallbacks);
    // This function encapsulates the entire process of reliably retrieving the token
    // The options are left out of the public API until there's demand to configure this.
    // Remember to extend `BearerTokenAuthenticationPolicyOptions` with `TokenCyclerOptions`
    // in order to pass through the `options` object.
    const getAccessToken = credential
        ? createTokenCycler(credential /* , options */)
        : () => Promise.resolve(null);
    return {
        name: bearerTokenAuthenticationPolicyName,
        /**
         * If there's no challenge parameter:
         * - It will try to retrieve the token using the cache, or the credential's getToken.
         * - Then it will try the next policy with or without the retrieved token.
         *
         * It uses the challenge parameters to:
         * - Skip a first attempt to get the token from the credential if there's no cached token,
         *   since it expects the token to be retrievable only after the challenge.
         * - Prepare the outgoing request if the `prepareRequest` method has been provided.
         * - Send an initial request to receive the challenge if it fails.
         * - Process a challenge if the response contains it.
         * - Retrieve a token with the challenge information, then re-send the request.
         */
        async sendRequest(request, next) {
            if (!request.url.toLowerCase().startsWith("https://")) {
                throw new Error("Bearer token authentication is not permitted for non-TLS protected (non-https) URLs.");
            }
            await callbacks.authorizeRequest({
                scopes: Array.isArray(scopes) ? scopes : [scopes],
                request,
                getAccessToken
            });
            let response;
            let error;
            try {
                response = await next(request);
            }
            catch (err) {
                error = err;
                response = err.response;
            }
            if (callbacks.authorizeRequestOnChallenge &&
                (response === null || response === void 0 ? void 0 : response.status) === 401 &&
                getChallenge(response)) {
                // processes challenge
                const shouldSendRequest = await callbacks.authorizeRequestOnChallenge({
                    scopes: Array.isArray(scopes) ? scopes : [scopes],
                    request,
                    response,
                    getAccessToken
                });
                if (shouldSendRequest) {
                    return next(request);
                }
            }
            if (error) {
                throw error;
            }
            else {
                return response;
            }
        }
    };
}

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
/**
 * The programmatic identifier of the ndJsonPolicy.
 */
const ndJsonPolicyName = "ndJsonPolicy";
/**
 * ndJsonPolicy is a policy used to control keep alive settings for every request.
 */
function ndJsonPolicy() {
    return {
        name: ndJsonPolicyName,
        async sendRequest(request, next) {
            // There currently isn't a good way to bypass the serializer
            if (typeof request.body === "string" && request.body.startsWith("[")) {
                const body = JSON.parse(request.body);
                if (Array.isArray(body)) {
                    request.body = body.map((item) => JSON.stringify(item) + "\n").join("");
                }
            }
            return next(request);
        }
    };
}

exports.RestError = RestError;
exports.bearerTokenAuthenticationPolicy = bearerTokenAuthenticationPolicy;
exports.bearerTokenAuthenticationPolicyName = bearerTokenAuthenticationPolicyName;
exports.createDefaultHttpClient = createDefaultHttpClient;
exports.createEmptyPipeline = createEmptyPipeline;
exports.createHttpHeaders = createHttpHeaders;
exports.createPipelineFromOptions = createPipelineFromOptions;
exports.createPipelineRequest = createPipelineRequest;
exports.decompressResponsePolicy = decompressResponsePolicy;
exports.decompressResponsePolicyName = decompressResponsePolicyName;
exports.exponentialRetryPolicy = exponentialRetryPolicy;
exports.exponentialRetryPolicyName = exponentialRetryPolicyName;
exports.formDataPolicy = formDataPolicy;
exports.formDataPolicyName = formDataPolicyName;
exports.getDefaultProxySettings = getDefaultProxySettings;
exports.logPolicy = logPolicy;
exports.logPolicyName = logPolicyName;
exports.ndJsonPolicy = ndJsonPolicy;
exports.ndJsonPolicyName = ndJsonPolicyName;
exports.proxyPolicy = proxyPolicy;
exports.proxyPolicyName = proxyPolicyName;
exports.redirectPolicy = redirectPolicy;
exports.redirectPolicyName = redirectPolicyName;
exports.setClientRequestIdPolicy = setClientRequestIdPolicy;
exports.setClientRequestIdPolicyName = setClientRequestIdPolicyName;
exports.systemErrorRetryPolicy = systemErrorRetryPolicy;
exports.systemErrorRetryPolicyName = systemErrorRetryPolicyName;
exports.throttlingRetryPolicy = throttlingRetryPolicy;
exports.throttlingRetryPolicyName = throttlingRetryPolicyName;
exports.tracingPolicy = tracingPolicy;
exports.tracingPolicyName = tracingPolicyName;
exports.userAgentPolicy = userAgentPolicy;
exports.userAgentPolicyName = userAgentPolicyName;
//# sourceMappingURL=index.js.map
