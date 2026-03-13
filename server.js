const express = require("express");
const fetch = require("node-fetch");
const fs = require("fs");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 10000;

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

let REFRESH_TOKEN = fs.existsSync("refresh_token.txt") 
    ? fs.readFileSync("refresh_token.txt", "utf8") 
    : process.env.REFRESH_TOKEN;

app.get("/", (req, res) => res.send("APS Backend is running."));

// 1. LOGIN
app.get("/login", (req, res) => {
    const url = `https://developer.api.autodesk.com/authentication/v2/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=data:read account:read`;
    res.redirect(url);
});

// 2. CALLBACK
app.get("/callback", async (req, res) => {
    const code = req.query.code;
    const response = await fetch("https://developer.api.autodesk.com/authentication/v2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI, client_id: CLIENT_ID, client_secret: CLIENT_SECRET })
    });
    const data = await response.json();
    REFRESH_TOKEN = data.refresh_token;
    fs.writeFileSync("refresh_token.txt", REFRESH_TOKEN);
    res.send("✅ Login Successful. You can close this.");
});

async function getAccessToken() {
    const response = await fetch("https://developer.api.autodesk.com/authentication/v2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: REFRESH_TOKEN, client_id: CLIENT_ID, client_secret: CLIENT_SECRET })
    });
    const data = await response.json();
    if (data.refresh_token) {
        REFRESH_TOKEN = data.refresh_token;
        fs.writeFileSync("refresh_token.txt", REFRESH_TOKEN);
    }
    return data.access_token;
}

// 3. DATA FETCHING
app.get("/data", async (req, res) => {
    try {
        const token = await getAccessToken();
        const headers = { 
            Authorization: `Bearer ${token}`,
            "region": "US",
            "x-ads-region": "US" // Mandatory for Trial/US Accounts
        };

        const hubsRes = await fetch("https://developer.api.autodesk.com/project/v1/hubs", { headers });
        const hubs = await hubsRes.json();
        const hub = hubs.data?.find(h => h.attributes?.extension?.type === "hubs:autodesk.bim360:Account");

        const projRes = await fetch(`https://developer.api.autodesk.com/project/v1/hubs/${hub.id}/projects`, { headers });
        const projects = await projRes.json();

        let allReviews = [];
        let allForms = [];

        for (const p of projects.data) {
            const pName = p.attributes.name;
            const fullId = p.id; 
            const cleanId = p.id.replace("b.", ""); 

            // FETCH REVIEWS
            const rRes = await fetch(`https://developer.api.autodesk.com/construction/reviews/v1/projects/${fullId}/reviews`, { headers });
            const rData = await rRes.json();
            if (rData.results) {
                allReviews = allReviews.concat(rData.results.map(r => ({
                    id: r.id, name: r.name, status: r.status, createdAt: r.createdAt, project: pName, type: "Review", fileName: r.name
                })));
            }

            // FETCH FORMS
            const fRes = await fetch(`https://developer.api.autodesk.com/construction/forms/v1/projects/${cleanId}/forms`, { headers });
            const fData = await fRes.json();
            
            if (fData.results) {
                allForms = allForms.concat(fData.results.map(f => ({
                    id: f.id, 
                    name: f.title || f.templateName || "Untitled Form", 
                    status: f.status, 
                    createdAt: f.createdAt, 
                    project: pName, 
                    type: "Form", 
                    fileName: f.templateName || "Form"
                })));
            }
        }

        res.json({ reviews: allReviews, forms: allForms });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => console.log(`Server on ${PORT}`));