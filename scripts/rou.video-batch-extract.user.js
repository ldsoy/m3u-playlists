// ==UserScript==
// @name         rou.video 批量 m3u 导出 v5 (封面+翻页+标题清理)
// @namespace    http://tampermonkey.net/
// @version      5.0
// @description  自动翻页收集视频，iframe 提取 m3u8 + 封面，生成带 tvg-logo 的 playlist.m3u
// @match        *://rou.video/search*
// @match        *://rou.video/t/*
// @match        *://rou.video/v/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const IS_SEARCH = location.pathname.startsWith('/search') || location.pathname.startsWith('/t/');
    const IS_VIDEO  = location.pathname.startsWith('/v/');
    const IS_IFRAME = window.self !== window.top;

    // ============================================================
    // Part A: 视频页 — hook JSON.parse 捕获 m3u8，iframe 内回传
    // ============================================================
    if (IS_VIDEO) {
        const _ctor = Function.prototype.constructor;
        Function.prototype.constructor = function(...args) {
            if (args && args.some(a => typeof a === 'string' && a.includes('debugger')))
                return function(){};
            return _ctor.apply(this, args);
        };

        const originalParse = JSON.parse;
        JSON.parse = function(text, reviver) {
            if (typeof text === 'string' && text.includes('auth=')) {
                const fileMatch = text.match(/([^"'\\]+\/(?:index\.jpg|.*\.m3u8)\?[^"'\\]*auth=[^"'\\]+)/);
                const baseMatch = text.match(/(https?:\/\/[^"'\\]+\/hls\/[^"'\\]+\/)/);
                const titleMatch = text.match(/"title"\s*:\s*"([^"\\]+)"/);

                if (fileMatch) {
                    let file = fileMatch[1].replace(/\\/g, '');
                    let realUrl = '';
                    if (file.startsWith('http')) {
                        realUrl = file;
                    } else if (baseMatch) {
                        const base = baseMatch[1].replace(/\\/g, '').replace(/\/thumbs\/$/, '/');
                        realUrl = base + file;
                    }
                    if (realUrl) {
                        realUrl = realUrl.replace(/index\.jpg/, 'index.m3u8');

                        let title = (titleMatch ? titleMatch[1] : document.title || '');
                        title = title
                            .replace(/\s*-\s*肉[视視][频頻],您的私人AV影院.*$/, '')
                            .replace(/\s*-\s*肉[视視][频頻].*$/, '')
                            .trim();

                        if (IS_IFRAME) {
                            window.parent.postMessage({
                                type: 'ROU_M3U8_DATA',
                                title: title,
                                url: realUrl
                            }, '*');
                        }
                    }
                }
            }
            return originalParse.call(this, text, reviver);
        };
        return;
    }

    // ============================================================
    // Part B: 搜索页 / 标签页 — 面板 + 翻页 + 批量提取
    // ============================================================
    if (!IS_SEARCH) return;

    // 注入面板
    const panel = document.createElement('div');
    panel.innerHTML = `
    <div id="m3u-batch-panel" style="position:fixed;bottom:20px;right:20px;z-index:99999;
        background:#1a1a1a;border:1px solid #444;border-radius:10px;padding:16px;
        width:360px;font-family:monospace;color:#ccc;box-shadow:0 4px 20px rgba(0,0,0,0.6);">
        <div style="font-size:14px;color:#00ff00;margin-bottom:8px;font-weight:bold;">M3U 批量提取 v5</div>
        <div id="m3u-status" style="font-size:12px;margin-bottom:6px;">
            当前页: <b id="m3u-count" style="color:#00ff00;">检测中...</b> 个视频
        </div>
        <div id="m3u-log" style="font-size:11px;color:#888;max-height:80px;overflow-y:auto;margin-bottom:8px;word-break:break-all;"></div>
        <div id="m3u-bar-bg" style="display:none;height:4px;background:#333;border-radius:2px;margin-bottom:8px;">
            <div id="m3u-bar" style="height:100%;width:0;background:#00ff00;border-radius:2px;"></div>
        </div>
        <button id="m3u-btn" style="width:100%;padding:10px;background:#00ff00;color:#000;
            border:none;border-radius:6px;font-size:14px;font-weight:bold;cursor:pointer;">开始提取（含翻页）</button>
        <div id="m3u-result" style="display:none;margin-top:10px;">
            <textarea id="m3u-text" readonly style="width:100%;height:130px;background:#000;color:#0f0;
                border:1px solid #333;border-radius:4px;font-size:11px;resize:none;padding:6px;
                box-sizing:border-box;"></textarea>
            <button id="m3u-dl" style="width:100%;margin-top:6px;padding:8px;background:#1e90ff;
                color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;">下载 .m3u</button>
        </div>
    </div>`;
    document.body.appendChild(panel.firstElementChild);

    const btn    = document.getElementById('m3u-btn');
    const status = document.getElementById('m3u-status');
    const logEl  = document.getElementById('m3u-log');
    const barBg  = document.getElementById('m3u-bar-bg');
    const bar    = document.getElementById('m3u-bar');
    const result = document.getElementById('m3u-result');
    const textEl = document.getElementById('m3u-text');
    const dlBtn  = document.getElementById('m3u-dl');

    function log(msg) {
        logEl.innerHTML += msg + '<br>';
        logEl.scrollTop = logEl.scrollHeight;
    }

    // 先显示当前页链接数
    (function countCurrent() {
        const seen = new Set();
        document.querySelectorAll('a[href^="/v/"]').forEach(a => {
            const href = a.getAttribute('href');
            if (href && href !== '/v/') seen.add(href);
        });
        document.getElementById('m3u-count').textContent = seen.size;
    })();

    // 从 DOM 构建 { /v/xxx: coverUrl } 映射
    function buildCoverMap(doc) {
        const map = {};
        doc.querySelectorAll('a[href^="/v/"]').forEach(a => {
            const href = a.getAttribute('href');
            if (!href || href === '/v/' || map[href]) return;
            // 往上找卡片容器，再往下找 img
            const card = a.closest('[data-slot="card"]') || a.parentElement;
            if (card) {
                const img = card.querySelector('img');
                if (img && img.src) map[href] = img.src;
            }
        });
        return map;
    }

    // 翻页收集所有搜索结果的视频链接 + 封面
    async function collectAllSearchLinks() {
        const baseUrl = new URL(location.href);
        const allURLs = new Set();
        const coverMap = {};  // { /v/xxx: coverUrl }

        // 第一页从当前 DOM 拿链接 + 封面
        Object.assign(coverMap, buildCoverMap(document));
        document.querySelectorAll('a[href^="/v/"]').forEach(a => {
            const href = a.getAttribute('href');
            if (href && href !== '/v/') allURLs.add('https://rou.video' + href);
        });
        log(`第1页: ${allURLs.size} 个`);

        // 后续页通过隐藏 iframe 加载
        let page = 2;
        while (page <= 20) {
            const pageUrl = new URL(baseUrl);
            pageUrl.searchParams.set('page', page);
            log(`翻页: 第 ${page} 页...`);

            const result = await new Promise(resolve => {
                const iframe = document.createElement('iframe');
                iframe.src = pageUrl.toString();
                iframe.style.cssText = 'position:fixed;top:-9999px;width:1px;height:1px;border:none;';
                let done = false;
                const finish = () => {
                    if (done) return;
                    done = true;
                    try {
                        const doc = iframe.contentDocument || iframe.contentWindow.document;
                        const map = buildCoverMap(doc);
                        const items = [];
                        doc.querySelectorAll('a[href^="/v/"]').forEach(a => {
                            const href = a.getAttribute('href');
                            if (href && href !== '/v/') items.push('https://rou.video' + href);
                        });
                        resolve({ links: items, covers: map });
                    } catch(e) {
                        resolve({ links: [], covers: {} });
                    }
                    setTimeout(() => iframe.remove(), 500);
                };
                iframe.onload = finish;
                document.body.appendChild(iframe);
                setTimeout(() => finish(), 8000);
            });

            if (result.links.length === 0) {
                log(`第 ${page} 页无结果，停止翻页`);
                break;
            }

            result.links.forEach(l => allURLs.add(l));
            Object.assign(coverMap, result.covers);
            log(`第 ${page} 页: +${result.links.length} 个，累计 ${allURLs.size} 个`);
            page++;
        }

        return [...allURLs].map(url => ({
            href: url,
            title: url.split('/').pop() || '',
            cover: coverMap[url.replace('https://rou.video', '')] || ''
        }));
    }

    let links = [];

    // 主按钮
    btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = '翻页中...';
        btn.style.background = '#555';
        btn.style.color = '#fff';
        logEl.innerHTML = '';
        barBg.style.display = 'block';
        bar.style.width = '0%';
        result.style.display = 'none';

        // Step 1: 翻页收集
        links = await collectAllSearchLinks();
        document.getElementById('m3u-count').textContent = links.length;

        if (links.length === 0) {
            log('没有找到任何视频链接');
            btn.textContent = '重试';
            btn.style.background = '#00ff00';
            btn.style.color = '#000';
            btn.disabled = false;
            return;
        }

        // Step 2: 逐个 iframe 提取 m3u8
        const dataList = [];

        function extractOne(item) {
            return new Promise(resolve => {
                const iframe = document.createElement('iframe');
                iframe.src = item.href;
                iframe.style.cssText = 'position:fixed;top:-9999px;width:1px;height:1px;border:none;';
                let done = false;

                const finish = (payload) => {
                    if (done) return;
                    done = true;
                    window.removeEventListener('message', handler);
                    setTimeout(() => iframe.remove(), 500);
                    resolve(payload);
                };

                const handler = (e) => {
                    if (e.data && e.data.type === 'ROU_M3U8_DATA') finish(e.data);
                };
                window.addEventListener('message', handler);
                document.body.appendChild(iframe);
                setTimeout(() => finish(null), 15000);
            });
        }

        for (let i = 0; i < links.length; i++) {
            bar.style.width = Math.round(i / links.length * 100) + '%';
            status.textContent = `[${i+1}/${links.length}] ${links[i].title}`;

            const data = await extractOne(links[i]);
            if (data) {
                dataList.push(data);
                log(`<span style="color:#0f0;">+</span> ${data.title.substring(0,35)}`);
            } else {
                log(`<span style="color:#f66;">-</span> ${links[i].href.split('/').pop()} (超时)`);
            }

            await new Promise(r => setTimeout(r, 2000));
        }

        bar.style.width = '100%';
        status.textContent = `完成: ${dataList.length}/${links.length}`;
        btn.textContent = '重新提取';
        btn.style.background = '#00ff00';
        btn.style.color = '#000';
        btn.disabled = false;

        if (dataList.length === 0) {
            log('未能提取到任何视频');
            return;
        }

        // Step 3: 生成 m3u（带封面）
        let m3u = '#EXTM3U\n';
        dataList.forEach(d => {
            // 从 m3u8 URL 提取视频 ID 用于匹配封面
            const vidMatch = d.url.match(/\/hls\/([a-zA-Z0-9_-]+)\//);
            const vid = vidMatch ? vidMatch[1] : '';
            // 在当前收集的 links 中找封面
            let cover = '';
            for (const l of links) {
                if (l.href.endsWith('/' + vid)) { cover = l.cover; break; }
            }
            if (cover) {
                m3u += `#EXTINF:0 tvg-logo="${cover}",${d.title}\n${d.url}\n`;
            } else {
                m3u += `#EXTINF:0,${d.title}\n${d.url}\n`;
            }
        });

        textEl.value = m3u;
        result.style.display = 'block';

        dlBtn.onclick = () => {
            const blob = new Blob([m3u], { type: 'application/x-mpegURL' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'rou_video_search.m3u';
            a.click();
            URL.revokeObjectURL(url);
        };
    });

})();
