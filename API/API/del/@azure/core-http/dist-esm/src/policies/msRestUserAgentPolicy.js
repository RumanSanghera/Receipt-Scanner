// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import * as os from "os";
import { Constants } from "../util/constants";
export function getDefaultUserAgentKey() {
    return Constants.HeaderConstants.USER_AGENT;
}
export function getPlatformSpecificData() {
    var runtimeInfo = {
        key: "Node",
        value: process.version
    };
    var osInfo = {
        key: "OS",
        value: "(" + os.arch() + "-" + os.type() + "-" + os.release() + ")"
    };
    return [runtimeInfo, osInfo];
}
//# sourceMappingURL=msRestUserAgentPolicy.js.map