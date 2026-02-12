// Test: Full working pipeline with ANDROID client + parse the srv3 XML

const VIDEO_ID = "GZB6T8QOcFs";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function test() {
  // Get API key from page
  const pageRes = await fetch(`https://www.youtube.com/watch?v=${VIDEO_ID}`, {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", Cookie: "CONSENT=YES+1" },
  });
  const html = await pageRes.text();
  const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
  const apiKey = apiKeyMatch?.[1] || "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";

  // Use ANDROID client
  const playerRes = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}&prettyPrint=false`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA },
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

  const playerData = await playerRes.json();
  const tracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!tracks?.length) { console.log("No tracks"); return; }

  const track = tracks[0];
  console.log("Track:", track.languageCode, track.kind || "manual");

  // Fetch in json3 format (the blog recommends this)
  const captionUrl = track.baseUrl + "&fmt=json3";
  console.log("Fetching json3...");
  const captionRes = await fetch(captionUrl, { headers: { "User-Agent": UA } });
  const captionText = await captionRes.text();
  console.log("Length:", captionText.length);

  try {
    const json = JSON.parse(captionText);
    const events = json.events || [];
    console.log("Total events:", events.length);

    // Filter events that have text segments
    const textEvents = events.filter(e => e.segs);
    console.log("Events with text:", textEvents.length);

    // Build transcript
    const segments = [];
    for (const event of textEvents) {
      const text = event.segs.map(s => s.utf8).join("").trim();
      if (text && text !== "\n") {
        segments.push({
          text,
          start: event.tStartMs / 1000,
          duration: (event.dDurationMs || 0) / 1000,
        });
      }
    }

    console.log("\nTotal segments:", segments.length);
    console.log("First 5 segments:");
    for (const s of segments.slice(0, 5)) {
      console.log(`  [${s.start.toFixed(1)}s] ${s.text}`);
    }
    console.log("\nLast 3 segments:");
    for (const s of segments.slice(-3)) {
      console.log(`  [${s.start.toFixed(1)}s] ${s.text}`);
    }
  } catch (e) {
    console.log("Not JSON. Trying XML parse...");
    // Try XML format
    const xmlRes = await fetch(track.baseUrl, { headers: { "User-Agent": UA } });
    const xml = await xmlRes.text();
    console.log("XML length:", xml.length);
    console.log("XML preview:", xml.slice(0, 500));
  }
}

test().catch(console.error);
