# dropbox-index-workers
An direct link index site for Dropbox files deployed to Cloudflare Workers (experimental). You can share your Dropbox files without really sharing your files from the site and have a nice direct download link that won't change.

### Disclaimer
This repository is entirely experimental, expect some bugs here and there. You can help this repository by making pull requests for more features and fixing bugs.

## Setup Instructions

Follow these steps carefully to configure and deploy your worker.

### Step 1: Create and Configure Your Dropbox App

1.  Go to the [Dropbox App Console](https://www.dropbox.com/developers/apps) and log in.
2.  Click **"Create app"**.
3.  Configure the app:
    -   Choose an API: **Scoped access**
    -   Type of access: **Full Dropbox**
    -   Name your app (e.g., `cloudflare-worker-index`).
4.  Go to the **Settings** tab. Your **App Key** and **App Secret** are listed here. You will need these for the final step.
5.  Go to the **Permissions** tab. Check the boxes for the following permissions:
    -   `files.metadata.read`
    -   `files.content.read`
6.  Click the **Submit** button at the bottom of the page to save the permissions.

### Step 2: Manually Generate Your Permanent Refresh Token

This is a one-time process to get a token that allows the worker to generate its own access tokens in the future.

1.  **Generate the Authorization URL:**
    -   Take your **App Key** from the previous step.
    -   Construct the following URL, replacing `[YOUR_APP_KEY]` with your actual App Key:
        ```
        https://www.dropbox.com/oauth2/authorize?client_id=[YOUR_APP_KEY]&response_type=code&token_access_type=offline
        ```

2.  **Get the Authorization Code:**
    -   Open the URL you just created in your browser.
    -   Click **"Allow"** to grant the app access to your Dropbox.
    -   Dropbox will then show you a page with your **Authorization Code**. Copy this code.

3.  **Exchange the Code for a Refresh Token:**
    -   Open a command prompt, terminal, or any command-line interface on your computer.
    -   Copy the `curl` command below and paste it into your terminal.
    -   Replace `[YOUR_APP_KEY]`, `[YOUR_APP_SECRET]`, and `[YOUR_AUTHORIZATION_CODE]` with your actual credentials.
        ```bash
        curl https://api.dropboxapi.com/oauth2/token -d code=[YOUR_AUTHORIZATION_CODE] -d grant_type=authorization_code -u [YOUR_APP_KEY]:[YOUR_APP_SECRET]
        ```
    -   Run the command. The output will be a JSON object. Copy the long string value from the `"refresh_token"` field. This is your permanent refresh token.

### Step 3: Deploy the Cloudflare Worker

1.  **Create the Worker:**
    -   In your Cloudflare dashboard, go to **Workers & Pages** and click **"Create application"**.
    -   Select "Create Worker" and give it a name.
    -   Click **"Edit code"** and paste the entire contents of the `worker.js` file into the editor, replacing any boilerplate.

2.  **Create the KV Namespace:**
    -   Go back to the **Workers & Pages** overview.
    -   Click the **KV** tab, then **"Create a namespace"**.
    -   Enter a name (e.g., `DROPBOX_KV`) and click "Add".

3.  **Configure Worker Variables and Bindings:**
    -   Go to your worker's settings page (**Settings > Variables**).
    -   Under **Environment Variables**, click **"Add variable"** and add the following three secrets, making sure to click **"Encrypt"** for each one:
        -   `DROPBOX_APP_KEY`: Your app key.
        -   `DROPBOX_APP_SECRET`: Your app secret.
        -   `DROPBOX_REFRESH_TOKEN`: The refresh token you generated in Step 2.
    -   Scroll down to **KV Namespace Bindings**, click **"Add binding"**:
        -   **Variable name**: `DROPBOX_KV`
        -   **KV namespace**: Select the namespace you created.
    -   Click **"Save and Deploy"**.

Your Dropbox index is now live at your worker's URL.````
