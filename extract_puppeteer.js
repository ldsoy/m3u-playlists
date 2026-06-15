const puppeteer = require('puppeteer');

const VIDEO_IDS = [
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
];

(async () => {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const results = [];

    for (let i = 0; i < VIDEO_IDS.length; i++) {
        const vid = VIDEO_IDS[i];
        process.stdout.write(`[${i+1}/${VIDEO_IDS.length}] ${vid}... `);

        try {
            const page = await browser.newPage();

            let captured = null;

            // Hook JSON.parse BEFORE navigation
            await page.evaluateOnNewDocument(() => {
                const origParse = JSON.parse;
                JSON.parse = function(text, reviver) {
                    if (typeof text === 'string' && text.includes('auth=')) {
                        const fm = text.match(/([^"'\\]+\/(?:index\.jpg|.*\.m3u8)\?[^"'\\]*auth=[^"'\\]+)/);
                        const bm = text.match(/(https?:\/\/[^"'\\]+\/hls\/[^"'\\]+\/)/);
                        const tm = text.match(/"title"\s*:\s*"([^"\\]+)"/);
                        if (fm) {
                            let f = fm[1].replace(/\\/g, '');
                            let u = '';
                            if (f.startsWith('http')) u = f;
                            else if (bm) u = bm[1].replace(/\\/g, '').replace(/\/thumbs\/$/, '/') + f;
                            if (u) {
                                u = u.replace('index.jpg', 'index.m3u8');
                                window.__ROU_CAP__ = { u: u, t: tm ? tm[1] : '' };
                            }
                        }
                    }
                    return origParse.call(this, text, reviver);
                };
            });

            // Navigate
            await page.goto(`https://rou.video/v/${vid}`, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            // Wait a bit more for dynamic content
            await new Promise(r => setTimeout(r, 3000));

            // Check captured data
            captured = await page.evaluate(() => {
                if (window.__ROU_CAP__) {
                    return { u: window.__ROU_CAP__.u, t: window.__ROU_CAP__.t };
                }
                return null;
            });

            if (captured) {
                let title = captured.t || '';
                title = title.replace(/\s*-\s*肉视[频頻],您的私人AV影院.*$/, '')
                             .replace(/\s*-\s*肉视[频頻].*$/, '')
                             .trim();
                results.push({ title, url: captured.u });
                console.log(`OK: ${title.substring(0,40)}`);
            } else {
                console.log('SKIP (no m3u8 data)');
            }

            await page.close();
        } catch (e) {
            console.log(`ERR: ${e.message}`);
        }

        await new Promise(r => setTimeout(r, 2000));
    }

    await browser.close();

    // Generate m3u
    let m3u = '#EXTM3U\n';
    results.forEach(r => {
        m3u += `#EXTINF:0,${r.title}\n${r.url}\n`;
    });

    console.log(`\n=== ${results.length}/${VIDEO_IDS.length} videos extracted ===`);
    console.log(m3u);

    require('fs').writeFileSync('rou_video_laofanqie.m3u', m3u, 'utf-8');
    console.log('\nSaved to rou_video_laofanqie.m3u');
})();
