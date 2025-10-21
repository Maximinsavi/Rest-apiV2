const fs = require('fs');
const path = require('path');
const axios = require('axios');

const chatHistoryDir = 'groqllama70b';

exports.config = {
    name: "ai",
    version: "2.0.0",
    author: "Clarence",
    description: "Generate responses based on user input using GPT AI (with memory).",
    method: 'get',
    link: [`/ai?q=Hello&id=12`],
    guide: "ai How does quantum computing work?",
    category: "ai"
};

exports.initialize = async ({ req, res, font }) => {
    const query = req.query.q;
    const userId = req.query.id;

    if (!userId) {
        return res.status(400).json({ error: "Missing required parameter: id" });
    }

    if (!query) {
        return res.status(400).json({ error: "No prompt provided" });
    }

    // Clear chat history if requested
    if (query.toLowerCase() === 'clear') {
        clearChatHistory(userId);
        return res.json({ message: "Chat history cleared!" });
    }

    // Load existing chat memory
    const chatHistory = loadChatHistory(userId);

    // Construct messages (system + previous chat + new user query)
    const systemPrompt = `Your name is ClarenceAi, developed by "French Clarence Mangigo". You mainly speak English but can also respond in Tagalog or Bisaya.`;
    const messages = [
        { role: "system", content: systemPrompt },
        ...chatHistory,
        { role: "user", content: query }
    ];

    // API setup
    const baseUrl = "https://api.deepenglish.com/api/gpt_open_ai/chatnew";
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Content-Type': 'application/json',
        'Origin': 'https://members.deepenglish.com',
        'Referer': 'https://members.deepenglish.com/',
        'Accept-Language': 'en-US,en;q=0.9',
        'Authorization': 'Bearer UFkOfJaclj61OxoD7MnQknU1S2XwNdXMuSZA+EZGLkc='
    };

    const body = {
        messages: messages,
        projectName: "wordpress",
        temperature: 0.9
    };

    try {
        const response = await axios.post(baseUrl, body, { headers });
        let answer = "No response received.";

        if (response.data && response.data.success) {
            answer = response.data.message;
        } else if (response.data.message) {
            answer = response.data.message;
        }

        // Save chat history (append)
        appendToChatHistory(userId, [
            { role: "user", content: query },
            { role: "assistant", content: answer }
        ]);

        res.json({
            response: answer.replace(/\*\*(.*?)\*\*/g, (_, text) => font.bold(text)),
            author: exports.config.author
        });

    } catch (error) {
        console.error("Error while contacting AI API:", error.message);
        res.status(500).json({ error: "Failed to fetch AI response." });
    }
};

// =========================
// MEMORY MANAGEMENT SYSTEM
// =========================
function loadChatHistory(uid) {
    const file = path.join(chatHistoryDir, `memory_${uid}.json`);
    try {
        if (fs.existsSync(file)) {
            return JSON.parse(fs.readFileSync(file, 'utf8'));
        }
        return [];
    } catch (err) {
        console.error("Error loading memory:", err);
        return [];
    }
}

function appendToChatHistory(uid, newEntries) {
    const file = path.join(chatHistoryDir, `memory_${uid}.json`);
    try {
        if (!fs.existsSync(chatHistoryDir)) fs.mkdirSync(chatHistoryDir);
        const history = loadChatHistory(uid);
        const updated = [...history, ...newEntries];
        fs.writeFileSync(file, JSON.stringify(updated, null, 2));
    } catch (err) {
        console.error("Error saving memory:", err);
    }
}

function clearChatHistory(uid) {
    const file = path.join(chatHistoryDir, `memory_${uid}.json`);
    try {
        if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch (err) {
        console.error("Error clearing memory:", err);
    }
}