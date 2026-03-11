require("dotenv").config();
const express = require("express");
const fetch = require("node-fetch");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

const TOKEN_FILE = "token.json";

/* -------------------------
   Load refresh token
--------------------------*/
function loadRefreshToken() {
  if (fs.existsSync(TOKEN_FILE)) {
    const data = JSON.parse(fs.readFileSync(TOKEN_FILE));
    return data.refresh_token;
  }
  return null;
}

/* -------------------------
   Save refresh token
--------------------------*/
function saveRefreshToken(token) {
  fs.writeFileSync(TOKEN_FILE, JSON.stringify({ refresh_token: token }));
}

let refreshToken = loadRefreshToken();

/* -------------------------
   Get access token
--------------------------*/
async function getAccessToken() {

  if (!refreshToken) {
    throw new Error("Login required");
  }

  const response = await fetch(
    "https://developer.api.autodesk.com/authentication/v2/token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET
      })
    }
  );

  const data = await response.json();

  if (data.refresh_token) {
    refreshToken = data.refresh_token;
    saveRefreshToken(refreshToken);
    console.log("Refresh token updated");
  }

  return data.access_token;
}

/* -------------------------
   Login route
--------------------------*/
app.get("/", (req, res) => {

  const authUrl =
    "https://developer.api.autodesk.com/authentication/v2/authorize" +
    "?response_type=code" +
    "&client_id=" + CLIENT_ID +
    "&redirect_uri=" + encodeURIComponent(REDIRECT_URI) +
    "&scope=data:read%20data:write%20account:read";

  res.send(`
    <h2>Autodesk Login</h2>
    <a href="${authUrl}">Login to Autodesk</a>
  `);

});

/* -------------------------
   OAuth callback
--------------------------*/
app.get("/api/callback", async (req, res) => {

  try {

    const code = req.query.code;

    const response = await fetch(
      "https://developer.api.autodesk.com/authentication/v2/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: code,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: REDIRECT_URI
        })
      }
    );

    const data = await response.json();

    refreshToken = data.refresh_token;
    saveRefreshToken(refreshToken);

    console.log("Refresh token saved");

    res.send("Login successful. Token saved.");

  } catch (err) {

    console.error(err);
    res.send("OAuth error");

  }

});

/* -------------------------
   Power BI endpoint
--------------------------*/
app.get("/data", async (req, res) => {

  try {

    const token = await getAccessToken();

    const response = await fetch(
      "https://developer.api.autodesk.com/project/v1/hubs",
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    const data = await response.json();

    res.json(data);

  } catch (err) {

    console.error(err);
    res.status(500).send("Error fetching hubs");

  }

});

/* -------------------------
   Start server
--------------------------*/
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});