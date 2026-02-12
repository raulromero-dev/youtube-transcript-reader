// Test the get_transcript Innertube endpoint (what YouTube's own "Show Transcript" UI uses)

const VIDEO_ID = "GZB6T8QOcFs";

async function test() {
  // First get a session/visitor ID by fetching the page
  const pageRes = await fetch(`https://www.youtube.com/watch?v=${VIDEO_ID}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
      Cookie: "CONSENT=YES+1",
    },
  });
  const html = await pageRes.text();

  // Get API key
  const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
  const apiKey = apiKeyMatch ? apiKeyMatch[1] : "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
  console.log("API Key:", apiKey);

  // Get visitor data from cookies
  const cookies = pageRes.headers.get("set-cookie") || "";
  console.log("Cookies preview:", cookies.slice(0, 200));

  // Extract visitorData
  const visitorDataMatch = html.match(/"visitorData":"([^"]+)"/);
  console.log("visitorData:", visitorDataMatch?.[1]?.slice(0, 50));

  // Try the get_transcript endpoint 
  console.log("\n--- Trying get_transcript endpoint ---");
  const transcriptPayload = {
    context: {
      client: {
        clientName: "WEB",
        clientVersion: "2.20241120.01.00",
        hl: "en",
        gl: "US",
        visitorData: visitorDataMatch?.[1] || "",
      },
    },
    params: btoa(`\n\x0b${VIDEO_ID}`),
  };
  
  console.log("Payload:", JSON.stringify(transcriptPayload).slice(0, 300));

  const res = await fetch(
    `https://www.youtube.com/youtubei/v1/get_transcript?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
      body: JSON.stringify(transcriptPayload),
    }
  );

  console.log("Status:", res.status);
  const data = await res.json();
  console.log("Response keys:", Object.keys(data).join(", "));
  
  // Check for transcript content
  const actions = data?.actions;
  console.log("Has actions:", !!actions, "Count:", actions?.length);
  
  if (actions) {
    for (const action of actions) {
      console.log("Action keys:", Object.keys(action).join(", "));
      
      const panel = action?.updateEngagementPanelAction?.content?.transcriptRenderer?.content?.transcriptSearchPanelRenderer;
      if (panel) {
        console.log("Found transcript panel!");
        const body = panel?.body?.transcriptSegmentListRenderer;
        if (body) {
          const segments = body?.initialSegments;
          console.log("Segments count:", segments?.length);
          if (segments?.length > 0) {
            console.log("First segment:", JSON.stringify(segments[0]).slice(0, 500));
            console.log("Last segment:", JSON.stringify(segments[segments.length - 1]).slice(0, 500));
          }
        }
      }
    }
  }
  
  // Also try with direct proto params
  // The params for get_transcript encode the video ID in a protobuf format
  // \x0a\x0b = field 1, length 11 (video ID)
  console.log("\n--- Trying with raw protobuf params ---");
  
  // Build the protobuf-like params manually
  // Field 1 (video ID): tag=0x0a, length=0x0b, value=VIDEO_ID
  const videoIdBytes = new TextEncoder().encode(VIDEO_ID);
  const paramBytes = new Uint8Array([0x0a, videoIdBytes.length, ...videoIdBytes]);
  const params = Buffer.from(paramBytes).toString("base64");
  console.log("Params (base64):", params);
  
  const res2 = await fetch(
    `https://www.youtube.com/youtubei/v1/get_transcript?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "WEB",
            clientVersion: "2.20241120.01.00",
            hl: "en",
            gl: "US",
            visitorData: visitorDataMatch?.[1] || "",
          },
        },
        params,
      }),
    }
  );
  
  console.log("Status:", res2.status);
  const data2 = await res2.json();
  console.log("Response keys:", Object.keys(data2).join(", "));
  
  const actions2 = data2?.actions;
  console.log("Has actions:", !!actions2, "Count:", actions2?.length);
  
  if (actions2) {
    for (const action of actions2) {
      console.log("Action keys:", Object.keys(action).join(", "));
      const panel = action?.updateEngagementPanelAction?.content?.transcriptRenderer;
      if (panel) {
        console.log("transcriptRenderer keys:", Object.keys(panel).join(", "));
        const content = panel?.content;
        if (content) {
          console.log("content keys:", Object.keys(content).join(", "));
          const searchPanel = content?.transcriptSearchPanelRenderer;
          if (searchPanel) {
            console.log("searchPanel keys:", Object.keys(searchPanel).join(", "));
            const body = searchPanel?.body?.transcriptSegmentListRenderer;
            if (body) {
              console.log("body keys:", Object.keys(body).join(", "));
              const segments = body?.initialSegments;
              console.log("segments count:", segments?.length);
              if (segments?.length > 0) {
                // Each segment has transcriptSegmentRenderer
                const seg = segments[0]?.transcriptSegmentRenderer;
                if (seg) {
                  console.log("First segment text:", seg?.snippet?.runs?.map(r => r.text).join(""));
                  console.log("First segment time:", seg?.startTimeText?.simpleText);
                }
                const lastSeg = segments[segments.length - 1]?.transcriptSegmentRenderer;
                if (lastSeg) {
                  console.log("Last segment text:", lastSeg?.snippet?.runs?.map(r => r.text).join(""));
                  console.log("Last segment time:", lastSeg?.startTimeText?.simpleText);
                }
              }
            }
          }
        }
      }
    }
  }
  
  // Dump full response if small enough
  const fullJson = JSON.stringify(data2);
  if (fullJson.length < 5000) {
    console.log("\nFull response:", fullJson);
  } else {
    console.log("\nResponse size:", fullJson.length, "chars");
    console.log("First 2000 chars:", fullJson.slice(0, 2000));
  }
}

test().catch(console.error);
