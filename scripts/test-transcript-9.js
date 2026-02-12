// Test: Use page session cookies when fetching captions

const VIDEO_ID = "GZB6T8QOcFs";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function test() {
  // Fetch the page and capture cookies
  const pageRes = await fetch(`https://www.youtube.com/watch?v=${VIDEO_ID}`, {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", Cookie: "CONSENT=YES+1" },
    redirect: "manual",
  });

  console.log("Page status:", pageRes.status);

  // Get all Set-Cookie headers
  const setCookies = pageRes.headers.getSetCookie ? pageRes.headers.getSetCookie() : [];
  console.log("Set-Cookie count:", setCookies.length);

  // Build cookie string
  const cookieJar = ["CONSENT=YES+1"];
  for (const sc of setCookies) {
    const cookiePart = sc.split(";")[0];
    cookieJar.push(cookiePart);
    console.log("Cookie:", cookiePart.slice(0, 60));
  }
  const cookieStr = cookieJar.join("; ");
  console.log("\nFull cookie string:", cookieStr.slice(0, 200));

  const html = await pageRes.text();
  console.log("HTML length:", html.length);

  // Extract player response
  const marker = "var ytInitialPlayerResponse = ";
  const markerIdx = html.indexOf(marker);
  if (markerIdx === -1) { console.log("No player response"); return; }

  const jsonStart = markerIdx + marker.length;
  let depth = 0, inStr = false, esc = false, endIdx = -1;
  for (let i = jsonStart; i < html.length; i++) {
    const c = html[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) { endIdx = i + 1; break; } }
  }

  const data = JSON.parse(html.substring(jsonStart, endIdx));
  const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!tracks?.length) { console.log("No tracks in page HTML"); return; }

  const track = tracks[0];
  console.log("\nTrack:", track.languageCode, track.kind || "manual");
  console.log("URL:", track.baseUrl.slice(0, 100));

  // Test 1: With session cookies + User-Agent  
  console.log("\n--- Test 1: With session cookies + UA ---");
  const r1 = await fetch(track.baseUrl, {
    headers: { "User-Agent": UA, Cookie: cookieStr },
  });
  const t1 = await r1.text();
  console.log("Status:", r1.status, "Length:", t1.length);
  if (t1.length > 0) console.log("Preview:", t1.slice(0, 200));

  // Test 2: With session cookies + UA + json3
  console.log("\n--- Test 2: With cookies + UA + json3 ---");
  const r2 = await fetch(track.baseUrl + "&fmt=json3", {
    headers: { "User-Agent": UA, Cookie: cookieStr },
  });
  const t2 = await r2.text();
  console.log("Status:", r2.status, "Length:", t2.length);
  if (t2.length > 0) console.log("Preview:", t2.slice(0, 200));

  // Test 3: Use the Innertube player API with cookies and session data to get a fresh URL
  console.log("\n--- Test 3: Innertube WEB with session cookies ---");
  const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
  const visitorMatch = html.match(/"visitorData":"([^"]+)"/);
  const apiKey = apiKeyMatch?.[1];
  const visitorData = visitorMatch?.[1];
  console.log("API Key:", apiKey);
  console.log("Visitor Data:", visitorData?.slice(0, 30));

  const r3 = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}&prettyPrint=false`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": UA,
      Cookie: cookieStr,
    },
    body: JSON.stringify({
      context: {
        client: {
          clientName: "WEB",
          clientVersion: "2.20241120.01.00",
          hl: "en",
          gl: "US",
          visitorData: visitorData || "",
        },
      },
      videoId: VIDEO_ID,
    }),
  });
  const d3 = await r3.json();
  console.log("Status:", d3?.playabilityStatus?.status);
  const freshTracks = d3?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  console.log("Fresh tracks:", freshTracks?.length ?? 0);

  if (freshTracks?.length > 0) {
    const freshTrack = freshTracks[0];
    console.log("Fresh track URL:", freshTrack.baseUrl.slice(0, 100));

    // Fetch with cookies
    const r3b = await fetch(freshTrack.baseUrl + "&fmt=json3", {
      headers: { "User-Agent": UA, Cookie: cookieStr },
    });
    const t3b = await r3b.text();
    console.log("Fresh caption fetch:", r3b.status, "Length:", t3b.length);
    if (t3b.length > 0) console.log("Preview:", t3b.slice(0, 300));
  }

  // Test 4: ANDROID client with session cookies
  console.log("\n--- Test 4: ANDROID client with session cookies ---");
  const r4 = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}&prettyPrint=false`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": UA,
      Cookie: cookieStr,
    },
    body: JSON.stringify({
      context: {
        client: {
          clientName: "ANDROID",
          clientVersion: "19.09.37",
          androidSdkVersion: 30,
          hl: "en",
          gl: "US",
        },
      },
      videoId: VIDEO_ID,
    }),
  });
  const d4 = await r4.json();
  console.log("Status:", d4?.playabilityStatus?.status);
  console.log("Reason:", d4?.playabilityStatus?.reason || "none");
  const androidTracks = d4?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  console.log("Android tracks:", androidTracks?.length ?? 0);

  if (androidTracks?.length > 0) {
    const aTrack = androidTracks[0];
    const r4b = await fetch(aTrack.baseUrl, { headers: { "User-Agent": UA, Cookie: cookieStr } });
    const t4b = await r4b.text();
    console.log("Android caption fetch:", r4b.status, "Length:", t4b.length);
    if (t4b.length > 0) console.log("Preview:", t4b.slice(0, 300));
  }
}

test().catch(console.error);
