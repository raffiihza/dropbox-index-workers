// ===================================================================================
// MAIN ROUTER
// ===================================================================================
export default {
  async fetch(request, env) {
    // Optional Authentication: Check for credentials if they are set in the environment.
    if (env.AUTH_USERNAME && env.AUTH_PASSWORD) {
      const auth = await basicAuthentication(request, env);
      if (!auth.success) {
        return new Response('Unauthorized', {
          status: 401,
          headers: { 'WWW-Authenticate': 'Basic realm="Restricted Area"' },
        });
      }
    }

    const url = new URL(request.url);
    const path = decodeURIComponent(url.pathname);

    if (path.endsWith('/') || path === '') {
      return handleDirectoryRequest(request, path, env);
    } else {
      return handleFileRequest(request, path, env);
    }
  },
};


// ===================================================================================
// SECTION 1: AUTHENTICATION
// ===================================================================================

async function basicAuthentication(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return { success: false };
  }
  
  const encodedCreds = authHeader.substring(6);
  try {
    const creds = atob(encodedCreds);
    const [username, password] = creds.split(':');
    
    const userMatch = username === env.AUTH_USERNAME;
    const passMatch = password === env.AUTH_PASSWORD;

    if (userMatch && passMatch) {
      return { success: true };
    }
  } catch (e) {
    // Decoding failed, invalid header.
  }
  
  return { success: false };
}


// ===================================================================================
// SECTION 2: CORE FILE BROWSER APPLICATION
// ===================================================================================

async function fetchWithTokenRefresh(requestFn, env) {
  let accessToken = await env.DROPBOX_KV.get('DBX_ACCESS_TOKEN');
  if (!accessToken) accessToken = await refreshAccessToken(env);
  try {
    return await requestFn(accessToken);
  } catch (error) {
    if (error.message === 'TOKEN_EXPIRED') {
      const newAccessToken = await refreshAccessToken(env);
      return await requestFn(newAccessToken);
    }
    throw error;
  }
}

async function refreshAccessToken(env) {
  const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: env.DROPBOX_REFRESH_TOKEN,
      client_id: env.DROPBOX_APP_KEY,
      client_secret: env.DROPBOX_APP_SECRET,
    }),
  });
  if (!response.ok) throw new Error(`Failed to refresh token: ${await response.text()}`);
  const data = await response.json();
  await env.DROPBOX_KV.put('DBX_ACCESS_TOKEN', data.access_token, { expirationTtl: 14100 });
  return data.access_token;
}

function isTokenExpired(response) { return response.status === 401; }

async function handleDirectoryRequest(request, path, env) {
  const dropboxPath = (path === '/') ? '' : path.slice(0, -1);
  const requestFn = async (token) => {
    const response = await fetch("https://api.dropboxapi.com/2/files/list_folder", {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ path: dropboxPath }),
    });
    if (isTokenExpired(response)) throw new Error('TOKEN_EXPIRED');
    if (!response.ok) throw new Error(`Dropbox API Error: ${await response.text()}`);
    return response.json();
  };
  try {
    const data = await fetchWithTokenRefresh(requestFn, env);
    const html = renderFileBrowserHTML(data.entries, path);
    return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
  } catch (error) {
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
}

