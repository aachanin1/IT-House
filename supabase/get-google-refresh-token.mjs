import http from "node:http";

const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || "";
const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";
const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI || "http://127.0.0.1:53682/oauth2callback";
const scope = "https://www.googleapis.com/auth/drive";

if (!clientId || !clientSecret) {
  console.error("Missing GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_CLIENT_SECRET");
  process.exit(1);
}

const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authUrl.searchParams.set("client_id", clientId);
authUrl.searchParams.set("redirect_uri", redirectUri);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("scope", scope);
authUrl.searchParams.set("access_type", "offline");
authUrl.searchParams.set("prompt", "consent");

const redirect = new URL(redirectUri);
const port = Number(redirect.port || 80);
const callbackPath = redirect.pathname || "/";

const code = await new Promise((resolve, reject) => {
  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url || "/", redirectUri);

    if (requestUrl.pathname !== callbackPath) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const error = requestUrl.searchParams.get("error");
    const authCode = requestUrl.searchParams.get("code");

    if (error) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`Google returned error: ${error}`);
      server.close(() => reject(new Error(error)));
      return;
    }

    if (!authCode) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Authorization code missing");
      server.close(() => reject(new Error("Authorization code missing")));
      return;
    }

    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Authorization received. You can close this tab and return to the IDE.");
    server.close(() => resolve(authCode));
  });

  server.listen(port, "127.0.0.1", () => {
    console.log("Add this Authorized redirect URI in Google Cloud first:");
    console.log(redirectUri);
    console.log("");
    console.log("Then open this URL in your browser:");
    console.log(authUrl.toString());
  });

  server.on("error", reject);
});

const response = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code: String(code),
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  }),
});

const payload = await response.json();

if (!response.ok) {
  console.error(payload);
  process.exit(1);
}

console.log("");
console.log("Refresh token:");
console.log(payload.refresh_token || "No refresh token returned. Revoke app access and retry with prompt=consent.");
