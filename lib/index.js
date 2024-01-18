"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildEmail = void 0;
const addressparser_1 = __importDefault(require("nodemailer/lib/addressparser"));
const libmime_1 = __importDefault(require("libmime"));
const punycode_1 = __importDefault(require("punycode"));
const quotedPrintable = __importStar(require("quoted-printable"));
const linkify_it_1 = __importDefault(require("linkify-it"));
const he_1 = __importDefault(require("he"));
const jsdom_1 = require("jsdom");
const dompurify_1 = __importDefault(require("dompurify"));
const html_to_text_1 = require("html-to-text");
const iconv_lite_1 = __importDefault(require("iconv-lite"));
function buildEmail(message) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const headers = (_a = message === null || message === void 0 ? void 0 : message.payload) === null || _a === void 0 ? void 0 : _a.headers;
        const messageId = message === null || message === void 0 ? void 0 : message.id;
        const threadId = message === null || message === void 0 ? void 0 : message.threadId;
        if (!(message === null || message === void 0 ? void 0 : message.payload)) {
            throw new Error("No payload");
        }
        if (!headers) {
            throw new Error("No headers in email");
        }
        if (!messageId) {
            throw new Error("No message id in email");
        }
        if (!threadId) {
            throw new Error("No threa id in email");
        }
        let parsedHeaders = processHeaders(headers);
        const subject = parsedHeaders.get("subject");
        const date = parsedHeaders.get("date");
        const tempFrom = parsedHeaders.get("from") || [];
        const tempTo = parsedHeaders.get("to") || [];
        const tempCc = parsedHeaders.get("cc") || [];
        const tempBcc = parsedHeaders.get("bcc") || [];
        const tempReplyTo = parsedHeaders.get("reply-to");
        let from = Array.isArray(tempFrom) ? tempFrom : [tempFrom];
        let to = Array.isArray(tempTo) ? tempTo : [tempTo];
        let cc = Array.isArray(tempCc) ? tempCc : [tempCc];
        let bcc = Array.isArray(tempBcc) ? tempBcc : [tempBcc];
        let replyTo = tempReplyTo !== undefined ? (Array.isArray(tempReplyTo) ? tempReplyTo : [tempReplyTo]) : undefined;
        let parentNode = new Node(message.payload);
        parentNode.decodeBody();
        parentNode.traverseTree();
        // console.dir(message, { depth: null });
        // console.dir(parentNode, { depth: null });
        let attachments = parentNode.attachments;
        if (attachments.length === 0) {
            attachments = undefined;
        }
        let body = {
            plainText: parentNode.getText(),
            plainTextAsHtml: parentNode.getTextAsHtml(),
            html: yield parentNode.getHtml(),
        };
        return Object.assign(Object.assign(Object.assign({ subject: subject, date: date, from: from, to: to, cc: cc, bcc: bcc }, (replyTo && { replyTo: replyTo })), { body: body, threadId: threadId, messageId: messageId }), (attachments && { attachments: attachments }));
    });
}
exports.buildEmail = buildEmail;
function decodeAddresses(addresses) {
    let processedAddress = new WeakSet();
    for (let i = 0; i < addresses.length; i++) {
        let address = addresses[i];
        address.name = (address.name || "").toString().trim();
        if ("address" in address) {
            if (!address.address && /^(=\?([^?]+)\?[Bb]\?[^?]*\?=)(\s*=\?([^?]+)\?[Bb]\?[^?]*\?=)*$/.test(address.name) && !processedAddress.has(address)) {
                let parsed = (0, addressparser_1.default)(libmime_1.default.decodeWords(address.name));
                if (parsed.length) {
                    parsed.forEach((entry) => {
                        processedAddress.add(entry);
                        addresses.push(entry);
                    });
                }
                // remove current element
                addresses.splice(i, 1);
                i--;
                continue;
            }
            if (address.name) {
                try {
                    address.name = libmime_1.default.decodeWords(address.name);
                }
                catch (E) {
                    //ignore, keep as is
                }
            }
            if (/@xn--/.test(address.address)) {
                try {
                    address.address =
                        address.address.substr(0, address.address.lastIndexOf("@") + 1) +
                            punycode_1.default.toUnicode(address.address.substr(address.address.lastIndexOf("@") + 1));
                }
                catch (E) {
                    // Not a valid punycode string; keep as is
                }
            }
        }
        else if ("group" in address) {
            if (address.group) {
                decodeAddresses(address.group);
            }
        }
    }
}
function processHeaders(lines) {
    let headers = new Map();
    (lines || []).forEach((line) => {
        var _a;
        if (!line.name && !line.value) {
            return;
        }
        let key = (_a = line.name) === null || _a === void 0 ? void 0 : _a.toLowerCase();
        let value = line.value;
        // let value: any = ((libmime.decodeHeader(line.value ?? '') || {}).value || '').toString().trim();
        // console.log(value)
        value = Buffer.from(value, "binary").toString();
        switch (key) {
            case "content-type":
            case "content-disposition":
            case "dkim-signature":
                value = libmime_1.default.parseHeaderValue(value);
                if (value) {
                    value = libmime_1.default.decodeWords(value);
                }
                Object.keys((value && value.params) || {}).forEach((key) => {
                    try {
                        value.params[key] = libmime_1.default.decodeWords(value.params[key]);
                    }
                    catch (E) {
                        // ignore, keep as is
                    }
                });
                break;
            case "date": {
                let dateValue = new Date(value);
                if (isNaN(Date.parse(value))) {
                    // date parsing failed :S
                    dateValue = new Date();
                }
                value = dateValue;
                break;
            }
            case "subject":
                try {
                    value = libmime_1.default.decodeWords(value);
                }
                catch (E) {
                    // ignore, keep as is
                }
                break;
            case "references":
                try {
                    value = libmime_1.default.decodeWords(value);
                }
                catch (E) {
                    // ignore
                }
                value = value.split(/\s+/).map(ensureMessageIDFormat);
                break;
            case "message-id":
            case "in-reply-to":
                try {
                    value = libmime_1.default.decodeWords(value);
                }
                catch (E) {
                    // ignore
                }
                value = ensureMessageIDFormat(value);
                break;
            case "priority":
            case "x-priority":
            case "x-msmail-priority":
            case "importance":
                key = "priority";
                value = parsePriority(value);
                break;
            case "from":
            case "to":
            case "cc":
            case "bcc":
            case "sender":
            case "reply-to":
            case "delivered-to":
            case "return-path":
                value = (0, addressparser_1.default)(value);
                let val = value;
                decodeAddresses(val);
                value = val;
                break;
        }
        // handle list-* keys
        if (key && key.substring(0, 5) === "list-") {
            value = parseListHeader(key.substring(5), value);
            key = "list";
        }
        if (value) {
            if (!headers.has(key)) {
                headers.set(key, [].concat(value || []));
            }
            else if (Array.isArray(value)) {
                headers.set(key, headers.get(key).concat(value));
            }
            else {
                headers.get(key).push(value);
            }
        }
    });
    // keep only the first value
    let singleKeys = [
        "message-id",
        "content-id",
        "from",
        "sender",
        "in-reply-to",
        "reply-to",
        "subject",
        "date",
        "content-disposition",
        "content-type",
        "content-transfer-encoding",
        "priority",
        "mime-version",
        "content-description",
        "precedence",
        "errors-to",
    ];
    headers.forEach((value, key) => {
        if (Array.isArray(value)) {
            if (singleKeys.includes(key) && value.length) {
                headers.set(key, value[value.length - 1]);
            }
            else if (value.length === 1) {
                headers.set(key, value[0]);
            }
        }
        if (key === "list") {
            // normalize List-* headers
            let listValue = {};
            [].concat(value || []).forEach((val) => {
                Object.keys(val || {}).forEach((listKey) => {
                    listValue[listKey] = val[listKey];
                });
            });
            headers.set(key, listValue);
        }
    });
    return headers;
}
function parseListHeader(key, value) {
    let addresses = (0, addressparser_1.default)(value);
    let response = {};
    let data = addresses
        .map((address) => {
        if (/^https?:/i.test(address.name)) {
            response.url = address.name;
        }
        else if (address.name) {
            response.name = address.name;
        }
        if ("address" in address) {
            if (/^mailto:/.test(address.address)) {
                response.mail = address.address.substr(7);
            }
            else if (address.address && address.address.indexOf("@") < 0) {
                response.id = address.address;
            }
            else if (address.address) {
                response.mail = address.address;
            }
        }
        if (Object.keys(response).length) {
            return response;
        }
        return false;
    })
        .filter((address) => address);
    if (data.length) {
        return {
            [key]: response,
        };
    }
    return false;
}
function parsePriority(value) {
    value = value.toLowerCase().trim();
    let intValue;
    if (!isNaN(parseInt(value, 10))) {
        // support "X-Priority: 1 (Highest)"
        intValue = parseInt(value, 10) || 0;
        if (intValue === 3) {
            return "normal";
        }
        else if (intValue > 3) {
            return "low";
        }
        else {
            return "high";
        }
    }
    else {
        switch (value) {
            case "non-urgent":
            case "low":
                return "low";
            case "urgent":
            case "high":
                return "high";
        }
    }
    return "normal";
}
function ensureMessageIDFormat(value) {
    if (!value.length) {
        return false;
    }
    if (value.charAt(0) !== "<") {
        value = "<" + value;
    }
    if (value.charAt(value.length - 1) !== ">") {
        value += ">";
    }
    return value;
}
//TODO - Charset Management
//TODO - RFC 822 Support
//TODO - Message Delivery Status
// function traverseNodes(nodes: Node[]) {
//   let text = []
//   let html = []
//   for(let node of nodes) {
//     if(node.mimeType == MimeType.PLAIN) {
//     } else if (node.mimeType == MimeType.HTML) {
//     }
//   }
// }
var MimeType;
(function (MimeType) {
    MimeType["PLAIN"] = "text/plain";
    MimeType["HTML"] = "text/html";
    MimeType["MULTIPART_ALTERNATIVE"] = "multipart/alternative";
    MimeType["MULTIPART_RELATED"] = "multipart/related";
    MimeType["MULTIPART_MIXED"] = "multipart/mixed";
    MimeType["MULTIPART_SIGNED"] = "multipart/signed";
    MimeType["RFC"] = "message/rfc822";
    MimeType["CALENDAR"] = "text/calendar"; //add support 
})(MimeType || (MimeType = {}));
var Disposition;
(function (Disposition) {
    Disposition["ATTATCHMENT"] = "attachment";
    Disposition["INLINE"] = "inline";
    Disposition["None"] = "";
})(Disposition || (Disposition = {}));
var Encoding;
(function (Encoding) {
    Encoding["BASE64"] = "base64";
    Encoding["QUOTEDPRINTABLE"] = "quoted-printable";
    // BINARY = "binary",
    // None = ""
})(Encoding || (Encoding = {}));
var Charset;
(function (Charset) {
    Charset["UTF8"] = "utf-8";
    Charset["ASCII"] = "'ascii'";
    Charset["USASCII"] = "usascii";
})(Charset || (Charset = {}));
class Node {
    constructor(part, parentNode = null) {
        var _a, _b;
        this.text = [];
        this.textAsHtml = [];
        this.html = [];
        this.attachments = [];
        if (!(part === null || part === void 0 ? void 0 : part.mimeType)) {
            throw new Error("No mime type");
        }
        if (!(part === null || part === void 0 ? void 0 : part.headers)) {
            throw new Error("No headers");
        }
        let mime = part.mimeType || MimeType.PLAIN;
        let disposition = Disposition.None;
        let encoding = Encoding.BASE64;
        let charset = Charset.UTF8;
        let subNodes = [];
        let body;
        let headers = part.headers.reduce((obj, item) => {
            if ((item === null || item === void 0 ? void 0 : item.name) && (item === null || item === void 0 ? void 0 : item.value)) {
                obj[item.name] = item.value;
            }
            return obj;
        }, {});
        if (!((_a = part.mimeType) === null || _a === void 0 ? void 0 : _a.includes("multipart"))) {
            if (headers["Content-Disposition"]) {
                let parsedDisposition = libmime_1.default.parseHeaderValue(headers["Content-Disposition"]);
                if ((parsedDisposition === null || parsedDisposition === void 0 ? void 0 : parsedDisposition.value) && (parsedDisposition.value == Disposition.ATTATCHMENT || parsedDisposition.value == Disposition.INLINE)) {
                    disposition = parsedDisposition.value;
                }
                else {
                    disposition = Disposition.ATTATCHMENT;
                }
            }
            else {
                if (!Node.textTypes.includes(part.mimeType)) {
                    disposition = Disposition.ATTATCHMENT;
                }
                else {
                    disposition = Disposition.INLINE;
                }
            }
            if (headers["Content-ID"]) {
                this.cid = headers["Content-ID"].replace(/^<|>$/g, "");
            }
            encoding = Node.encodingTypes.includes(headers["Content-Transfer-Encoding"])
                ? headers["Content-Transfer-Encoding"]
                : Encoding.BASE64;
            let contentType = headers["Content-Type"];
            let matchingCharset = Object.values(Charset).find((charset) => contentType.toLowerCase().includes(charset));
            if (matchingCharset) {
                charset = matchingCharset;
            }
            body = part.body;
        }
        else if ((_b = part.mimeType) === null || _b === void 0 ? void 0 : _b.includes("multipart")) {
            if (part.parts) {
                for (let subPart of part.parts) {
                    let subNode = new Node(subPart, this);
                    subNodes.push(subNode);
                }
            }
            else {
                throw new Error("Was multi-part but had no parts!");
            }
        }
        this.mimeType = mime;
        this.disposition = disposition;
        this.encoding = encoding;
        this.charset = charset;
        this.parentNode = parentNode;
        this.subNodes = subNodes;
        if (part.filename) {
            this.filename = part.filename;
        }
        if (body) {
            this.body = body;
        }
    }
    decodeBody() {
        var _a, _b, _c, _d, _e;
        if (!Node.multipartTypes.includes(this.mimeType)) {
            switch (this.encoding.trim()) {
                case Encoding.BASE64: {
                    if (Disposition.INLINE === this.disposition) {
                        if (Node.textTypes.includes(this.mimeType)) {
                            if (!((_a = this.body) === null || _a === void 0 ? void 0 : _a.data)) {
                                this.body = { size: 0, data: "" };
                            }
                            let buffer = this.body.data ? Buffer.from(this.body.data, Encoding.BASE64) : Buffer.alloc(0);
                            this.body.data = iconv_lite_1.default.decode(buffer, this.charset);
                            break;
                        }
                        else if ((_b = this.body) === null || _b === void 0 ? void 0 : _b.attachmentId) {
                            //TODO - INLINE ATTACHMENT
                            break;
                        }
                    }
                    //if its an attatchment
                    else if (Disposition.ATTATCHMENT === this.disposition) {
                        if (!((_c = this.body) === null || _c === void 0 ? void 0 : _c.attachmentId)) {
                            throw new Error("No attachment id for attachment");
                        }
                        this.body.data = this.encoding;
                        // let buffer = this.body.attachmentId ? Buffer.from(this.body.attachmentId, Encoding.BASE64) : Buffer.alloc(0);
                        // this.body.data = iconv.decode(buffer, this.charset);
                        break;
                    }
                }
                case Encoding.QUOTEDPRINTABLE: {
                    if (Node.textTypes.includes(this.mimeType)) {
                        if (Disposition.INLINE === this.disposition) {
                            if (!((_d = this.body) === null || _d === void 0 ? void 0 : _d.data)) {
                                console.log(this);
                                this.body = { size: 0, data: "" };
                            }
                            let buffer = this.body.data ? Buffer.from(Node.decodeQuotedPrintable(this.body.data), "base64") : Buffer.alloc(0);
                            this.body.data = iconv_lite_1.default.decode(buffer, this.charset);
                            break;
                        }
                        throw new Error("No Disposition");
                    }
                    else if (Disposition.ATTATCHMENT === this.disposition) {
                        if (!((_e = this.body) === null || _e === void 0 ? void 0 : _e.attachmentId)) {
                            throw new Error("No attachment id for attachment");
                        }
                        this.body.data = this.encoding;
                        break;
                    }
                }
                default: {
                    throw new Error("No encoding provided");
                }
            }
        }
        if (this.subNodes) {
            for (let subNode of this.subNodes) {
                subNode.decodeBody();
            }
        }
    }
    traverseTree() {
        var _a, _b, _c, _d, _e;
        if (Node.textTypes.includes(this.mimeType)) {
            if (this.mimeType === MimeType.PLAIN) {
                if (!((_a = this.body) === null || _a === void 0 ? void 0 : _a.data)) {
                    console.log(this.body);
                    throw new Error("No body data");
                }
                this.text.push(this.body.data);
                this.textAsHtml.push(Node.textToHtml(this.body.data));
            }
            else if (this.mimeType === MimeType.HTML) {
                if (!((_b = this.body) === null || _b === void 0 ? void 0 : _b.data)) {
                    throw new Error("No body data");
                }
                this.html.push(this.body.data);
                try {
                    // this.text.push(htmlToText(this.body.data))
                }
                catch (error) {
                    this.text.push(" ");
                    console.error("Could not parse HTML into text");
                }
            }
        }
        else if (Node.multipartTypes.includes(this.mimeType)) {
            if (this.subNodes) {
                for (let subNode of this.subNodes) {
                    subNode.traverseTree();
                    this.text = this.text.concat(subNode.text);
                    this.textAsHtml = this.textAsHtml.concat(subNode.textAsHtml);
                    this.html = this.html.concat(subNode.html);
                    this.attachments = this.attachments.concat(subNode.attachments);
                }
            }
        }
        else {
            if (this.filename) {
                this.attachments.push({
                    filename: (_c = this.filename) !== null && _c !== void 0 ? _c : "",
                    attachmentId: (_e = (_d = this.body) === null || _d === void 0 ? void 0 : _d.attachmentId) !== null && _e !== void 0 ? _e : "",
                    cid: this.disposition == Disposition.INLINE && this.cid ? this.cid : undefined,
                    contentType: this.mimeType,
                });
                return;
            }
            throw Error("No filename");
        }
    }
    getText() {
        if (this.text.join("")) {
            return this.text.join("");
        }
        return (0, html_to_text_1.htmlToText)(this.html.join(""));
    }
    getTextAsHtml() {
        return this.textAsHtml.join("");
    }
    getHtml() {
        return __awaiter(this, void 0, void 0, function* () {
            let cleanHtml = Node.cleanHtml(this.html.join(""));
            return cleanHtml;
        });
    }
    getAttachments() {
        return this.attachments;
    }
    getToDownloadAttachments() {
        return this.attachments.filter((attachment) => !attachment.cid);
    }
    static decodeBase64(base64EncodedString) {
        return atob(base64EncodedString.replace(/-/g, "+").replace(/_/g, "/"));
    }
    static decodeQuotedPrintable(quotedPrintableEncodedString) {
        return quotedPrintable.decode(quotedPrintableEncodedString);
    }
    static cleanHtml(html) {
        const window = new jsdom_1.JSDOM("").window;
        const purify = (0, dompurify_1.default)(window);
        return purify.sanitize(html);
    }
    static textToHtml(str) {
        str = (str || "").toString();
        let encoded;
        let linkifier = (0, linkify_it_1.default)();
        try {
            if (linkifier.pretest(str)) {
                let links = linkifier.match(str) || [];
                let result = [];
                let last = 0;
                links.forEach((link) => {
                    if (last < link.index) {
                        let textPart = he_1.default
                            // encode special chars
                            .encode(str.slice(last, link.index), {
                            useNamedReferences: true,
                        });
                        result.push(textPart);
                    }
                    result.push(`<a href="${link.url}">${link.text}</a>`);
                    last = link.lastIndex;
                });
                let textPart = he_1.default
                    // encode special chars
                    .encode(str.slice(last), {
                    useNamedReferences: true,
                });
                result.push(textPart);
                encoded = result.join("");
            }
            else {
                encoded = he_1.default
                    // encode special chars
                    .encode(str, {
                    useNamedReferences: true,
                });
            }
        }
        catch (E) {
            throw Error("Failed to linkify");
        }
        let text = "<p>" +
            encoded
                .replace(/\r?\n/g, "\n")
                .trim() // normalize line endings
                .replace(/[ \t]+$/gm, "")
                .trim() // trim empty line endings
                .replace(/\n\n+/g, "</p><p>")
                .trim() // insert <p> to multiple linebreaks
                .replace(/\n/g, "<br/>") + // insert <br> to single linebreaks
            "</p>";
        return text;
    }
}
Node.textTypes = [MimeType.PLAIN, MimeType.HTML];
Node.multipartTypes = [MimeType.MULTIPART_ALTERNATIVE, MimeType.MULTIPART_MIXED, MimeType.MULTIPART_RELATED, MimeType.MULTIPART_SIGNED];
Node.encodingTypes = [Encoding.BASE64, Encoding.QUOTEDPRINTABLE];
