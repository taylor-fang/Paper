#!/usr/bin/env node
// Paper: serves the writing page and keeps everything in plain files.
//
//   ~/Paper/page.html        the page (opens in any browser)
//   ~/Paper/page.md          the same page as markdown, kept up to date as you type
//   ~/Paper/notes.txt        side bar notes
//   ~/Paper/todo.md          side bar to-dos, as "- [ ]" lines
//   ~/Paper/days/*.html|.md  daily pages, when that option is on
//   ~/Paper/.history/<date>/ each file as it was before that day's first change
//
// Export to Word uses macOS's built-in textutil.
//
// Run: node server.js [--port 4610] [--dir ~/Paper]

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

const arg = (name, fallback) => {
  const i = process.argv.indexOf('--' + name);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const PORT = Number(arg('port', 4610));
const DIR = path.resolve(arg('dir', path.join(os.homedir(), 'Paper')));
const APP = __dirname;

const NAMED = { page: 'page.html', notes: 'notes.txt', todo: 'todo.md' };
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const PAPER = /^paper-[a-z0-9]+$/; // further papers, saved in ~/Paper/papers

function fileFor(name) {
  if (NAMED[name]) return path.join(DIR, NAMED[name]);
  if (DAY.test(name)) return path.join(DIR, 'days', name + '.html');
  if (PAPER.test(name)) return path.join(DIR, 'papers', name + '.html');
  return null;
}
const isPage = (name) => name === 'page' || DAY.test(name) || PAPER.test(name);

// a paper's first line, as plain text, for the list of papers
// a paper's writing from the top, a line per paragraph, blank lines kept (for its tiny page)
function firstLine(html) {
  const decode = (t) => t.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  const lines = [...unwrap(html).replace(/<sup class="fn"[^>]*>[\s\S]*?<\/sup>/g, '').matchAll(/<(p|li)[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => decode(m[2]));
  return lines.join('\n').replace(/\s+$/, '').slice(0, 600);
}

// pages are saved as complete HTML documents, so they open on their own
const START = '<!-- paper:start -->';
const END = '<!-- paper:end -->';
const wrap = (body) => `<!doctype html>
<meta charset="utf-8">
<title>Paper</title>
<style>body{max-width:34em;margin:12vh auto;padding:0 16px;font:20px/1.55 "Times New Roman",serif;color:#000;background:#f3efe6}sup.fn{font-size:.62em;color:#978972}</style>
${START}
${body}
${END}
`;
function unwrap(text) {
  const a = text.indexOf(START);
  const b = text.lastIndexOf(END);
  return a > -1 && b > a ? text.slice(a + START.length, b).trim() : text;
}

const today = () => new Date().toLocaleDateString('en-CA');

function backup(file) {
  if (!fs.existsSync(file)) return;
  const dest = path.join(DIR, '.history', today(), path.relative(DIR, file));
  if (fs.existsSync(dest)) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(file, dest);
}

function write(file, text, keepHistory = true) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (keepHistory) backup(file);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

function send(res, status, body = '', type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 20 * 1024 * 1024) { reject(new Error('too large')); req.destroy(); }
      else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  // only answer to this machine, by name, so other sites can't reach in
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '')) return send(res, 403, 'forbidden');
  const url = new URL(req.url, 'http://localhost');

  try {
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      return send(res, 200, fs.readFileSync(path.join(APP, 'index.html')), 'text/html; charset=utf-8');
    }

    // the side bar's handwriting font and drawn marks
    const asset = url.pathname.match(/^\/assets\/([\w-]+\.(png|css))$/);
    if (req.method === 'GET' && asset) {
      const type = asset[2] === 'png' ? 'image/png' : 'text/css; charset=utf-8';
      try { return send(res, 200, fs.readFileSync(path.join(APP, 'assets', asset[1])), type); } catch { return send(res, 404, 'not found'); }
    }

    if (req.method === 'GET' && url.pathname === '/api/papers') {
      const list = [];
      const add = (name, file) => {
        try { list.push({ name, first: firstLine(fs.readFileSync(file, 'utf8')), modified: fs.statSync(file).mtimeMs }); } catch {}
      };
      add('page', path.join(DIR, 'page.html'));
      try {
        for (const f of fs.readdirSync(path.join(DIR, 'papers'))) {
          const name = f.replace(/\.html$/, '');
          if (f.endsWith('.html') && PAPER.test(name)) add(name, path.join(DIR, 'papers', f));
        }
      } catch {}
      return send(res, 200, JSON.stringify(list), 'application/json');
    }

    if (req.method === 'GET' && url.pathname === '/api/days') {
      let days = [];
      try { days = fs.readdirSync(path.join(DIR, 'days')).filter((f) => f.endsWith('.html')).map((f) => f.slice(0, -5)); } catch {}
      return send(res, 200, JSON.stringify(days.filter((d) => DAY.test(d)).sort()), 'application/json');
    }

    // export to word: macOS's textutil turns the page's HTML into a .docx
    if (req.method === 'POST' && url.pathname === '/api/export/docx') {
      if (req.headers['x-paper'] !== '1') return send(res, 403, 'forbidden');
      const font = { inter: 'Inter', helvetica: 'Helvetica Neue', palatino: 'Palatino' }[url.searchParams.get('font')] || 'Times New Roman';
      const body = await readBody(req);
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paper-'));
      const html = path.join(tmp, 'page.html');
      const docx = path.join(tmp, 'page.docx');
      fs.writeFileSync(html, `<!doctype html><meta charset="utf-8"><style>body{font-family:"${font}";font-size:12px}p,ul,ol{margin:0 0 8px}</style>${body}`);
      execFile('textutil', ['-convert', 'docx', '-format', 'html', html, '-output', docx], (err) => {
        try {
          if (err) throw err;
          res.writeHead(200, { 'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'cache-control': 'no-store' });
          res.end(fs.readFileSync(docx));
        } catch (e) {
          send(res, 500, String(e.message || e));
        } finally {
          fs.rmSync(tmp, { recursive: true, force: true });
        }
      });
      return;
    }

    // a markdown copy of each page, written next to it
    const md = url.pathname.match(/^\/api\/markdown\/([\w-]+)$/);
    if (md && req.method === 'PUT' && isPage(md[1])) {
      if (req.headers['x-paper'] !== '1') return send(res, 403, 'forbidden');
      write(fileFor(md[1]).replace(/\.html$/, '.md'), await readBody(req), false);
      return send(res, 204);
    }

    const m = url.pathname.match(/^\/api\/files\/([\w-]+)$/);
    if (m) {
      const name = m[1];
      const file = fileFor(name);
      if (!file) return send(res, 404, 'unknown file');

      if (req.method === 'GET') {
        let text = '';
        try { text = fs.readFileSync(file, 'utf8'); } catch {}
        return send(res, 200, isPage(name) ? unwrap(text) : text);
      }
      if (req.method === 'PUT') {
        if (req.headers['x-paper'] !== '1') return send(res, 403, 'forbidden');
        const body = await readBody(req);
        write(file, isPage(name) ? wrap(body) : body);
        return send(res, 204);
      }
      // Delete from the tiny pages: the paper moves to ~/Paper/.trash, where it can be got back
      if (req.method === 'DELETE' && PAPER.test(name) && url.searchParams.get('trash') === '1') {
        if (req.headers['x-paper'] !== '1') return send(res, 403, 'forbidden');
        const bin = path.join(DIR, '.trash');
        fs.mkdirSync(bin, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        for (const f of [file, file.replace(/\.html$/, '.md')]) {
          try { fs.renameSync(f, path.join(bin, path.basename(f).replace(/(\.\w+)$/, ` ${stamp}$1`))); } catch {}
        }
        return send(res, 204);
      }
      // a blank paper is removed (never the first page, and never one with anything written on it)
      if (req.method === 'DELETE' && PAPER.test(name)) {
        if (req.headers['x-paper'] !== '1') return send(res, 403, 'forbidden');
        let text = '';
        try { text = fs.readFileSync(file, 'utf8'); } catch { return send(res, 204); }
        if (unwrap(text).replace(/<[^>]+>/g, '').replace(/&nbsp;|&#8203;|[\s\u00a0\u200b]/g, '')) return send(res, 409, 'not blank');
        for (const f of [file, file.replace(/\.html$/, '.md')]) { try { fs.unlinkSync(f); } catch {} }
        return send(res, 204);
      }
    }

    send(res, 404, 'not found');
  } catch (err) {
    console.error(err);
    send(res, 500, String(err.message || err));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Paper on http://localhost:${PORT}, saving to ${DIR}`);
});
