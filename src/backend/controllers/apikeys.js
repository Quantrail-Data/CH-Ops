

import {
    getAllApiKeys,
    getApiKeysWithValues,
    createApiKey,
    updateApiKey,
    deleteApiKey,
    setActiveApiKey,
    getActiveApiKey,
    getApiKeyById,
} from "../services/apiKeys.js";
import AIServices from "../servicesAI/AIService.js";
import { db } from "../db/index.js";
import { apiKeys } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { decrypt } from "../services/crypto.js";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";



function isPrivateIpv4(ip) {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
    const [a, b] = parts;
    return (
        a === 10 ||
        a === 127 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        a === 0 ||
        a >= 224
    );
}

function isPrivateIpv6(ip) {
    const normalized = ip.toLowerCase();
    return (
        normalized === "::1" ||
        normalized === "::" ||
        normalized.startsWith("fc") ||
        normalized.startsWith("fd") ||
        normalized.startsWith("fe8") ||
        normalized.startsWith("fe9") ||
        normalized.startsWith("fea") ||
        normalized.startsWith("feb") ||
        normalized.startsWith("ff")
    );
}

function isPublicIp(ip) {
    const version = isIP(ip);
    if (version === 4) return !isPrivateIpv4(ip);
    if (version === 6) return !isPrivateIpv6(ip);
    return false;
}

// Loopback (same machine as this CHOps server) is allowed even though it's
// technically "private" - that's the normal way Ollama is run (same host),
// and it's a materially smaller risk than opening up the rest of the
// private/LAN address space, which would let this endpoint be used to probe
// other machines on the network.
function isLoopbackIp(ip) {
    const version = isIP(ip);
    if (version === 4) return ip.split(".")[0] === "127";
    if (version === 6) return ip.toLowerCase() === "::1";
    return false;
}

function isAllowedOllamaIp(ip) {
    return isLoopbackIp(ip) || isPublicIp(ip);
}




// Returns the validated IP to actually connect to, or null if unsafe.
// Resolving here and pinning the later fetch() to this literal IP (instead of
// letting fetch() re-resolve the hostname itself) closes a DNS-rebinding gap:
// if we only validated the hostname and then fetched the hostname again, an
// attacker could point a domain at an allowed IP for this check and rebind it
// to a disallowed address by the time the actual request's own DNS lookup
// runs.
async function resolveSafeOllamaIp(parsedUrl) {
    // WHATWG URL.hostname keeps the brackets around an IPv6 literal (e.g.
    // "[::1]"), which net.isIP() does not recognize - strip them before any IP
    // check, or an IPv6 literal silently falls through to the DNS-lookup path.
    const rawHostname = parsedUrl.hostname.toLowerCase();
    const hostname =
        rawHostname.startsWith("[") && rawHostname.endsWith("]")
            ? rawHostname.slice(1, -1)
            : rawHostname;

    if (hostname === "localhost" || hostname.endsWith(".localhost")) {
        return "127.0.0.1";
    }

    if (isIP(hostname)) {
        return isAllowedOllamaIp(hostname) ? hostname : null;
    }

    try {
        const records = await lookup(hostname, { all: true, verbatim: true });
        if (!records.length || !records.every((r) => isAllowedOllamaIp(r.address))) {
            return null;
        }
        return records[0].address;
    } catch {
        return null;
    }
}

// Rebuilds a URL with the hostname swapped for the pinned IP (bracketing
// IPv6 literals as the URL authority syntax requires), so the socket
// connects to exactly the address that was already validated above.
function buildPinnedUrl(parsedUrl, ip, path) {
    const host = ip.includes(":") ? `[${ip}]` : ip;
    const port = parsedUrl.port ? `:${parsedUrl.port}` : "";
    return `${parsedUrl.protocol}//${host}${port}${path}`;
}

const AIProviderTesting = async (providerID = null, apikey = null) => {
    try {
        if (!providerID && apikey) {
            const { name, apiKey, model } = apikey;
            const AISer = new AIServices(
                name,
                model,
                apiKey,
            );
            const response = await AISer?.ask("hi");
            return response
                ? { success: true, message: "active" }
                : { success: false, message: "failed" };
        }

        const findAPIKEY = db
            .select()
            .from(apiKeys)
            .where(eq(apiKeys?.id, providerID))
            .get();
        if (!findAPIKEY) {
            throw new Error("API KEY not founded!");
        }
        const AISer = new AIServices(
            findAPIKEY?.name,
            findAPIKEY?.model,
            decrypt(findAPIKEY?.encryptedKey),
        );

        const response = await AISer?.ask("hi");

        return response
            ? { success: true, message: "active" }
            : { success: false, message: "failed" };
    } catch (error) {
        console.error("API key validation failed:", error.message);
        // Surface the classified message (rate limit / auth failure / etc. from
        // AIService.ask()) instead of a generic "failed" - the caller can't tell
        // an invalid key apart from a rate-limited valid one otherwise.
        return { success: false, message: error.message || "failed" };
    }
};


