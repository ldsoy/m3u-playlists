"""
rou.video m3u8 extractor via Chrome DevTools Protocol v2
Key fix: Page.addScriptToEvaluateOnNewDocument for persistent JSON.parse hook
"""
import json
import urllib.request
import websocket
import time

CDP_HOST = "http://localhost:9222"

def cdp_send(ws, method, params=None):
    msg_id = cdp_send._id
    cdp_send._id += 1
    payload = {"id": msg_id, "method": method}
    if params:
        payload["params"] = params
    ws.send(json.dumps(payload))
    return msg_id
cdp_send._id = 1

def cdp_wait_for_id(ws, expected_id, timeout=30):
    start = time.time()
    while time.time() - start < timeout:
        try:
            ws.settimeout(timeout - (time.time() - start))
            msg = json.loads(ws.recv())
            if msg.get("id") == expected_id:
                return msg
        except:
            pass
    return None

def cdp_read_events(ws, timeout=5):
    """Read all available events/messages with timeout"""
    events = []
    start = time.time()
    while time.time() - start < timeout:
        try:
            remaining = timeout - (time.time() - start)
            if remaining <= 0:
                break
            ws.settimeout(remaining)
            msg = json.loads(ws.recv())
            events.append(msg)
        except:
            break
    return events

def create_target():
    req = urllib.request.Request(f"{CDP_HOST}/json/new", method="PUT")
    resp = urllib.request.urlopen(req, timeout=5)
    data = json.loads(resp.read())
    return data["webSocketDebuggerUrl"], data["id"]

def close_target(target_id):
    try:
        req = urllib.request.Request(f"{CDP_HOST}/json/close/{target_id}")
        urllib.request.urlopen(req, timeout=5)
    except:
        pass

def extract_m3u8_for_video(video_id):
    ws_url, target_id = create_target()
    ws = websocket.create_connection(ws_url, timeout=30)
    
    captured = {"url": None, "title": None}
    
    # Enable domains
    cdp_send(ws, "Runtime.enable")
    cdp_send(ws, "Page.enable")
    cdp_send(ws, "Network.enable")
    
    # KEY FIX: addScriptToEvaluateOnNewDocument runs BEFORE any page scripts
    # This is how Tampermonkey's @run-at document-start works under the hood
    cdp_send(ws, "Page.addScriptToEvaluateOnNewDocument", {
        "source": """
(function() {
    const origParse = JSON.parse;
    JSON.parse = function(text, reviver) {
        if (typeof text === 'string' && text.indexOf('auth=') !== -1) {
            try {
                var match = text.match(/([^"'\\\\]+\\/(?:index\\\\.jpg|.*\\\\.m3u8)\\\\?[^"'\\\\]*auth=[^"'\\\\]+)/);
                if (match) {
                    var file = match[1].replace(/\\\\/g, '');
                    var realUrl = '';
                    if (file.indexOf('http') === 0) {
                        realUrl = file;
                    } else {
                        var baseMatch = text.match(/(https?:\\/\\/[^"'\\\\]+\\/hls\\/[^"'\\\\]+\\/)/);
                        if (baseMatch) {
                            var base = baseMatch[1].replace(/\\\\/g, '').replace(/\\/thumbs\\/$/, '/');
                            realUrl = base + file;
                        }
                    }
                    if (realUrl) {
                        realUrl = realUrl.replace('index.jpg', 'index.m3u8');
                        var titleMatch = text.match(/"title"\\s*:\\s*"([^"\\\\]+)"/);
                        var title = titleMatch ? titleMatch[1] : '';
                        window.__ROU_CAPTURE__ = {u: realUrl, t: title};
                    }
                }
            } catch(e) {}
        }
        return origParse.call(this, text, reviver);
    };
})();
"""
    })
    
    # Navigate to video page
    video_url = f"https://rou.video/v/{video_id}"
    nav_id = cdp_send(ws, "Page.navigate", {"url": video_url})
    cdp_wait_for_id(ws, nav_id, timeout=30)
    
    # Wait for page to load and JS to execute (with network monitoring)
    loaded = False
    for _ in range(20):  # Max 20 seconds
        time.sleep(1)
        # Check captured data
        check_id = cdp_send(ws, "Runtime.evaluate", {
            "expression": "window.__ROU_CAPTURE__ ? JSON.stringify(window.__ROU_CAPTURE__) : null",
            "returnByValue": True
        })
        result = cdp_wait_for_id(ws, check_id, timeout=3)
        if result:
            val = result.get("result", {}).get("result", {}).get("value")
            if val and val != "null":
                data = json.loads(val)
                captured = {"url": data.get("u"), "title": data.get("t")}
                loaded = True
                break
    
    if not loaded:
        print(f"    (waited 20s, no capture)", flush=True)
    
    ws.close()
    try:
        close_target(target_id)
    except:
        pass
    
    return captured


