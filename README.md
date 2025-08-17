# dropbox-index-workers
An direct link index site for Dropbox files deployed to Cloudflare Workers (experimental). You can share your Dropbox files without really sharing your files from the site and have a nice direct download link that won't change.

### Disclaimer
This repository is entirely experimental, expect some bugs here and there. You can help this repository by making pull requests for more features and fixing bugs.

### Known Issues
1. Folder link must end with `/` trailing (should not that big of a deal though if you use the site to navigate)

### To-Do
**I don't know when, I can't promise anything**
1. Ability to change root folder easily (using specific scopes work too though)

### Deployment Instructions
1.  **Create a Dropbox App:**
    *   Go to the [Dropbox App Console](https://www.dropbox.com/developers/apps).
    *   Click "Create app".
    *   Choose "Scoped access" and select the scope you want (only a specific app folder or the full root folder).
    *   Select the required permissions: `files.metadata.read` and `files.content.read`.
    *   Give your app a unique name and click "Create app".

2.  **Generate an Access Token:**
    *   In your app's settings, go to the "OAuth 2" tab.
    *   Under "Generated access token", click "Generate".
    *   Copy this token. It's a secret and should not be shared.

3.  **Deploy to Cloudflare Workers:**
    *   Go to your Cloudflare dashboard, navigate to "Workers & Pages", and create a new Worker.
    *   Give it a name (e.g., `dropbox-proxy`).
    *   Click "Edit code" to open the editor.
    *   Delete the boilerplate code and paste the entire `worker.js` code block from above.
    *   Go to your worker's settings page (**Settings** > **Variables**).
    *   Under "Environment Variables", click "Add variable".
        *   **Variable name**: `DROPBOX_ACCESS_TOKEN`
        *   **Value**: Paste the access token you copied from Dropbox.
        *   Click the **Encrypt** button to protect your secret.
    *   Click **"Save and Deploy"** on the variables page.
