// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { HttpHeaders } from "../httpHeaders";
import * as base64 from "../util/base64";
import { Constants } from "../util/constants";
var HeaderConstants = Constants.HeaderConstants;
var DEFAULT_AUTHORIZATION_SCHEME = "Basic";
var BasicAuthenticationCredentials = /** @class */ (function () {
    /**
     * Creates a new BasicAuthenticationCredentials object.
     *
     * @param userName - User name.
     * @param password - Password.
     * @param authorizationScheme - The authorization scheme.
     */
    function BasicAuthenticationCredentials(userName, password, authorizationScheme) {
        if (authorizationScheme === void 0) { authorizationScheme = DEFAULT_AUTHORIZATION_SCHEME; }
        this.authorizationScheme = DEFAULT_AUTHORIZATION_SCHEME;
        if (userName === null || userName === undefined || typeof userName.valueOf() !== "string") {
            throw new Error("userName cannot be null or undefined and must be of type string.");
        }
        if (password === null || password === undefined || typeof password.valueOf() !== "string") {
            throw new Error("password cannot be null or undefined and must be of type string.");
        }
        this.userName = userName;
        this.password = password;
        this.authorizationScheme = authorizationScheme;
    }
    /**
     * Signs a request with the Authentication header.
     *
     * @param webResource - The WebResourceLike to be signed.
     * @returns The signed request object.
     */
    BasicAuthenticationCredentials.prototype.signRequest = function (webResource) {
        var credentials = this.userName + ":" + this.password;
        var encodedCredentials = this.authorizationScheme + " " + base64.encodeString(credentials);
        if (!webResource.headers)
            webResource.headers = new HttpHeaders();
        webResource.headers.set(HeaderConstants.AUTHORIZATION, encodedCredentials);
        return Promise.resolve(webResource);
    };
    return BasicAuthenticationCredentials;
}());
export { BasicAuthenticationCredentials };
//# sourceMappingURL=basicAuthenticationCredentials.js.map