'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const http = require('http');
const os = require('os');
const path = require('path');
const { marked } = require('marked');

const root = path.resolve(__dirname, '..');
const docsRoot = path.join(root, 'docs');
const outputRoot = path.join(root, '.docs-preview');
const host = '127.0.0.1';
const port = Number(process.env.DOCS_PORT || 4000);
const siteUrl = `http://${host}:${port}/`;
let buildVersion = 0;

function parseFrontMatter(text) {
    if (!text.startsWith('---\n')) return { attributes: {}, body: text };
    const end = text.indexOf('\n---', 4);
    if (end < 0) return { attributes: {}, body: text };
    const attributes = {};
    for (const line of text.slice(4, end).split('\n')) {
        const match = line.match(/^([\w-]+):\s*(.*)$/);
        if (!match) continue;
        let value = match[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        } else if (/^(true|false)$/.test(value)) {
            value = value === 'true';
        } else if (/^\d+$/.test(value)) {
            value = Number(value);
        }
        attributes[match[1]] = value;
    }
    return { attributes, body: text.slice(end + 4).replace(/^\n/, '') };
}

function walkMarkdown(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) return walkMarkdown(file);
        return file.endsWith('.md') ? [file] : [];
    });
}

function routeFor(file, attributes) {
    if (attributes.permalink) return attributes.permalink.replace(/\/$/, '') || '/';
    const relative = path.relative(docsRoot, file).replace(/\\/g, '/').replace(/\.md$/, '');
    return relative.endsWith('/index') ? `/${relative.slice(0, -6)}` || '/' : `/${relative}`;
}

