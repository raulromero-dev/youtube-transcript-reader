// Deeper debug: extract full baseUrl and test it

const VIDEO_ID = "GZB6T8QOcFs";

async function test() {
  const res = await fetch(`https://www.youtube.com/watch?v=${VIDEO_ID}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
      Cookie: "CONSENT=YES+1",
    },
  });
  const html = await res.text();

  // Extract ytInitialPlayerResponse with brace counting
  const marker = "var ytInitialPlayerResponse = ";
  const markerIdx = html.indexOf(marker);
  const jsonStart = markerIdx + marker.length;
  let depth = 0, inString = false, escape = false, endIdx = -1;
  for (let i = jsonStart; i < html.length; i++) {
    const ch = html[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) { endIdx = i + 1; break; } }
  }

  const data = JSON.parse(html.substring(jsonStart, endIdx));
  const track = data.captions.playerCaptionsTracklistRenderer.captionTracks[0];
  
  console.log("Full baseUrl:");
  console.log(track.baseUrl);
  console.log("\nURL length:", track.baseUrl.length);
  
  // Parse URL params
  const url = new URL(track.baseUrl);
  console.log("\nURL params:");
  for (const [k, v] of url.searchParams) {
    console.log(`  ${k} = ${v.slice(0, 80)}`);
  }

  // Test fetching with full URL
  console.log("\n--- Fetching with full baseUrl ---");
  const r1 = await fetch(track.baseUrl);
  const t1 = await r1.text();
  console.log("Status:", r1.status, "Body length:", t1.length);
  console.log("Preview:", t1.slice(0, 200));

  // Test with added format
  console.log("\n--- Fetching with fmt=srv3 added ---");
  const r2 = await fetch(track.baseUrl + "&fmt=srv3");
  const t2 = await r2.text();
  console.log("Status:", r2.status, "Body length:", t2.length);
  console.log("Preview:", t2.slice(0, 200));

  // Maybe we need to add &tlang=en for auto-translate?
  console.log("\n--- Fetching with tlang=en added ---");
  const r3 = await fetch(track.baseUrl + "&tlang=en");
  const t3 = await r3.text();
  console.log("Status:", r3.status, "Body length:", t3.length);
  console.log("Preview:", t3.slice(0, 200));

  // What about without &exp=xpe (experimental)?
  const cleanUrl = track.baseUrl.replace(/&exp=[^&]*/, "");
  console.log("\n--- Fetching without exp param ---");
  const r4 = await fetch(cleanUrl);
  const t4 = await r4.text();
  console.log("Status:", r4.status, "Body length:", t4.length);

  // Test with cookies
  console.log("\n--- Fetching with cookies ---");
  const r5 = await fetch(track.baseUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Cookie: "CONSENT=YES+1",
    },
  });
  const t5 = await r5.text();
  console.log("Status:", r5.status, "Body length:", t5.length);
  console.log("Preview:", t5.slice(0, 300));

  // Let's also look for other URL patterns in the HTML 
  // Sometimes the timedtext URL in the HTML has additional params
  const captionContext = html.substring(
    html.indexOf('"captionTracks"'),
    html.indexOf('"captionTracks"') + 2000
  );
  console.log("\n--- Raw captionTracks context from HTML (first 2000 chars) ---");
  console.log(captionContext);
}

test().catch(console.error);
