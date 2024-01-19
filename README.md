# gmailer

Loosely based on the very popular Nodemailer, gmailer parses messages from the Gmail API into a far more usable MIME-decoded JSON format. It's Gmail API integration agnostic and only needs an individual [message object](https://developers.google.com/gmail/api/reference/rest/v1/users.messages/get) to run. This is huge speed boost over using Nodemailer to parse 'raw' messages from the Gmail API, and instead uses a Node tree to traverse the Gmail generated message payload, headers, and attachments. 

It's synchronous, typed, and extracts both plaintext and html (cleaned by DOMPurify) where possible. Gmailer also supports inline message attachments (with CIDs) & downloadable attachments which can be retrieved with a [secondary call to the Gmail API](https://developers.google.com/gmail/api/reference/rest/v1/users.messages.attachments/get)


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

```
import { buildEmail, Email } from "@dubdubdublabs/gmailer"
import { google, gmail_v1 } from "googleapis" 

async function retrieveDecodedEmail(threadId){

    //initialize gmail library
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({
        access_token: YOUR_ACCESS_TOKEN,
    });
    gmail = google.gmail({ version: "v1", auth: oauth2Client });

    //get the full message list for a given thread id 
    const res: GaxiosResponse<Thread> = await gmail.users.threads.get({
        userId: "me",
        id: threadId,
        format: "full",
    });

    //declare a return array 
    let parsedThread: Email[] = []

    //iterate over each message in the thread and run the parsing function 
    for (let messageItem of res.data.messages) {
        parsedThread.push(buildEmail(messageItem);
    }

    return parsedThread
}
```
