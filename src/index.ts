import { gmail_v1 } from "googleapis";
import { Address, Attachment as NodemailerAttachment } from "nodemailer/lib/mailer";
import addressparser from "nodemailer/lib/addressparser";
import libmime from "libmime";
import punycode from "punycode";
import * as quotedPrintable from "quoted-printable";
import linkify from "linkify-it";
import he from "he";
import { JSDOM } from "jsdom";
import DOMPurify from "dompurify";
import { htmlToText } from "html-to-text";
import iconv from "iconv-lite";


export async function buildEmail(message: gmail_v1.Schema$Message){
  const headers = message?.payload?.headers;
  const messageId = message?.id;
  const threadId = message?.threadId;

  if (!message?.payload) {
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
  const subject = parsedHeaders.get("subject") as string;
  const date = parsedHeaders.get("date") as Date;

  const tempFrom = parsedHeaders.get("from") || [];
  const tempTo = parsedHeaders.get("to") || [];
  const tempCc = parsedHeaders.get("cc") || [];
  const tempBcc = parsedHeaders.get("bcc") || [];
  const tempReplyTo = parsedHeaders.get("reply-to");

  let from: Address[] = Array.isArray(tempFrom) ? tempFrom : [tempFrom];
  let to: Address[] = Array.isArray(tempTo) ? tempTo : [tempTo];
  let cc: Address[] = Array.isArray(tempCc) ? tempCc : [tempCc];
  let bcc: Address[] = Array.isArray(tempBcc) ? tempBcc : [tempBcc];
  let replyTo: Address[] | undefined = tempReplyTo !== undefined ? (Array.isArray(tempReplyTo) ? tempReplyTo : [tempReplyTo]) : undefined;

  let parentNode = new Node(message.payload);
  parentNode.decodeBody();
  parentNode.traverseTree();
  // console.dir(message, { depth: null });

  // console.dir(parentNode, { depth: null });

  let attachments: Attachment[] | undefined = parentNode.attachments;
  if (attachments.length === 0) {
    attachments = undefined;
  }

  let body: EmailBody = {
    plainText: parentNode.getText(),
    plainTextAsHtml: parentNode.getTextAsHtml(),
    html: await parentNode.getHtml(),
  };

  return {
    subject: subject,
    date: date,
    from: from,
    to: to,
    cc: cc,
    bcc: bcc,
    ...(replyTo && { replyTo: replyTo }),
    body: body,
    threadId: threadId,
    messageId: messageId,
    ...(attachments && { attachments: attachments }),
  };
}

function decodeAddresses(addresses: addressparser.AddressOrGroup[]) {
  let processedAddress = new WeakSet();
  for (let i = 0; i < addresses.length; i++) {
    let address = addresses[i];
    address.name = (address.name || "").toString().trim();

    if ("address" in address) {
      if (!address.address && /^(=\?([^?]+)\?[Bb]\?[^?]*\?=)(\s*=\?([^?]+)\?[Bb]\?[^?]*\?=)*$/.test(address.name) && !processedAddress.has(address)) {
        let parsed = addressparser(libmime.decodeWords(address.name));
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
          address.name = libmime.decodeWords(address.name);
        } catch (E) {
          //ignore, keep as is
        }
      }
      if (/@xn--/.test(address.address)) {
        try {
          address.address =
            address.address.substr(0, address.address.lastIndexOf("@") + 1) +
            punycode.toUnicode(address.address.substr(address.address.lastIndexOf("@") + 1));
        } catch (E) {
          // Not a valid punycode string; keep as is
        }
      }
    } else if ("group" in address) {
      if (address.group) {
        decodeAddresses(address.group);
      }
    }
  }
}

