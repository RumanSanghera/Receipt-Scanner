// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import * as xml2js from "xml2js";
import { XML_ATTRKEY, XML_CHARKEY } from "./serializer.common";
// Note: The reason we re-define all of the xml2js default settings (version 2.0) here is because the default settings object exposed
// by the xm2js library is mutable. See https://github.com/Leonidas-from-XIV/node-xml2js/issues/536
// By creating a new copy of the settings each time we instantiate the parser,
// we are safeguarding against the possibility of the default settings being mutated elsewhere unintentionally.
var xml2jsDefaultOptionsV2 = {
    explicitCharkey: false,
    trim: false,
    normalize: false,
    normalizeTags: false,
    attrkey: XML_ATTRKEY,
    explicitArray: true,
    ignoreAttrs: false,
    mergeAttrs: false,
    explicitRoot: true,
    validator: undefined,
    xmlns: false,
    explicitChildren: false,
    preserveChildrenOrder: false,
    childkey: "$$",
    charsAsChildren: false,
    includeWhiteChars: false,
    async: false,
    strict: true,
    attrNameProcessors: undefined,
    attrValueProcessors: undefined,
    tagNameProcessors: undefined,
    valueProcessors: undefined,
    rootName: "root",
    xmldec: {
        version: "1.0",
        encoding: "UTF-8",
        standalone: true
    },
    doctype: undefined,
    renderOpts: {
        pretty: true,
        indent: "  ",
        newline: "\n"
    },
    headless: false,
    chunkSize: 10000,
    emptyTag: "",
    cdata: false
};
// The xml2js settings for general XML parsing operations.
var xml2jsParserSettings = Object.assign({}, xml2jsDefaultOptionsV2);
xml2jsParserSettings.explicitArray = false;
// The xml2js settings for general XML building operations.
var xml2jsBuilderSettings = Object.assign({}, xml2jsDefaultOptionsV2);
xml2jsBuilderSettings.explicitArray = false;
xml2jsBuilderSettings.renderOpts = {
    pretty: false
};
/**
 * Converts given JSON object to XML string
 * @param obj - JSON object to be converted into XML string
 * @param opts - Options that govern the parsing of given JSON object
 */
export function stringifyXML(obj, opts) {
    var _a;
    if (opts === void 0) { opts = {}; }
    xml2jsBuilderSettings.rootName = opts.rootName;
    xml2jsBuilderSettings.charkey = (_a = opts.xmlCharKey) !== null && _a !== void 0 ? _a : XML_CHARKEY;
    var builder = new xml2js.Builder(xml2jsBuilderSettings);
    return builder.buildObject(obj);
}
/**
 * Converts given XML string into JSON
 * @param str - String containing the XML content to be parsed into JSON
 * @param opts - Options that govern the parsing of given xml string
 */
export function parseXML(str, opts) {
    var _a;
    if (opts === void 0) { opts = {}; }
    xml2jsParserSettings.explicitRoot = !!opts.includeRoot;
    xml2jsParserSettings.charkey = (_a = opts.xmlCharKey) !== null && _a !== void 0 ? _a : XML_CHARKEY;
    var xmlParser = new xml2js.Parser(xml2jsParserSettings);
    return new Promise(function (resolve, reject) {
        if (!str) {
            reject(new Error("Document is empty"));
        }
        else {
            xmlParser.parseString(str, function (err, res) {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(res);
                }
            });
        }
    });
}
//# sourceMappingURL=xml.js.map