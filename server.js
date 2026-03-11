const express = require("express");
const fetch = require("node-fetch");
const fs = require("fs");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 10000;

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

const TOKEN_FILE = "token.json";

/* HOME */
app.get("/", (req, res) => {
  res.send("APS backend running");
});

/* LOGIN */
app.get("/login", (req, res) => {
  const authUrl =
    "https://developer.api.autodesk.com/authentication/v2/authorize" +
    "?response_type=code" +
    `&client_id=${CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    "&scope=data:read account:read";

  res.redirect(authUrl);
});

/* CALLBACK */
app.get("/callback", async (req, res) => {
  const code = req.query.code;

  const response = await fetch(
    "https://developer.api.autodesk.com/authentication/v2/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET
      })
    }
  );

  const data = await response.json();

  fs.writeFileSync(TOKEN_FILE, JSON.stringify(data));
  console.log("Refresh token saved");

  res.send("Login successful");
});

/* REFRESH TOKEN */
async function getAccessToken() {
  if (!fs.existsSync(TOKEN_FILE)) {
    throw new Error("Login required");
  }

  const tokenData = JSON.parse(fs.readFileSync(TOKEN_FILE));

  const response = await fetch(
    "https://developer.api.autodesk.com/authentication/v2/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokenData.refresh_token,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET
      })
    }
  );

  const newToken = await response.json();

  newToken.refresh_token =
    newToken.refresh_token || tokenData.refresh_token;

  fs.writeFileSync(TOKEN_FILE, JSON.stringify(newToken));

  return newToken.access_token;
}

/* MAIN DATA ENDPOINT FOR POWER BI */
app.get("/data", async (req, res) => {
  try {
    const accessToken = await getAccessToken();

    /* HUBS */
    const hubsRes = await fetch(
      "https://developer.api.autodesk.com/project/v1/hubs",
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );

    const hubs = await hubsRes.json();
    const hubId = hubs.data[0].id;

    /* PROJECTS */
    const projectsRes = await fetch(
      `https://developer.api.autodesk.com/project/v1/hubs/${hubId}/projects`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );

    const projects = await projectsRes.json();
    const projectId = projects.data[0].id.replace("b.", "");

    /* REVIEWS */
    const reviewsRes = await fetch(
      `https://developer.api.autodesk.com/construction/review/v1/projects/${projectId}/reviews`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );

    const reviews = await reviewsRes.json();

    res.json(reviews);

  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching data");
  }
});

app.listen(port, () => {
  console.log("Server running on port " + port);
});