function routeFile(route) {
    const clean = route.replace(/^\/+|\/+$/g, '');
    return clean ? `${clean}/index.html` : 'index.html';
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function sortPages(pages) {
    return [...pages].sort((a, b) => (a.attributes.nav_order || 999) - (b.attributes.nav_order || 999) || a.title.localeCompare(b.title));
}

function renderCodeBlock(code, language = '') {
    const safeLanguage = String(language || 'text').split(/\s+/)[0].replace(/[^a-z0-9+#.-]/gi, '') || 'text';
    const encoded = Buffer.from(String(code)).toString('base64');
    return `<div class="code-card"><div class="code-toolbar"><span class="code-language">${escapeHtml(safeLanguage)}</span><button class="copy-code" type="button" data-code="${encoded}" aria-label="Copy ${escapeHtml(safeLanguage)} example">Copy</button></div><pre><code class="language-${escapeHtml(safeLanguage)}">${escapeHtml(code)}</code></pre></div>`;
}

const markdownRenderer = new marked.Renderer();
markdownRenderer.code = ({ text, lang }) => renderCodeBlock(text, lang);
marked.use({ renderer: markdownRenderer });

function slugifyHeading(value, used) {
    const base = String(value).toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';
    let slug = base;
    let index = 2;
    while (used.has(slug)) slug = `${base}-${index++}`;
    used.add(slug);
    return slug;
}

function renderMarkdown(body) {
    const used = new Set();
    const sections = [];
    const renderer = new marked.Renderer();
    renderer.heading = ({ text, depth }) => {
        const id = slugifyHeading(text, used);
        if (depth >= 2) sections.push({ id, title: text, depth });
        return `<h${depth} id="${id}">${text}</h${depth}>`;
    };
    renderer.code = ({ text, lang }) => renderCodeBlock(text, lang);
    return { html: marked.parse(body, { renderer }), sections };
}

function navigation(pages, currentRoute) {
    const visible = pages.filter(page => page.attributes.title && page.route !== '/README');
    const byTitle = new Map(visible.map(page => [page.title, page]));
    const children = new Map();
    const roots = [];
    for (const page of visible) {
        const parent = page.attributes.parent ? byTitle.get(page.attributes.parent) : null;
        if (parent) {
            if (!children.has(parent.route)) children.set(parent.route, []);
            children.get(parent.route).push(page);
        } else {
            roots.push(page);
        }
    }
    const activeRoutes = new Set([currentRoute]);
    let active = visible.find(page => page.route === currentRoute);
    while (active?.attributes.parent) {
        const parent = byTitle.get(active.attributes.parent);
        if (!parent) break;
        activeRoutes.add(parent.route);
        active = parent;
    }
    const link = page => {
        const href = page.route === '/' ? '/' : `${page.route}/`;
        const activeClass = activeRoutes.has(page.route) ? ' active' : '';
        const current = page.route === currentRoute ? ' aria-current="page"' : '';
        return `<a class="nav-link${activeClass}" href="${href}"${current}>${escapeHtml(page.title)}</a>`;
    };
    const render = (pagesAtLevel, depth = 0) => sortPages(pagesAtLevel).map(page => {
        const nested = children.get(page.route) || [];
        return `<li class="nav-item depth-${depth}">${link(page)}${nested.length ? `<ul class="nav-children">${render(nested, depth + 1)}</ul>` : ''}</li>`;
    }).join('\n');
    return `<ul class="nav-tree">${render(roots)}</ul>`;
}

function shell(page, content, nav) {
    const title = escapeHtml(page?.title || 'Necrobrowser docs');
    const current = page?.route || '/';
    const toc = page?.sections?.length ? `<aside class="page-toc" aria-label="On this page"><strong>On this page</strong><ul>${page.sections.filter(section => section.depth === 2).map(section => `<li><a href="#${section.id}">${escapeHtml(section.title)}</a></li>`).join('')}</ul></aside>` : '';
    const liveReload = `
<script>
(() => {
  let version = '';
  const poll = async () => {
    try {
      const next = await fetch('/__docs_version').then(response => response.text());
      if (version && next !== version) location.reload();
      version = next;
    } catch (_) {}
    setTimeout(poll, 1000);
  };
  poll();
})();
</script>`;
    const activeNav = nav;
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Necrobrowser</title>
<style>
:root{color-scheme:dark;--bg:#0d1117;--panel:#161b22;--panel2:#21262d;--text:#e6edf3;--muted:#8b949e;--accent:#58a6ff;--border:#30363d;--code:#0b1016}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:var(--accent)}
.layout{display:grid;grid-template-columns:280px minmax(0,860px) 180px;gap:40px;max-width:1440px;margin:0 auto;padding:32px 24px}.sidebar{position:sticky;top:24px;align-self:start;max-height:calc(100vh - 48px);overflow:auto}.brand{font-size:20px;font-weight:700;margin:0 0 20px}.brand a{color:var(--text);text-decoration:none}.nav-tree,.nav-children{list-style:none;margin:0;padding:0}.nav-children{margin-left:14px;border-left:1px solid var(--border)}.nav-link{display:block;border-left:2px solid transparent;color:var(--muted);padding:6px 12px;text-decoration:none}.nav-link:hover,.nav-link.active{background:var(--panel);border-left-color:var(--accent);color:var(--text)}.nav-link.active{font-weight:600}.nav-item.depth-0>.nav-link{font-weight:600;color:var(--text)}.page-toc{position:sticky;top:24px;align-self:start;border-left:1px solid var(--border);padding-left:14px;color:var(--muted);font-size:12px}.page-toc strong{color:var(--text);font-size:12px}.page-toc ul{list-style:none;margin:8px 0;padding:0}.page-toc li{margin:6px 0}.page-toc a{color:var(--muted);text-decoration:none}.page-toc a:hover{color:var(--accent)}.code-card{margin:18px 0;border:1px solid var(--border);border-radius:8px;overflow:hidden;background:var(--code)}.code-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--panel2);border-bottom:1px solid var(--border);padding:6px 10px}.code-language{color:var(--muted);font:12px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;text-transform:uppercase;letter-spacing:.06em}.copy-code{border:1px solid var(--border);border-radius:5px;background:var(--panel);color:var(--text);cursor:pointer;font:12px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:5px 9px}.copy-code:hover,.copy-code:focus-visible{border-color:var(--accent);outline:2px solid color-mix(in srgb,var(--accent) 35%,transparent);outline-offset:1px}.code-card pre{border:0;border-radius:0;margin:0}.code-card pre code{display:block;padding:16px}main{min-width:0;background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:38px 46px}h1,h2,h3{line-height:1.25;color:var(--text)}h1{font-size:36px;margin-top:0}h2{font-size:25px;margin-top:42px;border-bottom:1px solid var(--border);padding-bottom:8px}h3{font-size:19px;margin-top:28px}p,li{color:#c9d1d9}table{border-collapse:collapse;width:100%;display:block;overflow:auto;margin:18px 0}th,td{border:1px solid var(--border);padding:8px 12px;text-align:left;vertical-align:top}th{background:var(--panel2)}code{background:var(--code);border:1px solid var(--border);border-radius:5px;padding:2px 5px}pre{background:var(--code);border:1px solid var(--border);border-radius:8px;overflow:auto;padding:16px}pre code{border:0;padding:0;background:transparent}blockquote{border-left:3px solid var(--accent);margin:18px 0;padding:4px 16px;background:var(--panel2)}.topline{color:var(--muted);font-size:13px;margin-bottom:24px}.footer{color:var(--muted);border-top:1px solid var(--border);margin-top:48px;padding-top:16px;font-size:13px}
@media(max-width:1100px){.layout{grid-template-columns:240px minmax(0,860px)}.page-toc{display:none}}@media(max-width:800px){.layout{display:block;padding:16px}.sidebar{position:static;max-height:none;margin-bottom:16px}.nav{display:flex;gap:4px;overflow:auto;padding-bottom:8px}.nav-link{white-space:nowrap;border:1px solid var(--border);border-radius:6px;padding:5px 9px}.nav-link.active{border-color:var(--accent)}main{padding:24px 20px}h1{font-size:30px}}
</style>
<script>
(() => {
  const fallbackCopy = text => { const area = document.createElement('textarea'); area.value = text; area.setAttribute('readonly', ''); area.style.position = 'fixed'; area.style.opacity = '0'; document.body.appendChild(area); area.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (_) {} area.remove(); return ok; };
  document.addEventListener('click', async event => { const button = event.target.closest('.copy-code'); if (!button) return; const text = atob(button.dataset.code || ''); let ok = false; try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); ok = true; } } catch (_) {} if (!ok) ok = fallbackCopy(text); const original = button.textContent; button.textContent = ok ? 'Copied' : 'Copy failed'; setTimeout(() => { button.textContent = original; }, 1400); });
})();
</script>
</head>
<body><div class="layout"><aside class="sidebar"><p class="brand"><a href="/">Necrobrowser docs</a></p><nav class="nav" aria-label="Documentation">${activeNav}</nav></aside><main><div class="topline">Documentation · <a href="https://github.com/muraenateam/necrobrowser">GitHub</a></div>${content}<div class="footer">Local npm preview · source: docs/ · use Ctrl-C to stop</div></main>${toc}</div>${liveReload}</body></html>`;
}

function rewriteLinks(html) {
    return html.replace(/href="\/(?!\/|https?:)/g, 'href="/');
}

async function build() {
    const sourceFiles = walkMarkdown(docsRoot);
    const pages = sourceFiles.map(file => {
        const parsed = parseFrontMatter(fs.readFileSync(file, 'utf8'));
        const titleMatch = parsed.body.match(/^#\s+(.+)$/m);
        return {
            file,
            attributes: parsed.attributes,
            title: parsed.attributes.title || (titleMatch && titleMatch[1]) || path.basename(file, '.md'),
            route: routeFor(file, parsed.attributes),
            body: parsed.body,
            sections: []
        };
    });
    await fsp.rm(outputRoot, { recursive: true, force: true });
    await fsp.mkdir(outputRoot, { recursive: true });
    for (const page of pages) {
        const markdown = renderMarkdown(page.body);
        page.sections = markdown.sections;
        const rendered = rewriteLinks(markdown.html);
        const target = path.join(outputRoot, routeFile(page.route));
        await fsp.mkdir(path.dirname(target), { recursive: true });
        await fsp.writeFile(target, shell(page, rendered, navigation(pages, page.route)));
    }
    for (const assetDirectory of ['images']) {
        const source = path.join(docsRoot, assetDirectory);
        if (fs.existsSync(source)) await fsp.cp(source, path.join(outputRoot, assetDirectory), { recursive: true });
    }
    if (fs.existsSync(path.join(docsRoot, 'favicon.ico'))) await fsp.copyFile(path.join(docsRoot, 'favicon.ico'), path.join(outputRoot, 'favicon.ico'));
    buildVersion += 1;
    await fsp.writeFile(path.join(outputRoot, '__docs_version'), String(buildVersion));
    return pages.length;
}

function openBrowser() {
    if (process.env.DOCS_NO_OPEN === '1') return;
    const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    require('child_process').spawn(command, [siteUrl], { detached: true, stdio: 'ignore', shell: process.platform === 'win32' }).unref();
}

async function serve() {
    await build();
    const server = http.createServer(async (request, response) => {
        if (request.url === '/__docs_version') {
            response.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
            response.end(String(buildVersion));
            return;
        }
        const requested = decodeURIComponent((request.url || '/').split('?')[0]);
        const requestedRelative = requested.replace(/^\/+/, '');
        const hasExtension = path.extname(requestedRelative) !== '';
        const relative = requested === '/' ? 'index.html' : hasExtension ? requestedRelative : `${requestedRelative.replace(/\/$/, '')}/index.html`;
        const target = path.resolve(outputRoot, relative);
        if (!target.startsWith(`${outputRoot}${path.sep}`) && target !== path.join(outputRoot, 'index.html')) {
            response.writeHead(403); response.end('Forbidden'); return;
        }
        try {
            const content = await fsp.readFile(target);
            response.writeHead(200, { 'content-type': target.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream', 'cache-control': 'no-cache' });
            response.end(content);
        } catch (_) {
            response.writeHead(404, { 'content-type': 'text/plain' }); response.end('Not found');
        }
    });
    server.listen(port, host, () => {
        console.log(`Docs preview: ${siteUrl}`);
        openBrowser();
    });
    const watch = () => {
        try {
            fs.watch(docsRoot, { recursive: true }, async () => {
                try { await build(); console.log('Docs rebuilt'); } catch (error) { console.error(`Docs rebuild failed: ${error.message}`); }
            });
        } catch (_) { console.warn('Live reload unavailable on this platform; restart preview after edits.'); }
    };
    watch();
}

(async () => {
    const pages = await build();
    if (process.argv.includes('--build')) {
        console.log(`Built ${pages} documentation pages in ${path.relative(root, outputRoot)}`);
        return;
    }
    await serve();
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