export function getAPIKeys(req, res) {
    try {
        const keys = getAllApiKeys();
        const activeKey = getActiveApiKey();
        res.json({ apiKeys: keys, selectedKeyId: activeKey?.id || null });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

export async function getAPIKeyById(req, res) {
    try {
        const id = parseInt(req.params.id);
        const key = getApiKeyById(id);
        if (!key) {
            return res.status(404).json({ error: "API key not found" });
        }
        res.json({ keyValue: key.key });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

export function getActiveAPIKey(req, res) {
    try {
        const activeKey = getActiveApiKey();
        if (!activeKey) {
            return res.status(404).json({ error: "No active API key found" });
        }
        // Only the AI provider name/model is needed client-side to show connection
        // status; the decrypted key itself is used exclusively server-side (see
        // SQLGenerationService) and must never reach the browser.
        const { key, ...safeKey } = activeKey;
        res.json({ apiKey: safeKey });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

export function getAPIKeysWithValues(req, res) {
    try {
        const keys = getApiKeysWithValues();
        const activeKey = getActiveApiKey();
        res.json({ apiKeys: keys, selectedKeyId: activeKey?.id || null });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

export function createAPIKey(req, res) {
    try {
        const { name, apiKey, model, provider } = req.body;
        if (!name?.trim()) {
            return res.status(400).json({ error: "API key name required." });
        }
        if (!provider?.trim()) {
            return res.status(400).json({ error: "API key provider required." });
        }
        if (!apiKey?.trim()) {
            return res.status(400).json({ error: "API key value required." });
        }
        if (!model?.trim()) {
            return res.status(400).json({ error: "API key model required." });
        }
        const newKey = createApiKey(name, apiKey, model, provider);
        res.status(201).json(newKey);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
}


export function updateAPIKey(req, res) {
    try {
        const { name, apiKey, model, provider } = req.body;
        if (!name?.trim()) {
            return res.status(400).json({ error: "API key name required." });
        }
        if (!provider?.trim()) {
            return res.status(400).json({ error: "API key provider required." });
        }
        if (!apiKey?.trim()) {
            return res.status(400).json({ error: "API key value required." });
        }

        if (!model?.trim()) {
            return res.status(400).json({ error: "API key model required." });
        }
        const id = parseInt(req.params.id);
        const updated = updateApiKey(id, name, apiKey, model, provider);
        res.json(updated);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
}

export function deleteAPIKey(req, res) {
    try {
        const id = parseInt(req.params.id);
        deleteApiKey(id);
        res.json({ deleted: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
}

export function setActiveAPIKey(req, res) {
    try {
        const { keyId } = req.body;
        if (!keyId) {
            return res.status(400).json({ error: "Key ID required." });
        }
        const active = setActiveApiKey(parseInt(keyId));
        res.json(active);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
}

export async function testAPIKey(req, res, next) {
    try {
        const { apiKeys } = req.body;
        if (!apiKeys) return res.status(422).json({ success: false, message: "Provider ID and Model details  must be included!" });

        const responseTesting = await AIProviderTesting(null, apiKeys);

        return res.status(201)?.json(responseTesting);
    }
    catch (error) {
        console.error("API key check route error:", error.message);
        next(error);
    }
}


export async function getOllamaModels(req, res) {
    try {
        const { baseUrl } = req.body;
        if (!baseUrl?.trim()) {
            return res.status(422).json({ success: false, message: "Base URL is required." });
        }

        let parsed;
        try {
            parsed = new URL(baseUrl.trim());
        } catch {
            return res.status(422).json({ success: false, message: "Enter a valid URL" });
        }

        if (parsed.pathname && parsed.pathname !== "/") {
            return res.status(422).json({ success: false, message: "Base URL must not contain a path." });
        }
        if (parsed.search) {
            return res.status(422).json({ success: false, message: "Base URL must not contain query parameters." });
        }
        if (parsed.hash) {
            return res.status(422).json({ success: false, message: "Base URL must not contain a fragment." });
        }
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            return res.status(422).json({ success: false, message: "URL must start with http:// or https://" });
        }

        const pinnedIp = await resolveSafeOllamaIp(parsed);
        if (!pinnedIp) {
            return res.status(422).json({
                success: false,
                message: "Base URL must resolve to localhost/127.0.0.1 or a public host. Other private and local network addresses are not allowed.",
            });
        }

        // Connect to the already-validated IP directly, not the hostname, so a
        // DNS change between validation and this request (DNS rebinding) can't
        // redirect the request elsewhere; the Host header keeps the request
        // looking correct to the target server.
        const tagsUrl = buildPinnedUrl(parsed, pinnedIp, "/api/tags");
        let response;
        try {
            response = await fetch(tagsUrl, {
                signal: AbortSignal.timeout(5000),
                headers: { Host: parsed.host },
            });
        } catch {
            // Server not running yet, wrong port, DNS failure, timeout - an expected
            // state during setup, not a server error.
            return res.status(200).json({
                success: false,
                message: `Could not reach Ollama at ${baseUrl.trim()}. Make sure the server is running and the base URL is correct.`,
            });
        }
        if (!response.ok) {
            return res.status(200).json({ success: false, message: `Ollama responded with HTTP ${response.status}.` });
        }

        const data = await response.json().catch(() => null);
        const models = Array.isArray(data?.models) ? data.models.map((m) => m.name).filter(Boolean) : [];
        return res.status(200).json({ success: true, models });
    } catch (error) {
        console.error("Ollama model listing error:", error.message);
        return res.status(200).json({ success: false, message: "Failed to fetch Ollama models." });
    }
}