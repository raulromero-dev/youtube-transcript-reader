// Test: fetch captions with User-Agent header AND fmt=json3

const VIDEO_IDS = ["GZB6T8QOcFs", "tmnbQVj8UzU"];
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function testVideo(videoId) {
  console.log(`\n${"=".repeat(50)}\nVideo: ${videoId}\n${"=".repeat(50)}`);

  // Step 1: Get caption track URL from page HTML
  const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", Cookie: "CONSENT=YES+1" },
  });
  const html = await pageRes.text();

  const marker = "var ytInitialPlayerResponse = ";
  const markerIdx = html.indexOf(marker);
  if (markerIdx === -1) { console.log("No ytInitialPlayerResponse found"); return; }

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
  if (!tracks?.length) { console.log("No caption tracks"); return; }

  const track = tracks[0];
  console.log(`Track: ${track.languageCode} (${track.kind || "manual"})`);
  console.log(`Base URL: ${track.baseUrl.slice(0, 100)}...`);

  // Test 1: Fetch XML without User-Agent (what our code was doing)
  console.log("\n--- Test 1: XML without User-Agent ---");
  const r1 = await fetch(track.baseUrl);
  const t1 = await r1.text();
  console.log(`Status: ${r1.status}, Length: ${t1.length}`);

  // Test 2: Fetch XML WITH User-Agent
  console.log("\n--- Test 2: XML with User-Agent ---");
  const r2 = await fetch(track.baseUrl, { headers: { "User-Agent": UA } });
  const t2 = await r2.text();
  console.log(`Status: ${r2.status}, Length: ${t2.length}`);
  if (t2.length > 0) console.log("Preview:", t2.slice(0, 200));

  // Test 3: JSON3 format without User-Agent
  console.log("\n--- Test 3: json3 without User-Agent ---");
  const r3 = await fetch(track.baseUrl + "&fmt=json3");
  const t3 = await r3.text();
  console.log(`Status: ${r3.status}, Length: ${t3.length}`);

  // Test 4: JSON3 format WITH User-Agent
  console.log("\n--- Test 4: json3 with User-Agent ---");
  const r4 = await fetch(track.baseUrl + "&fmt=json3", { headers: { "User-Agent": UA } });
  const t4 = await r4.text();
  console.log(`Status: ${r4.status}, Length: ${t4.length}`);
  if (t4.length > 0) {
    try {
      const json = JSON.parse(t4);
      const events = json.events?.filter(e => e.segs);
      console.log(`Events with segments: ${events?.length}`);
      if (events?.length > 0) {
        const firstText = events[0].segs.map(s => s.utf8).join("");
        console.log(`First segment text: "${firstText}"`);
      }
    } catch (e) {
      console.log("Not JSON, preview:", t4.slice(0, 200));
    }
  }

  // Test 5: Fetch via Innertube player with ANDROID client (which blog says works)
  console.log("\n--- Test 5: Innertube ANDROID client ---");
  const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
  const apiKey = apiKeyMatch?.[1] || "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
  const r5 = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}&prettyPrint=false`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({
      context: { client: { clientName: "ANDROID", clientVersion: "19.09.37", androidSdkVersion: 30, hl: "en", gl: "US" } },
      videoId,
    }),
  });
  const d5 = await r5.json();
  console.log(`Status: ${r5.status}, playabilityStatus: ${d5?.playabilityStatus?.status}`);
  const androidTracks = d5?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  console.log(`Android tracks: ${androidTracks?.length ?? 0}`);
  if (androidTracks?.length > 0) {
    const aTrack = androidTracks[0];
    console.log(`Android track URL: ${aTrack.baseUrl.slice(0, 100)}...`);
    // Try fetching from android track
    const r5b = await fetch(aTrack.baseUrl + "&fmt=json3", { headers: { "User-Agent": UA } });
    const t5b = await r5b.text();
    console.log(`Android caption fetch: Status ${r5b.status}, Length: ${t5b.length}`);
    if (t5b.length > 0 && t5b.length < 200) console.log("Body:", t5b);
    else if (t5b.length > 0) {
      try {
        const json = JSON.parse(t5b);
        const events = json.events?.filter(e => e.segs);
        console.log(`Events with segments: ${events?.length}`);
        if (events?.length > 0) {
          console.log(`First: "${events[0].segs.map(s => s.utf8).join("")}"`);
        }
      } catch { console.log("Preview:", t5b.slice(0, 200)); }
    }
  }
}

(async () => {
  for (const id of VIDEO_IDS) await testVideo(id);
  console.log("\nDone!");
})();