async function handleFileRequest(request, path, env) {
  const requestFn = async (token) => {
    const response = await fetch("https://content.dropboxapi.com/2/files/download", {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Dropbox-API-Arg": JSON.stringify({ path }) },
    });
    if (isTokenExpired(response)) throw new Error('TOKEN_EXPIRED');
    return response;
  };
  try {
    const downloadResponse = await fetchWithTokenRefresh(requestFn, env);
    if (downloadResponse.status === 409) return Response.redirect(new URL(path + '/', request.url).toString(), 302);
    return downloadResponse;
  } catch (error) {
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
}


// ===================================================================================
// SECTION 3: HTML TEMPLATES
// ===================================================================================

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function renderFileBrowserHTML(files, path) {
  files.sort((a, b) => { if (a['.tag'] === b['.tag']) return a.name.localeCompare(b.name, undefined, { numeric: true }); return a['.tag'] === 'folder' ? -1 : 1; });
  const fileListItems = files.map(file => {
    const isFolder = file['.tag'] === 'folder', icon = isFolder ? '📁' : '📄', href = isFolder ? `${file.path_lower}/` : file.path_lower;
    const fileSize = isFolder ? '' : `<span class="file-size">${formatBytes(file.size)}</span>`;
    const downloadButton = isFolder ? '' : `<a href="${href}" class="download">Download</a>`;
    return `<li data-name="${file.name.toLowerCase()}"><div class="file-info"><a href="${href}"><span class="icon">${icon}</span> ${file.name}</a></div>${fileSize}${downloadButton}</li>`;
  }).join('');
  let upLevelLink = ''; if (path !== '/' && path !== '') { const segments = path.split('/').filter(s => s); segments.pop(); const parentHref = segments.length > 0 ? `/${segments.join('/')}/` : '/'; upLevelLink = `<li id="parent-dir-link"><a href="${parentHref}"><span class="icon">📁</span> ..</a></li>`; }
  let breadcrumbs = '<a href="/">Root</a>'; const segments = path.split('/').filter(s => s); let cumulativePath = ''; for (const segment of segments) { cumulativePath += `/${segment}`; breadcrumbs += ` / <a href="${cumulativePath}/">${segment}</a>`; }
  return `
<!DOCTYPE html><html><head><title>Dropbox Index</title><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
:root { --bg-color: #1e1e1e; --text-color: #e0e0e0; --link-color: #90caf9; --border-color: #333; --search-bg: #333; --header-color: #bb86fc; --size-color: #888; --download-bg: #03dac6; --download-text: #000; }
body{font-family:-apple-system,BlinkMacSystem-Font,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;margin:0;background:var(--bg-color);color:var(--text-color)}
#container{max-width:900px;margin:0 auto;padding:20px}
#header{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;margin-bottom:20px;gap:15px}
#folder-path{font-size:1.2em;color:var(--header-color);word-break:break-all}
#folder-path a{color:var(--link-color);text-decoration:none}
#folder-path a:hover{text-decoration:underline}
#search{padding:10px;border:1px solid var(--border-color);border-radius:5px;width:250px;font-size:1em;background:var(--search-bg);color:var(--text-color)}
#search::placeholder{color:#aaa}
#file-list{list-style:none;padding:0;margin:0;border:1px solid var(--border-color);border-radius:5px;background:var(--bg-color)}
#file-list li{display:flex;align-items:center;padding:12px 15px;border-bottom:1px solid var(--border-color)}
#file-list li:last-child{border-bottom:none}
#file-list .file-info{flex-grow:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#file-list .file-info a{text-decoration:none;color:var(--link-color);font-weight:500}
#file-list .file-info a:hover{text-decoration:underline}
.file-size{color:var(--size-color);margin:0 15px;white-space:nowrap}
#file-list .download{padding:6px 12px;background:var(--download-bg);color:var(--download-text);border-radius:5px;text-decoration:none;font-size:.9em;white-space:nowrap;font-weight:bold}
#file-list .download:hover{opacity:0.8}
.icon{margin-right:8px}
</style>
</head><body><div id="container"><div id="header"><h1 id="folder-path">${breadcrumbs}</h1><input type="text" id="search" placeholder="Search this directory..."></div>
<ul id="file-list">${upLevelLink}${fileListItems}</ul></div>
<script>const searchInput=document.getElementById('search'),fileList=document.getElementById('file-list');searchInput.addEventListener('input',()=>{const e=searchInput.value.toLowerCase();fileList.querySelectorAll('li').forEach(t=>{if(t.id==='parent-dir-link')return;const n=t.dataset.name||'';t.style.display=n.includes(e)?'flex':'none'})})</script>
</body></html>`;
}
