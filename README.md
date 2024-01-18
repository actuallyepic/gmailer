# gmailer

Loosely based on the very popular Nodemailer, gmailer parses messages from the Gmail API into a far more usable JSON format & handles mime type decoding. It's implementation is agnostic of how you get the messages from GMail (so you can implement as you wish) and only needs an individual [message object](https://developers.google.com/gmail/api/reference/rest/v1/users.messages/get) to run. 

It's synchronous, typed, and extracts both plaintext and html (cleaned by DOMPurify) where possible. 


```
{
    subject: string;
    date: Date;
    from: Address[];
    to: Address[];
    cc: Address[];
    bcc: Address[];
    replyTo?: Address[] | undefined;
    body: EmailBody;
    threadId: string;
    messageId: string;
    drafts?: EmailDraft[] | undefined;
    attachments?: Attachment[] | undefined;
}
```

 Use by calling the ```buildEmail``` function with a Gmail message object. 
