// Combined approach: Try ANDROID multiple times, with logging

const VIDEO_ID = "GZB6T8QOcFs";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const API_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";

async function getAndroidTracks(videoId) {
  const res = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${API_KEY}&prettyPrint=false`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({
      context: { client: { clientName: "ANDROID", clientVersion: "19.09.37", androidSdkVersion: 30, hl: "en", gl: "US" } },
      videoId,
    }),
  });
  const data = await res.json();
  console.log("ANDROID status:", data?.playabilityStatus?.status);
  console.log("ANDROID reason:", data?.playabilityStatus?.reason || "none");
  const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  console.log("ANDROID tracks:", tracks?.length ?? 0);
  return tracks || [];
}

async function test() {
  // Try 3 times
  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`\n--- Attempt ${attempt} ---`);
    const tracks = await getAndroidTracks(VIDEO_ID);
    if (tracks.length > 0) {
      const track = tracks[0];
      console.log("Track URL:", track.baseUrl.slice(0, 120));

      // Fetch caption XML
      const captionRes = await fetch(track.baseUrl, { headers: { "User-Agent": UA } });
      const xml = await captionRes.text();
      console.log("Caption length:", xml.length);

      if (xml.length > 0) {
        // Parse srv3 <p> elements
        const pRegex = /<p t="(\d+)" d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
        let m;
        const segs = [];
        while ((m = pRegex.exec(xml)) !== null) {
          const text = m[3].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
          if (text) segs.push({ text, start: parseInt(m[1]) / 1000 });
        }

        // Also try <text> elements
        const textRegex = /<text start="([^"]*)" dur="([^"]*)"[^>]*>([\s\S]*?)<\/text>/g;
        let m2;
        while ((m2 = textRegex.exec(xml)) !== null) {
          const text = m2[3].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").trim();
          if (text) segs.push({ text, start: parseFloat(m2[1]) });
        }

        console.log("Parsed segments:", segs.length);
        if (segs.length > 0) {
          console.log("First:", segs[0]);
          console.log("SUCCESS!");
          return;
        } else {
          // Dump XML for debugging
          console.log("XML (full):", xml);
        }
      }
    }
    // Wait a bit between attempts
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log("All attempts failed");
}

test().catch(console.error);
