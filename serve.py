#!/usr/bin/env python3
"""Dev server for the game.

`python3 -m http.server` will not do any more. Its listen backlog is 5, and the
browser opens the whole ES-module graph at once — well over twenty sockets
before the first one is answered. The kernel drops the overflow, Chrome reports
ERR_CONNECTION_RESET on whichever module lost the race, the import graph never
resolves and the page sits on "LOADING DATA… 0 %" with nothing on screen.
Threaded, with a deep backlog, and no caching so a reload always gets the file
that is on disk.

    python3 serve.py [port]        # default 8000
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # The cache-busting ?v= tags only cover the modules. Assets, and any
        # module whose tag was not bumped, must not come back from the cache
        # while a change is being looked at.
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, fmt, *args):
        # Only the failures; a full asset log buries them.
        status = str(args[1]) if len(args) > 1 else ''
        if not status.startswith('2'):
            sys.stderr.write(f'{self.address_string()} {fmt % args}\n')


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 128     # the whole point


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server = Server(('127.0.0.1', port), partial(Handler, directory=str(ROOT)))
    print(f'serving {ROOT} on http://127.0.0.1:{port}/index.html', flush=True)
    server.serve_forever()
