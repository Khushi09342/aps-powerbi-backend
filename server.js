const express = require("express");
const fetch = require("node-fetch");
const fs = require("fs");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 10000;

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

  const url =
    "https://developer.api.autodesk.com/authentication/v2/authorize" +
    "?response_type=code" +
    `&client_id=${CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    "&scope=data:read account:read";

  res.redirect(url);

});

/* CALLBACK */
app.get("/callback", async (req, res) => {

  const code = req.query.code;

  const tokenRes = await fetch(
    "https://developer.api.autodesk.com/authentication/v2/token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET
      })
    }
  );

  const tokenData = await tokenRes.json();

  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokenData));

  console.log("Refresh token saved");

  res.send("Login successful");

});

/* GET ACCESS TOKEN USING REFRESH TOKEN */
async function getAccessToken() {

  if (!fs.existsSync(TOKEN_FILE)) {
    throw new Error("Login required");
  }

  const saved = JSON.parse(fs.readFileSync(TOKEN_FILE));

  const tokenRes = await fetch(
    "https://developer.api.autodesk.com/authentication/v2/token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: saved.refresh_token,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET
      })
    }
  );

  const newToken = await tokenRes.json();

  newToken.refresh_token =
    newToken.refresh_token || saved.refresh_token;

  fs.writeFileSync(TOKEN_FILE, JSON.stringify(newToken));

  return newToken.access_token;

}

/* DATA FOR POWER BI */
app.get("/data", async (req, res) => {

  try {

    const accessToken = await getAccessToken();

    /* GET HUBS */
    const hubsRes = await fetch(
      "https://developer.api.autodesk.com/project/v1/hubs",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const hubs = await hubsRes.json();
    const hubId = hubs.data[0].id;

    /* GET PROJECTS */
    const projectsRes = await fetch(
      `https://developer.api.autodesk.com/project/v1/hubs/${hubId}/projects`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const projects = await projectsRes.json();
    const projectId = projects.data[0].id.replace("b.", "");

    /* GET REVIEWS */
    const reviewsRes = await fetch(
      `https://developer.api.autodesk.com/construction/review/v1/projects/${projectId}/reviews`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const reviews = await reviewsRes.json();

    const result = reviews.results.map(r => ({
      id: r.id,
      name: r.name,
      status: r.status,
      createdDate: r.createdAt,
      fileName: r.document?.name || "No File"
    }));

    res.json(result);

  }
  catch (err) {

    console.error(err);
    res.status(500).send("Error fetching data");

  }

});

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});