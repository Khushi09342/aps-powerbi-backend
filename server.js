const express = require("express");
const fetch = require("node-fetch");
const fs = require("fs");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 10000;

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

let REFRESH_TOKEN;

/* LOAD REFRESH TOKEN */
if (fs.existsSync("refresh_token.txt")) {
  REFRESH_TOKEN = fs.readFileSync("refresh_token.txt", "utf8");
} else {
  REFRESH_TOKEN = process.env.REFRESH_TOKEN;
}

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
    "&scope=data:read account:read account:write data:create data:write";

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
          code,
          redirect_uri: REDIRECT_URI,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET
        })
      }
    );

    const tokenData = await tokenRes.json();

    REFRESH_TOKEN = tokenData.refresh_token;

    fs.writeFileSync("refresh_token.txt", REFRESH_TOKEN);

    res.send("Login successful. Refresh token saved.");

  } catch (err) {

    console.log(err);
    res.send("Login failed");

  }

});

/* GET ACCESS TOKEN */
async function getAccessToken() {

  if (!REFRESH_TOKEN) {
    throw new Error("REFRESH_TOKEN missing");
  }

  const tokenRes = await fetch(
    "https://developer.api.autodesk.com/authentication/v2/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: REFRESH_TOKEN,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET
      })
    }
  );

  const tokenData = await tokenRes.json();

  if (!tokenData.access_token) {
    throw new Error("Failed to get access token");
  }

  if (tokenData.refresh_token) {
    REFRESH_TOKEN = tokenData.refresh_token;
    fs.writeFileSync("refresh_token.txt", REFRESH_TOKEN);
  }

  return tokenData.access_token;

}

/* DATA ENDPOINT */
app.get("/data", async (req, res) => {

  try {

    const accessToken = await getAccessToken();

    /* HUBS */
    const hubsRes = await fetch(
      "https://developer.api.autodesk.com/project/v1/hubs",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    const hubs = await hubsRes.json();

    const hub = hubs.data.find(
      h => h.attributes?.extension?.type === "hubs:autodesk.bim360:Account"
    );

    if (!hub) {
      return res.json({ reviews: [], forms: [] });
    }

    const hubId = hub.id;

    /* PROJECTS */
    const projRes = await fetch(
      `https://developer.api.autodesk.com/project/v1/hubs/${hubId}/projects`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    const projects = await projRes.json();

    console.log("PROJECT LIST:",
      projects.data.map(p => ({
        name: p.attributes.name,
        id: p.id
      }))
    );

    let allReviews = [];
    let allForms = [];

    for (const project of projects.data) {

      const projectName = project.attributes.name;

      const projectId = project.id.replace("b.", "");

      /* ======================= */
      /* DOCS REVIEWS API */
      /* ======================= */

      const reviewsRes = await fetch(
        `https://developer.api.autodesk.com/docs/reviews/v1/projects/${projectId}/reviews`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
      );

      const reviewsData = await reviewsRes.json();

      console.log("REVIEWS RESPONSE:", JSON.stringify(reviewsData, null, 2));

      if (reviewsData.data) {

        const reviews = reviewsData.data.map(r => ({
          id: r.id,
          name: r.attributes?.name,
          status: r.attributes?.status,
          createdAt: r.attributes?.createdAt,
          project: projectName
        }));

        allReviews = allReviews.concat(reviews);

      }

      /* ======================= */
      /* FORMS API */
      /* ======================= */

      const formsRes = await fetch(
        `https://developer.api.autodesk.com/construction/forms/v1/projects/${projectId}/forms`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
      );

      const formsData = await formsRes.json();

      console.log("FORMS RESPONSE:", JSON.stringify(formsData, null, 2));

      if (formsData.results) {

        const forms = formsData.results.map(f => ({
          id: f.id,
          name: f.name,
          status: f.status,
          createdAt: f.createdAt,
          fileName: f.attachments?.[0]?.fileName || "No File",
          project: projectName
        }));

        allForms = allForms.concat(forms);

      }

    }

    res.json({
      reviews: allReviews,
      forms: allForms
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