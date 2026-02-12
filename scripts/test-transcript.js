// Test script to debug YouTube transcript fetching
// Tests both video IDs the user mentioned

const VIDEO_IDS = ["GZB6T8QOcFs", "tmnbQVj8UzU"];

async function testVideoId(videoId) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Testing video: ${videoId}`);
  console.log("=".repeat(60));

  // Strategy 1: Fetch page HTML and look for captions
  console.log("\n--- Strategy 1: Page HTML scraping ---");
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        Cookie: "CONSENT=YES+1",
      },
    });
    console.log("Page fetch status:", res.status);
    const html = await res.text();
    console.log("HTML length:", html.length);

    // Check for consent redirect
    if (html.includes("consent.youtube.com")) {
      console.log("WARNING: Got consent redirect page!");
    }

    // Look for ytInitialPlayerResponse
    const marker = "var ytInitialPlayerResponse = ";
    const markerIdx = html.indexOf(marker);
    console.log("ytInitialPlayerResponse marker index:", markerIdx);

    if (markerIdx !== -1) {
      // Extract with brace counting
      const jsonStart = markerIdx + marker.length;
      let depth = 0;
      let inString = false;
      let escape = false;
      let endIdx = -1;

      for (let i = jsonStart; i < html.length; i++) {
        const ch = html[i];
        if (escape) { escape = false; continue; }
        if (ch === "\\") { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === "{") depth++;
        else if (ch === "}") {
          depth--;
          if (depth === 0) { endIdx = i + 1; break; }
        }
      }

      if (endIdx > 0) {
        const jsonStr = html.substring(jsonStart, endIdx);
        console.log("Extracted JSON length:", jsonStr.length);
        try {
          const data = JSON.parse(jsonStr);
          console.log("Parsed! Keys:", Object.keys(data).join(", "));
          console.log("playabilityStatus:", data?.playabilityStatus?.status);
          console.log("Has captions:", !!data?.captions);
          
          const captionsObj = data?.captions;
          if (captionsObj) {
            console.log("captions keys:", Object.keys(captionsObj).join(", "));
            const renderer = captionsObj?.playerCaptionsTracklistRenderer;
            if (renderer) {
              console.log("renderer keys:", Object.keys(renderer).join(", "));
              const tracks = renderer?.captionTracks;
              console.log("captionTracks:", tracks?.length ?? "NONE");
              if (tracks) {
                for (const t of tracks) {
                  console.log(`  Track: lang=${t.languageCode}, kind=${t.kind ?? "manual"}, name=${t.name?.simpleText ?? "?"}, url=${t.baseUrl?.slice(0, 100)}`);
                }

                // Try fetching the first track
                const url = tracks[0].baseUrl;
                console.log("\nFetching caption XML from first track...");
                const captionRes = await fetch(url);
                console.log("Caption fetch status:", captionRes.status);
                const xml = await captionRes.text();
                console.log("XML length:", xml.length);
                console.log("XML preview:", xml.slice(0, 300));
              }
            }
          }

          // Also check if captions info exists elsewhere
          const jsonString = jsonStr;
          const hasCaptionTracks = jsonString.includes('"captionTracks"');
          const hasTimedTextUrl = jsonString.includes("timedtext");
          console.log("\ncontains 'captionTracks':", hasCaptionTracks);
          console.log("contains 'timedtext':", hasTimedTextUrl);
        } catch (e) {
          console.log("JSON parse error:", e.message);
          console.log("JSON start:", jsonStr.slice(0, 200));
          console.log("JSON end:", jsonStr.slice(-200));
        }
      } else {
        console.log("Could not find matching brace for JSON");
      }
    }

    // Also check for "captionTracks" anywhere in HTML
    const ctIdx = html.indexOf('"captionTracks"');
    console.log("\n'captionTracks' found in HTML at index:", ctIdx);
    if (ctIdx > 0) {
      console.log("Context around captionTracks:", html.substring(ctIdx - 20, ctIdx + 200));
    }
  } catch (e) {
    console.log("Strategy 1 error:", e.message);
  }

  // Strategy 2: Direct timedtext API
  console.log("\n--- Strategy 2: Direct timedtext API ---");
  const timedtextUrls = [
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&kind=asr`,
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en`,
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=srv3`,
  ];

  for (const url of timedtextUrls) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        },
      });
      const text = await res.text();
      console.log(`URL: ${url.split("?")[1]}`);
      console.log(`  Status: ${res.status}, Length: ${text.length}, Preview: ${text.slice(0, 100)}`);
    } catch (e) {
      console.log(`  Error: ${e.message}`);
    }
  }

  // Strategy 3: Innertube player API
  console.log("\n--- Strategy 3: Innertube player API ---");
  try {
    const payload = {
      context: {
        client: {
          clientName: "WEB",
          clientVersion: "2.20241120.01.00",
          hl: "en",
          gl: "US",
        },
      },
      videoId,
    };

    const res = await fetch(
      `https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8&prettyPrint=false`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        },
        body: JSON.stringify(payload),
      }
    );

    console.log("Innertube status:", res.status);
    const data = await res.json();
    console.log("Keys:", Object.keys(data).join(", "));
    console.log("playabilityStatus:", data?.playabilityStatus?.status);
    console.log("Has captions:", !!data?.captions);

    if (data?.captions) {
      const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      console.log("Tracks:", tracks?.length ?? "NONE");
      if (tracks) {
        for (const t of tracks) {
          console.log(`  Track: lang=${t.languageCode}, kind=${t.kind ?? "manual"}, name=${t.name?.simpleText ?? "?"}`);
        }
      } else {
        console.log("Full captions:", JSON.stringify(data.captions).slice(0, 500));
      }
    }

    // Check for signIn requirement
    if (data?.playabilityStatus?.status === "LOGIN_REQUIRED") {
      console.log("VIDEO REQUIRES LOGIN!");
    }
    if (data?.playabilityStatus?.reason) {
      console.log("Reason:", data.playabilityStatus.reason);
    }
  } catch (e) {
    console.log("Innertube error:", e.message);
  }
}

// Run tests
(async () => {
  for (const id of VIDEO_IDS) {
    await testVideoId(id);
  }
  console.log("\n\nDone!");
})();
