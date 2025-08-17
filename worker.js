export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = decodeURIComponent(url.pathname);

    // If the path is for a directory, generate and serve an HTML page.
    if (path.endsWith('/') || path === '') {
      return handleDirectoryRequest(path, env);
    }
    // Otherwise, treat it as a file download request.
    else {
      return handleFileRequest(path, env);
    }
  },
};

/**
 * Handles requests for directories by fetching the listing from Dropbox
 * and rendering an HTML page on the server side.
 */
async function handleDirectoryRequest(path, env) {
  let dropboxPath = path;
  if (dropboxPath === '/') {
    dropboxPath = ''; // The root folder for the Dropbox API is an empty string.
  } else if (dropboxPath.endsWith('/')) {
    // Remove the trailing slash for the API call.
    dropboxPath = dropboxPath.slice(0, -1);
  }

  try {
    const apiResponse = await fetch("https://api.dropboxapi.com/2/files/list_folder", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.DROPBOX_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path: dropboxPath }),
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      return new Response(`Error fetching directory from Dropbox: ${errorText}`, { status: apiResponse.status });
    }

    const data = await apiResponse.json();
    const html = renderHTMLPage(data.entries, path);
    return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8" } });

  } catch (e) {
    return new Response(`Worker error: ${e.message}`, { status: 500 });
  }
}

/**
 * Handles requests for files by streaming them directly from Dropbox.
 */
async function handleFileRequest(path, env) {
  const downloadResponse = await fetch("https://content.dropboxapi.com/2/files/download", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.DROPBOX_ACCESS_TOKEN}`,
      "Dropbox-API-Arg": JSON.stringify({ path: path }),
    },
  });

  // If Dropbox returns 409, it's a folder, but the user didn't use a trailing slash.
  // We can redirect them to the correct URL with the slash.
  if (downloadResponse.status === 409) {
    return Response.redirect(new URL(path + '/', new URL(request.url).origin), 302);
  }

  return downloadResponse; // Stream the response directly to the user.
}


/**
 * Renders the complete HTML page for a given list of files and a path.
 * @param {Array} files - The array of file/folder objects from the Dropbox API.
 * @param {string} path - The current directory path from the URL.
 * @returns {string} A complete HTML document as a string.
 */
function renderHTMLPage(files, path) {
  // Sort files: folders first, then alphabetically.
  files.sort((a, b) => {
    if (a['.tag'] === 'folder' && b['.tag'] !== 'folder') return -1;
    if (a['.tag'] !== 'folder' && b['.tag'] === 'folder') return 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });

  const fileListItems = files.map(file => {
    const isFolder = file['.tag'] === 'folder';
    const icon = isFolder ? '📁' : '📄';
    const href = isFolder ? `${file.path_lower}/` : file.path_lower;
    const downloadButton = isFolder ? '' : `<a href="${file.path_lower}" class="download">Download</a>`;
    
    return `<li data-name="${file.name.toLowerCase()}">
      <div class="file-info">
        <a href="${href}"><span class="icon">${icon}</span> ${file.name}</a>
      </div>
      ${downloadButton}
    </li>`;
  }).join('');

  // Generate the "up a level" link if not in the root directory.
  let upLevelLink = '';
  if (path !== '/' && path !== '') {
    const segments = path.split('/').filter(s => s);
    segments.pop();
    const parentHref = segments.length > 0 ? `/${segments.join('/')}/` : '/';
    upLevelLink = `<li id="parent-dir-link">
      <a href="${parentHref}"><span class="icon">📁</span> ..</a>
    </li>`;
  }
  
  // Generate breadcrumb navigation.
  let breadcrumbs = '<a href="/">Root</a>';
  const segments = path.split('/').filter(s => s);
  let cumulativePath = '';
  for (const segment of segments) {
    cumulativePath += `/${segment}`;
    breadcrumbs += ` / <a href="${cumulativePath}/">${segment}</a>`;
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <title>Dropbox Index</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; background-color: #f8f9fa; color: #212529; }
    #container { max-width: 900px; margin: 0 auto; padding: 20px; }
    #header { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; margin-bottom: 20px; gap: 15px; }
    #folder-path { font-size: 1.2em; color: #495057; word-break: break-all; }
    #folder-path a { color: #007bff; text-decoration: none; }
    #folder-path a:hover { text-decoration: underline; }
    #search { padding: 10px; border: 1px solid #ced4da; border-radius: 5px; width: 250px; font-size: 1em; }
    #file-list { list-style: none; padding: 0; margin: 0; border: 1px solid #dee2e6; border-radius: 5px; background-color: #fff; }
    #file-list li { display: flex; justify-content: space-between; align-items: center; padding: 12px 15px; border-bottom: 1px solid #dee2e6; }
    #file-list li:last-child { border-bottom: none; }
    #file-list .file-info { flex-grow: 1; min-width: 0; }
    #file-list .file-info a { text-decoration: none; color: #007bff; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: inline-block; max-width: 100%; }
    #file-list .file-info a:hover { text-decoration: underline; }
    #file-list .download { padding: 6px 12px; background-color: #28a745; color: #fff; border-radius: 5px; text-decoration: none; font-size: 0.9em; white-space: nowrap; margin-left: 15px; }
    #file-list .download:hover { background-color: #218838; }
    .icon { margin-right: 8px; }
  </style>
</head>
<body>
  <div id="container">
    <div id="header">
      <h1 id="folder-path">${breadcrumbs}</h1>
      <input type="text" id="search" placeholder="Search this directory...">
    </div>
    <ul id="file-list">
      ${upLevelLink}
      ${fileListItems}
    </ul>
  </div>
  <script>
    const searchInput = document.getElementById('search');
    const fileList = document.getElementById('file-list');
    searchInput.addEventListener('input', () => {
      const searchTerm = searchInput.value.toLowerCase();
      fileList.querySelectorAll('li').forEach(item => {
        if (item.id === 'parent-dir-link') return; // Always show '..' link
        const name = item.dataset.name || '';
        item.style.display = name.includes(searchTerm) ? 'flex' : 'none';
      });
    });
  </script>
</body>
</html>`;
}