function processHeaders(lines: gmail_v1.Schema$MessagePartHeader[]) {
  let headers = new Map();
  (lines || []).forEach((line) => {
    if (!line.name && !line.value) {
      return;
    }
    let key = line.name?.toLowerCase();
    let value: any = line.value;
    // let value: any = ((libmime.decodeHeader(line.value ?? '') || {}).value || '').toString().trim();
    // console.log(value)
    value = Buffer.from(value, "binary").toString();
    switch (key) {
      case "content-type":
      case "content-disposition":
      case "dkim-signature":
        value = libmime.parseHeaderValue(value);
        if (value) {
          value = libmime.decodeWords(value);
        }
        Object.keys((value && value.params) || {}).forEach((key) => {
          try {
            value.params[key] = libmime.decodeWords(value.params[key]);
          } catch (E) {
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
          value = libmime.decodeWords(value);
        } catch (E) {
          // ignore, keep as is
        }
        break;
      case "references":
        try {
          value = libmime.decodeWords(value);
        } catch (E) {
          // ignore
        }
        value = value.split(/\s+/).map(ensureMessageIDFormat);
        break;
      case "message-id":
      case "in-reply-to":
        try {
          value = libmime.decodeWords(value);
        } catch (E) {
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
        value = addressparser(value);
        let val: addressparser.AddressOrGroup[] = value;
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
      } else if (Array.isArray(value)) {
        headers.set(key, headers.get(key).concat(value));
      } else {
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
      } else if (value.length === 1) {
        headers.set(key, value[0]);
      }
    }

    if (key === "list") {
      // normalize List-* headers
      let listValue: { [key: string]: string } = {};
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

function parseListHeader(key: string, value: string) {
  let addresses = addressparser(value);
  let response: { url?: string; name?: string; mail?: string; id?: string } = {};
  let data = addresses
    .map((address) => {
      if (/^https?:/i.test(address.name)) {
        response.url = address.name;
      } else if (address.name) {
        response.name = address.name;
      }
      if ("address" in address) {
        if (/^mailto:/.test(address.address)) {
          response.mail = address.address.substr(7);
        } else if (address.address && address.address.indexOf("@") < 0) {
          response.id = address.address;
        } else if (address.address) {
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

function parsePriority(value: string) {
  value = value.toLowerCase().trim();
  let intValue: number;
  if (!isNaN(parseInt(value, 10))) {
    // support "X-Priority: 1 (Highest)"
    intValue = parseInt(value, 10) || 0;
    if (intValue === 3) {
      return "normal";
    } else if (intValue > 3) {
      return "low";
    } else {
      return "high";
    }
  } else {
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

function ensureMessageIDFormat(value: string) {
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

enum MimeType {
  PLAIN = "text/plain",
  HTML = "text/html",
  MULTIPART_ALTERNATIVE = "multipart/alternative",
  MULTIPART_RELATED = "multipart/related",
  MULTIPART_MIXED = "multipart/mixed",
  MULTIPART_SIGNED = "multipart/signed",
  RFC = "message/rfc822",
  CALENDAR = "text/calendar" //add support 
}

enum Disposition {
  ATTATCHMENT = "attachment",
  INLINE = "inline",
  None = "",
}

enum Encoding {
  BASE64 = "base64",
  QUOTEDPRINTABLE = "quoted-printable",
  // BINARY = "binary",
  // None = ""
}

enum Charset {
  UTF8 = "utf-8",
  ASCII = "'ascii'",
  USASCII = "usascii",
}

class Node {
  mimeType: MimeType;
  disposition: Disposition;
  encoding: Encoding;
  charset: Charset;
  parentNode: Node | null;
  subNodes: Node[];
  body?: gmail_v1.Schema$MessagePartBody;
  filename?: string;
  cid?: string;

  text: string[] = [];
  textAsHtml: string[] = [];
  html: string[] = [];
  attachments: Attachment[] = [];

  static textTypes: string[] = [MimeType.PLAIN, MimeType.HTML];
  static multipartTypes: string[] = [MimeType.MULTIPART_ALTERNATIVE, MimeType.MULTIPART_MIXED, MimeType.MULTIPART_RELATED, MimeType.MULTIPART_SIGNED];
  static encodingTypes: string[] = [Encoding.BASE64, Encoding.QUOTEDPRINTABLE];

  constructor(part: gmail_v1.Schema$MessagePart, parentNode: Node | null = null) {
    if (!part?.mimeType) {
      throw new Error("No mime type");
    }
    if (!part?.headers) {
      throw new Error("No headers");
    }

    let mime = (part.mimeType as MimeType) || MimeType.PLAIN;
    let disposition: Disposition = Disposition.None;
    let encoding: Encoding = Encoding.BASE64;
    let charset: Charset = Charset.UTF8;
    let subNodes: Node[] = [];
    let body: gmail_v1.Schema$MessagePartBody | undefined;

    let headers = part.headers.reduce((obj: { [key: string]: string }, item) => {
      if (item?.name && item?.value) {
        obj[item.name] = item.value;
      }
      return obj;
    }, {});

    if (!part.mimeType?.includes("multipart")) {
      if (headers["Content-Disposition"]) {
        let parsedDisposition = libmime.parseHeaderValue(headers["Content-Disposition"]);
        if (parsedDisposition?.value && (parsedDisposition.value == Disposition.ATTATCHMENT || parsedDisposition.value == Disposition.INLINE)) {
          disposition = parsedDisposition.value as Disposition;
        } else {
          disposition = Disposition.ATTATCHMENT;
        }
      } else {
        if (!Node.textTypes.includes(part.mimeType)) {
          disposition = Disposition.ATTATCHMENT;
        } else {
          disposition = Disposition.INLINE;
        }
      }

      if (headers["Content-ID"]) {
        this.cid = headers["Content-ID"].replace(/^<|>$/g, "");
      }

      encoding = Node.encodingTypes.includes(headers["Content-Transfer-Encoding"])
        ? (headers["Content-Transfer-Encoding"] as Encoding)
        : Encoding.BASE64;

      let contentType = headers["Content-Type"];
      let matchingCharset = Object.values(Charset).find((charset) => contentType.toLowerCase().includes(charset));

      if (matchingCharset) {
        charset = matchingCharset;
      }

      body = part.body;
    } else if (part.mimeType?.includes("multipart")) {
      if (part.parts) {
        for (let subPart of part.parts) {
          let subNode = new Node(subPart, this);
          subNodes.push(subNode);
        }
      } else {
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
    if (!Node.multipartTypes.includes(this.mimeType)) {
      switch (this.encoding.trim()) {
        case Encoding.BASE64: {
          if (Disposition.INLINE === this.disposition) {
            if (Node.textTypes.includes(this.mimeType)) {
              if (!this.body?.data) {
                this.body = { size: 0, data: "" };
              }
              let buffer = this.body.data ? Buffer.from(this.body.data, Encoding.BASE64) : Buffer.alloc(0);
              this.body.data = iconv.decode(buffer, this.charset);
              break;
            } else if (this.body?.attachmentId) {
              //TODO - INLINE ATTACHMENT
              break;
            }
          }
          //if its an attatchment
          else if (Disposition.ATTATCHMENT === this.disposition) {
            if (!this.body?.attachmentId) {
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
              if (!this.body?.data) {
                console.log(this)
                this.body = { size: 0, data: "" };
              }
              let buffer = this.body.data ? Buffer.from(Node.decodeQuotedPrintable(this.body.data), "base64") : Buffer.alloc(0);
              this.body.data = iconv.decode(buffer, this.charset);
              break;
            }
            throw new Error("No Disposition");
          } else if (Disposition.ATTATCHMENT === this.disposition) {
            if (!this.body?.attachmentId) {
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
    if (Node.textTypes.includes(this.mimeType)) {
      if (this.mimeType === MimeType.PLAIN) {
        if (!this.body?.data) {
          console.log(this.body)
          throw new Error("No body data");
        }
        this.text.push(this.body.data);
        this.textAsHtml.push(Node.textToHtml(this.body.data));
      } else if (this.mimeType === MimeType.HTML) {
        if (!this.body?.data) {
          throw new Error("No body data");
        }
        this.html.push(this.body.data);
        try {
          // this.text.push(htmlToText(this.body.data))
        } catch (error) {
          this.text.push(" ");
          console.error("Could not parse HTML into text");
        }
      }
    } else if (Node.multipartTypes.includes(this.mimeType)) {
      if (this.subNodes) {
        for (let subNode of this.subNodes) {
          subNode.traverseTree();
          this.text = this.text.concat(subNode.text);
          this.textAsHtml = this.textAsHtml.concat(subNode.textAsHtml);
          this.html = this.html.concat(subNode.html);
          this.attachments = this.attachments.concat(subNode.attachments);
        }
      }
    } else {
      if (this.filename) {
        this.attachments.push({
          filename: this.filename ?? "",
          attachmentId: this.body?.attachmentId ?? "",
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
    return htmlToText(this.html.join(""));
  }

  getTextAsHtml() {
    return this.textAsHtml.join("");
  }

  async getHtml(): Promise<string> {
    let cleanHtml = Node.cleanHtml(this.html.join(""));
    return cleanHtml;
  }

  getAttachments() {
    return this.attachments;
  }

  getToDownloadAttachments() {
    return this.attachments.filter((attachment) => !attachment.cid);
  }

  static decodeBase64(base64EncodedString: string) {
    return atob(base64EncodedString.replace(/-/g, "+").replace(/_/g, "/"));
  }

  static decodeQuotedPrintable(quotedPrintableEncodedString: string) {
    return quotedPrintable.decode(quotedPrintableEncodedString);
  }

  static cleanHtml(html: string): string {
    const window = new JSDOM("").window;
    const purify = DOMPurify(window);
    return purify.sanitize(html);
  }

  static textToHtml(str: string) {
    str = (str || "").toString();
    let encoded;
    let linkifier = linkify();

    try {
      if (linkifier.pretest(str)) {
        let links = linkifier.match(str) || [];
        let result = [];
        let last = 0;

        links.forEach((link) => {
          if (last < link.index) {
            let textPart = he
              // encode special chars
              .encode(str.slice(last, link.index), {
                useNamedReferences: true,
              });
            result.push(textPart);
          }

          result.push(`<a href="${link.url}">${link.text}</a>`);

          last = link.lastIndex;
        });

        let textPart = he
          // encode special chars
          .encode(str.slice(last), {
            useNamedReferences: true,
          });
        result.push(textPart);

        encoded = result.join("");
      } else {
        encoded = he
          // encode special chars
          .encode(str, {
            useNamedReferences: true,
          });
      }
    } catch (E) {
      throw Error("Failed to linkify");
    }

    let text =
      "<p>" +
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


export type EmailBody = {
  plainText?: string;
  plainTextAsHtml?: string;
  html: string | boolean;
};

export type Email = {
  subject: string;
  date: Date;
  from: Address[];
  to: Address[];
  cc: Address[];
  bcc: Address[];
  replyTo?: Address[];
  body: EmailBody;
  threadId: string;
  messageId: string;
  drafts?: EmailDraft[];
  attachments?: Attachment[];
};

export interface Attachment extends NodemailerAttachment {
  attachmentId?: string,
}

export type EmailDraft = {
  id?: number;
  title: string;
  subject: string;
  emailFrom?: Address;
  emailTo: Address[];
  emailCc: Address[];
  emailBcc: Address[];
  emailBody: string; //html email body
  emailPlainText: string; //markdown-ish formatted email body
  replyThreadId?: string; //including this makes it a reply or a fwd
  replyEmailId?: string; //including this makes it a reply or a fwd
  attachments?: Attachment[];
  smtpEmailReferences?: string[]; //don't include from frontend
  smtpReplyEmailId?: string; //don't include from frontend
};
