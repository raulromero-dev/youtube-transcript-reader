// Full debug: test ANDROID client with both known API keys

const VIDEO_ID = "GZB6T8QOcFs";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const API_KEYS = [
  "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
  "AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc",
];

const CLIENTS = [
  {
    name: "ANDROID",
    client: { clientName: "ANDROID", clientVersion: "19.09.37", androidSdkVersion: 30, hl: "en", gl: "US" },
  },
  {
    name: "ANDROID_EMBEDDED_PLAYER",
    client: { clientName: "ANDROID_EMBEDDED_PLAYER", clientVersion: "19.09.37", androidSdkVersion: 30, hl: "en", gl: "US" },
  },
  {
    name: "IOS",
    client: { clientName: "IOS", clientVersion: "19.09.3", deviceMake: "Apple", deviceModel: "iPhone14,3", hl: "en", gl: "US" },
  },
  {
    name: "WEB_EMBEDDED_PLAYER",
    client: { clientName: "WEB_EMBEDDED_PLAYER", clientVersion: "2.20241120.01.00", hl: "en", gl: "US" },
  },
  {
    name: "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
    client: { clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER", clientVersion: "2.0", hl: "en", gl: "US" },
  },
];

async function testClient(clientConfig, apiKey) {
  const label = `${clientConfig.name} + key:${apiKey.slice(0, 10)}`;
  try {
    const res = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}&prettyPrint=false`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({
        context: { client: clientConfig.client },
        videoId: VIDEO_ID,
      }),
    });

    if (!res.ok) {
      console.log(`[${label}] HTTP ${res.status}`);
      return;
    }

    const data = await res.json();
    const status = data?.playabilityStatus?.status;
    const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    const trackCount = tracks?.length ?? 0;

    console.log(`[${label}] status=${status}, tracks=${trackCount}`);

    if (tracks?.length > 0) {
      const track = tracks[0];
      console.log(`  -> Track: ${track.languageCode} (${track.kind || "manual"})`);

      // Try fetching captions with json3
      const captionUrl = track.baseUrl + "&fmt=json3";
      const cRes = await fetch(captionUrl, { headers: { "User-Agent": UA } });
      const cText = await cRes.text();
      console.log(`  -> Caption fetch: status=${cRes.status}, length=${cText.length}`);

      if (cText.length > 0) {
        try {
          const json = JSON.parse(cText);
          const textEvents = (json.events || []).filter(e => e.segs);
          console.log(`  -> TEXT EVENTS: ${textEvents.length} (SUCCESS!)`);
          if (textEvents.length > 0) {
            const firstText = textEvents[0].segs.map(s => s.utf8).join("").trim();
            console.log(`  -> First text: "${firstText}"`);
          }
        } catch {
          console.log(`  -> Not JSON, preview: ${cText.slice(0, 100)}`);
        }
      }

      // Also try plain XML
      const cRes2 = await fetch(track.baseUrl, { headers: { "User-Agent": UA } });
      const cText2 = await cRes2.text();
      console.log(`  -> XML fetch: status=${cRes2.status}, length=${cText2.length}`);
    }
  } catch (e) {
    console.log(`[${label}] ERROR: ${e.message}`);
  }
}

(async () => {
  for (const clientConfig of CLIENTS) {
    for (const apiKey of API_KEYS) {
      await testClient(clientConfig, apiKey);
    }
  }
  console.log("\nDone!");
})();
