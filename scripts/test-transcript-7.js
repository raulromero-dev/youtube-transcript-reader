// Parse the srv3 format XML from ANDROID client

const VIDEO_ID = "GZB6T8QOcFs";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const API_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";

async function test() {
  // Get track URL via ANDROID
  const playerRes = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${API_KEY}&prettyPrint=false`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({
      context: { client: { clientName: "ANDROID", clientVersion: "19.09.37", androidSdkVersion: 30, hl: "en", gl: "US" } },
      videoId: VIDEO_ID,
    }),
  });
  const playerData = await playerRes.json();
  const track = playerData.captions.playerCaptionsTracklistRenderer.captionTracks[0];

  // Fetch XML (don't add fmt=json3, it returns srv3 XML anyway)
  const captionRes = await fetch(track.baseUrl, { headers: { "User-Agent": UA } });
  const xml = await captionRes.text();
  
  console.log("Full XML:");
  console.log(xml);
  console.log("\n\n--- Parsing ---");

  // Try parsing <p> elements (srv3 format uses <p t="ms" d="ms">text</p>)
  const pRegex = /<p t="(\d+)" d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
  let match;
  const segments = [];
  while ((match = pRegex.exec(xml)) !== null) {
    const tMs = parseInt(match[1]);
    const dMs = parseInt(match[2]);
    const rawText = match[3];
    // Strip inner <s> tags
    const text = rawText.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
    if (text) {
      segments.push({ text, start: tMs / 1000, duration: dMs / 1000 });
    }
  }

  console.log("Segments found (p tags):", segments.length);
  if (segments.length > 0) {
    console.log("\nFirst 5:");
    for (const s of segments.slice(0, 5)) {
      console.log(`  [${s.start.toFixed(1)}s] ${s.text}`);
    }
    console.log("\nLast 3:");
    for (const s of segments.slice(-3)) {
      console.log(`  [${s.start.toFixed(1)}s] ${s.text}`);
    }
  }

  // Also check <text> elements (traditional format)
  const textRegex = /<text start="([^"]*)" dur="([^"]*)"[^>]*>([\s\S]*?)<\/text>/g;
  let match2;
  const segments2 = [];
  while ((match2 = textRegex.exec(xml)) !== null) {
    segments2.push({ text: match2[3].trim(), start: parseFloat(match2[1]) });
  }
  console.log("\nSegments found (text tags):", segments2.length);
}

test().catch(console.error);
