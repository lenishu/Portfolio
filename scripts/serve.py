"""Local preview server that never lets the browser reuse stale files.

Python's built-in http.server sends no Cache-Control header, so browsers may keep
serving an old page for minutes after it changes. This one marks every response
no-cache and serves the site folder regardless of where it is launched from.

    python scripts/serve.py            # http://127.0.0.1:8000
    python scripts/serve.py 8080
"""
import functools, http.server, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, must-revalidate')
        super().end_headers()


if __name__ == '__main__':
    handler = functools.partial(NoCache, directory=ROOT)
    with http.server.ThreadingHTTPServer(('127.0.0.1', PORT), handler) as server:
        print(f'Serving {ROOT} at http://127.0.0.1:{PORT}/  (Ctrl+C to stop)')
        server.serve_forever()
