/*! @azure/msal-common v4.4.0 2021-06-29 */
'use strict';
/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
var CacheRecord = /** @class */ (function () {
    function CacheRecord(accountEntity, idTokenEntity, accessTokenEntity, refreshTokenEntity, appMetadataEntity) {
        this.account = accountEntity || null;
        this.idToken = idTokenEntity || null;
        this.accessToken = accessTokenEntity || null;
        this.refreshToken = refreshTokenEntity || null;
        this.appMetadata = appMetadataEntity || null;
    }
    return CacheRecord;
}());

export { CacheRecord };
//# sourceMappingURL=CacheRecord.js.map