if __name__ == "__main__":
    video_ids = [
        "cmbd5dbho0000s6zuzg7a4f5v", "cmlel04gp0000s61mpoiwx7k6",
        "cmlpis6lv0000s6pi9pz6sush", "cmdqt4dkw0000s6e9o2mrvq6h",
        "cml7kc6x90000s6amw5d2sw1p", "cmlbr1hsy0000s6xb57wj9k0s",
        "cmlg172w90000s6q37o4izsah", "cmlkc4xf30000s6d9xm2o45lb",
        "cmmacdaw10000s6ql1gp3g18x", "cmmckwvj10000s68vs8g7szpr",
        "cmb1xcge30000s6c8kljsdlk4", "cmcppa5ej0000s61umr7gapco",
        "cmcskcteb0000s6yi0w61uh09", "cmdj2pgz90000s68znjdajzrr",
        "cmpfuegj30000s6hf0g0zl8ez", "cmbvnzqo50000s63bgq5my2md",
        "cmd9nv0ag0000s64s0dwgeyxd", "cmln8ld0j0000s6ys79nn8ed4",
        "cmmu9i9lt0000s6nv9xblw6h9", "cmnj8qc4a0000s6cg6visqt8y",
        "cmn7u4hcq0000s6aegtcvvtrd", "ckrvhecej02565mq9qn4ezs0h",
        "cks39u57m00285onv6ujjoe9l", "cm6kax514000wmubkpawfvqb6",
        "cm2ipmozu0000vns8phxztyve", "cljxjf79g0002cm1gpiv79c96",
    ]
    
    results = []
    for i, vid in enumerate(video_ids):
        print(f"[{i+1}/{len(video_ids)}] {vid}...", flush=True)
        try:
            data = extract_m3u8_for_video(vid)
            if data and data.get("url"):
                # Clean title
                title = (data.get("title") or "")
                title = title.replace("\u8089\u8996\u983b,\u60a8\u7684\u79c1\u4ebaAV\u5f71\u9662", "")
                title = title.replace("\u8089\u8996\u9891,\u60a8\u7684\u79c1\u4ebaAV\u5f71\u9662", "")
                title = title.strip().rstrip("-").strip()
                results.append({"title": title, "url": data["url"]})
                print(f"  OK: {title[:50]}", flush=True)
            else:
                print(f"  SKIP", flush=True)
        except Exception as e:
            print(f"  ERR: {e}", flush=True)
        time.sleep(2)  # Rate limit
    
    # Generate m3u
    m3u = "#EXTM3U\n"
    for r in results:
        m3u += f"#EXTINF:0,{r['title']}\n{r['url']}\n"
    
    print(f"\n=== {len(results)}/{len(video_ids)} videos ===")
    
    with open("rou_video_laofanqie.m3u", "w", encoding="utf-8") as f:
        f.write(m3u)
    print("Saved to rou_video_laofanqie.m3u")
    
    if results:
        print("\n--- Preview ---")
        print(m3u[:500])
