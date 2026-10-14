'use strict';

// A local web page that receives the benchmark's input. It records every key, character,
// pointer move, click and scroll with its own timestamps, so all libraries are measured
// the same way, at the receiving end. Commands go to the page over server-sent events;
// the page answers with POST requests.

const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const PAGE = fs.readFileSync(path.join(__dirname, 'page.html'), 'utf8');

function readJson(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                resolve(JSON.parse(body || 'null'));
            } catch (err) {
                reject(err);
            }
        });
    });
}

function openBrowser(url) {
    const [command, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]]
        : process.platform === 'darwin' ? ['open', [url]]
        : ['xdg-open', [url]];
    try {
        spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
    } catch {
        // The URL is printed, so it can be opened by hand.
    }
}

function start({ port = 0 } = {}) {
    let stream = null;
    let page = null;
    let onPage = null;
    let nextId = 1;
    const pending = new Map();

    const server = http.createServer(async (req, res) => {
        try {
            if (req.method === 'GET' && req.url === '/') {
                // Cross-origin isolation gives the page timestamps precise to a few microseconds.
                res.writeHead(200, {
                    'Content-Type': 'text/html; charset=utf-8',
                    'Cross-Origin-Opener-Policy': 'same-origin',
                    'Cross-Origin-Embedder-Policy': 'require-corp',
                    'Cache-Control': 'no-store'
                });
                res.end(PAGE);
            } else if (req.method === 'GET' && req.url === '/commands') {
                res.writeHead(200, {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-store',
                    Connection: 'keep-alive'
                });
                res.write(': connected\n\n');
                stream = res;
                req.on('close', () => {
                    if (stream === res) stream = null;
                });
            } else if (req.method === 'POST' && req.url === '/hello') {
                page = await readJson(req);
                res.end();
                if (onPage) onPage(page);
            } else if (req.method === 'POST' && req.url === '/reply') {
                const { id, data } = await readJson(req);
                res.end();
                const resolve = pending.get(id);
                pending.delete(id);
                if (resolve) resolve(data);
            } else {
                res.writeHead(404);
                res.end();
            }
        } catch {
            res.writeHead(400);
            res.end();
        }
    });

    return new Promise(resolve => {
        server.listen(port, '127.0.0.1', () => {
            const url = `http://127.0.0.1:${server.address().port}/`;

            resolve({
                url,
                open: () => openBrowser(url),

                /** Resolves with the page's size and settings once it has loaded. */
                page(timeoutMs) {
                    if (page && stream) return Promise.resolve(page);
                    return new Promise((done, fail) => {
                        const timer = setTimeout(() => fail(new Error('The benchmark page did not open.')), timeoutMs);
                        onPage = info => {
                            clearTimeout(timer);
                            // Give the command stream a moment to connect too.
                            const wait = () => (stream ? done(info) : setTimeout(wait, 50));
                            wait();
                        };
                    });
                },

                /** Sends a command to the page and resolves with its answer. */
                ask(cmd, args = {}, timeoutMs = 15000) {
                    if (!stream) return Promise.reject(new Error('The benchmark page is not connected.'));
                    const id = nextId++;
                    return new Promise((done, fail) => {
                        const timer = timeoutMs
                            ? setTimeout(() => {
                                pending.delete(id);
                                fail(new Error(`The benchmark page did not answer "${cmd}".`));
                            }, timeoutMs)
                            : null;
                        pending.set(id, data => {
                            if (timer) clearTimeout(timer);
                            done(data);
                        });
                        stream.write(`data: ${JSON.stringify({ id, cmd, args })}\n\n`);
                    });
                },

                close() {
                    if (stream) stream.end();
                    server.close();
                    if (server.closeAllConnections) server.closeAllConnections();
                }
            });
        });
    });
}

module.exports = { start };
