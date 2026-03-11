const express = require("express");
const fetch = require("node-fetch");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 10000;

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

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
  try {
    const code = req.query.code;

    const tokenRes = await fetch(
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

    const tokenData = await tokenRes.json();

    REFRESH_TOKEN = tokenData.refresh_token;

    console.log("Refresh token saved");

    res.send("Login successful. Your refresh token is: " + tokenData.refresh_token);

  } catch (err) {
    console.log(err);
    res.send("Login failed");
  }
});

/* REFRESH ACCESS TOKEN */
let REFRESH_TOKEN = process.env.REFRESH_TOKEN;

async function getAccessToken() {

  if (!REFRESH_TOKEN) {
    throw new Error("REFRESH_TOKEN missing in environment");
  }

  const tokenRes = await fetch(
    "https://developer.api.autodesk.com/authentication/v2/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: saved.refresh_token,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET
      })
    }
  );

  const newToken = await tokenRes.json();

  if (!newToken.refresh_token) {
    newToken.refresh_token = saved.refresh_token;
  }

  fs.writeFileSync(TOKEN_FILE, JSON.stringify(newToken));

  return newToken.access_token;
}

/* DATA ENDPOINT FOR POWER BI */
app.get("/data", async (req, res) => {

  try {

    const accessToken = await getAccessToken();

    /* HUBS */
    const hubsRes = await fetch(
      "https://developer.api.autodesk.com/project/v1/hubs",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const hubs = await hubsRes.json();

    if (!hubs.data || hubs.data.length === 0) {
      return res.json({ error: "No hubs found" });
    }

    const hubId = hubs.data[0].id;

    /* PROJECTS */
    const projRes = await fetch(
      `https://developer.api.autodesk.com/project/v1/hubs/${hubId}/projects`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const projects = await projRes.json();

    if (!projects.data || projects.data.length === 0) {
      return res.json({ error: "No projects found" });
    }

    const projectId = projects.data[0].id.replace("b.", "");

    /* REVIEWS */
    const reviewsRes = await fetch(
      `https://developer.api.autodesk.com/construction/review/v1/projects/${projectId}/reviews`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const reviews = await reviewsRes.json();

    const reviewList = reviews.results || reviews.data || [];

    /* FORMS */
    const formsRes = await fetch(
      `https://developer.api.autodesk.com/construction/forms/v1/projects/${projectId}/forms`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const forms = await formsRes.json();

    const formArray = forms.data || forms.results || [];

    const formattedForms = formArray.map(f => ({
      id: f.id,
      name: f.name,
      status: f.status,
      createdAt: f.createdAt,
      fileName:
        f.attachments && f.attachments.length > 0
          ? f.attachments[0].fileName
          : "No File"
    }));

    res.json({
      reviews: reviewList,
      forms: formattedForms
    });

  } catch (err) {

    console.log(err);

    res.json({
      error: "backend error",
      message: err.message
    });

  }
});

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});