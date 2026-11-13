#!/usr/bin/env python3
"""Daily check: are insurer websites reachable, and have the rate sources published an update?
Writes data/status.json. Information only; it never changes the rate numbers by itself."""
import json, re, datetime, urllib.request, urllib.error, ssl, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
data = json.load(open(os.path.join(ROOT, "data", "insurers.json")))

def get(url, read=False):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,*/*"})
    try:
        with urllib.request.urlopen(req, timeout=25, context=ssl.create_default_context()) as r:
            body = r.read(1_500_000).decode("utf-8", "ignore") if read else ""
            return r.status, body
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception:
        return 0, ""

def state(code):
    if 200 <= code < 400: return "up"
    if code in (401, 403, 405, 429, 202): return "blocked"   # site is online but blocks automatic checks
    if code == 0: return "unknown"
    return "error"

now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
sites = {}
for ins in data["insurers"]:
    code, _ = get(ins["quote"])
    if not (200 <= code < 400):
        code2, _ = get(ins["site"])
        if 200 <= code2 < 400: code = code2
    sites[ins["id"]] = {"code": code, "state": state(code)}

PATTERNS = [
    r"Updated:?\s+([A-Z][a-z]{2,8}\.? \d{1,2}, \d{4})",
    r"Last updated:?\s+([A-Z][a-z]{2,8}\.? \d{1,2}, \d{4})",
]
def parse_date(s):
    for fmt in ("%B %d, %Y", "%b %d, %Y", "%b. %d, %Y"):
        try: return datetime.datetime.strptime(s, fmt).date().isoformat()
        except ValueError: pass
    return None

sources = {}
for key in ("mg", "nw", "icom", "jdp"):
    src = data["sources"][key]
    code, body = get(src["url"], read=True)
    text = re.sub(r"<[^>]+>", " ", body)
    text = re.sub(r"\s+", " ", text)
    found = None
    for p in PATTERNS:
        m = re.search(p, text)
        if m:
            found = parse_date(m.group(1))
            if found: break
    sources[key] = {"code": code, "state": state(code), "pageUpdated": found,
                    "inApp": src.get("updated"),
                    "newer": bool(found and src.get("updated") and found > src["updated"])}

json.dump({"checked": now, "sites": sites, "sources": sources},
          open(os.path.join(ROOT, "data", "status.json"), "w"), indent=1)
print(json.dumps(sources, indent=1))
