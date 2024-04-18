import { google } from "googleapis";
import { buildEmail } from ".";

export function initializeGmail(accessToken: string) {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({
        access_token: accessToken
    });
    return google.gmail({ version: "v1", auth: oauth2Client })
}

async function getThreads(threadId: string, accessToken: string) {
    const gmail = initializeGmail(accessToken);
    const { data: { messages } } = await gmail.users.threads.get({
        userId: 'me',
        id: ""
    })

    if (!messages) { return }

    const built = buildEmail(messages[messages.length - 1])

}

getThreads("", "")