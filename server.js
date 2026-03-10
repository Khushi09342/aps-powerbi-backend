require("dotenv").config();
const express = require("express");
const fetch = require("node-fetch");

const app = express();
const PORT = 3000;

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

let refreshToken = null;

/* -------------------------
   Generate Access Token
--------------------------*/
async function getAccessToken() {

  if (!refreshToken) {
    throw new Error("Login first: http://localhost:3000");
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
    console.log("Updated refresh token:", refreshToken);
  }

  return data.access_token;
}


/* -------------------------
   Login
--------------------------*/
app.get("/", (req, res) => {

  const authUrl =
    "https://developer.api.autodesk.com/authentication/v2/authorize" +
    "?response_type=code" +
    "&client_id=" + CLIENT_ID +
    "&redirect_uri=" + encodeURIComponent(REDIRECT_URI) +
    "&scope=data:read%20data:write%20account:read";

  res.send(`<h2>Autodesk Login</h2><a href="${authUrl}">Login to Autodesk</a>`);
});


/* -------------------------
   OAuth Callback
--------------------------*/
app.get("/callback", async (req, res) => {

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

  console.log("New refresh token:", refreshToken);

  res.send("Login successful.");
});


/* -------------------------
   Reviews
--------------------------*/
async function getReviews(token, projectId) {

  const response = await fetch(
    `https://developer.api.autodesk.com/construction/reviews/v1/projects/${projectId}/reviews`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  return await response.json();
}


/* -------------------------
   Forms
--------------------------*/
async function getForms(token, projectId) {

  const response = await fetch(
    `https://developer.api.autodesk.com/construction/forms/v1/projects/${projectId}/forms`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  return await response.json();
}


/* -------------------------
   Power BI Endpoint
--------------------------*/
app.get("/powerbi-data/:projectId", async (req, res) => {

  try {

    const token = await getAccessToken();
    const projectId = req.params.projectId;

    const reviews = await getReviews(token, projectId);
    const forms = await getForms(token, projectId);

    res.json({
      reviews,
      forms
    });

  } catch (err) {

    console.error(err);
    res.send("Power BI data error");

  }

});


app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});