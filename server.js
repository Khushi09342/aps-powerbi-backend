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

/* LOAD REFRESH TOKEN FROM PERSISTENT STORAGE */
if (fs.existsSync("refresh_token.txt")) {
    REFRESH_TOKEN = fs.readFileSync("refresh_token.txt", "utf8");
} else {
    REFRESH_TOKEN = process.env.REFRESH_TOKEN;
}

app.get("/", (req, res) => res.send("APS backend running"));

/* LOGIN - Redirects to Autodesk */
app.get("/login", (req, res) => {
    const url = "https://developer.api.autodesk.com/authentication/v2/authorize" +
        "?response_type=code" +
        `&client_id=${CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        "&scope=data:read account:read account:write data:create data:write";
    res.redirect(url);
});

/* CALLBACK - Handles initial token exchange */
app.get("/callback", async (req, res) => {
    try {
        const code = req.query.code;
        const tokenRes = await fetch("https://developer.api.autodesk.com/authentication/v2/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                grant_type: "authorization_code",
                code,
                redirect_uri: REDIRECT_URI,
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET
            })
        });

        const tokenData = await tokenRes.json();
        REFRESH_TOKEN = tokenData.refresh_token;
        fs.writeFileSync("refresh_token.txt", REFRESH_TOKEN);

        res.send("Login successful. Data endpoint is now ready.");
    } catch (err) {
        res.status(500).send("Login failed: " + err.message);
    }
});

/* AUTO-REFRESHING ACCESS TOKEN LOGIC */
async function getAccessToken() {
    if (!REFRESH_TOKEN) throw new Error("No refresh token available. Run /login first.");

    const tokenRes = await fetch("https://developer.api.autodesk.com/authentication/v2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: REFRESH_TOKEN,
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET
        })
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error("Could not refresh token.");

    // Important: Save the NEW refresh token (Autodesk rotates them occasionally)
    if (tokenData.refresh_token) {
        REFRESH_TOKEN = tokenData.refresh_token;
        fs.writeFileSync("refresh_token.txt", REFRESH_TOKEN);
    }
    return tokenData.access_token;
}

/* THE DATA FETCHER */
app.get("/data", async (req, res) => {
    try {
        const accessToken = await getAccessToken();
        const headers = { Authorization: `Bearer ${accessToken}` };

        // 1. Get Hubs (Accounts)
        const hubsRes = await fetch("https://developer.api.autodesk.com/project/v1/hubs", { headers });
        const hubs = await hubsRes.json();
        const hub = hubs.data?.find(h => h.attributes?.extension?.type === "hubs:autodesk.bim360:Account");

        if (!hub) return res.json({ error: "No BIM360/ACC Account found" });

        // 2. Get Projects
        const projRes = await fetch(`https://developer.api.autodesk.com/project/v1/hubs/${hub.id}/projects`, { headers });
        const projects = await projRes.json();

        let allReviews = [];
        let allForms = [];

        for (const project of projects.data) {
            const pName = project.attributes.name;
            const fullProjectId = project.id; // b.xxxx
            const cleanProjectId = project.id.replace("b.", ""); // xxxx (UUID)

            // --- FETCH REVIEWS (ACC Docs) ---
            // Use the "construction/reviews" endpoint for actual instances
            const revRes = await fetch(`https://developer.api.autodesk.com/construction/reviews/v1/projects/${fullProjectId}/reviews`, { headers });
            const revData = await revRes.json();
            
            if (revData.results) {
                allReviews = allReviews.concat(revData.results.map(r => ({ ...r, projectName: pName })));
            }

            // --- FETCH FORMS (ACC Build) ---
            // Build API requires the ID without the "b." prefix
            const formRes = await fetch(`https://developer.api.autodesk.com/construction/forms/v1/projects/${cleanProjectId}/forms`, { headers });
            const formData = await formRes.json();

            if (formData.results) {
                allForms = allForms.concat(formData.results.map(f => ({ ...f, projectName: pName })));
            }
        }

        res.json({ reviews: allReviews, forms: allForms });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));