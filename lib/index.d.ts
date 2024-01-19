import { gmail_v1 } from "googleapis";
import { Address, Attachment as NodemailerAttachment } from "nodemailer/lib/mailer";
export declare function buildEmail(message: gmail_v1.Schema$Message): Email;
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
    attachmentId?: string;
}
export type EmailDraft = {
    id?: number;
    title: string;
    subject: string;
    emailFrom?: Address;
    emailTo: Address[];
    emailCc: Address[];
    emailBcc: Address[];
    emailBody: string;
    emailPlainText: string;
    replyThreadId?: string;
    replyEmailId?: string;
    attachments?: Attachment[];
    smtpEmailReferences?: string[];
    smtpReplyEmailId?: string;
};
