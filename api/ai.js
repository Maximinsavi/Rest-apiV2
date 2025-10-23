const fs = require('fs');
const path = require('path');
const axios = require('axios');

const chatHistoryDir = 'groqllama70b';

exports.config = {
    name: "ai",
    version: "2.0.0",
    author: "Maximin",
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
        return res.status(400).json({ status: false, error: "Missing required parameter: id" });
    }
    if (!query) {
        return res.status(400).json({ status: false, error: "No prompt provided" });
    }

    // Effacer l'historique
    if (query.toLowerCase() === 'clear') {
        clearChatHistory(userId);
        return res.json({ status: true, message: "Chat history cleared!" });
    }

    // Charger historique
    const chatHistory = loadChatHistory(userId);

    const systemPrompt = `Your name is MaxChat, developed by "Maximin SAVI". You mainly speak English but can also respond in Tagalog or Bisaya.`;
    const messages = [
        { role: "system", content: systemPrompt },
        ...chatHistory,
        { role: "user", content: query }
    ];

    const baseUrl = "https://api.deepenglish.com/api/gpt_open_ai/chatnew";
    const headers = {
        'User-Agent': 'Mozilla/5.0',
        'Content-Type': 'application/json',
        'Authorization': 'Bearer UFkOfJaclj61OxoD7MnQknU1S2XwNdXMuSZA+EZGLkc='
    };

    const body = { messages, projectName: "wordpress", temperature: 0.9 };

    try {
        const response = await axios.post(baseUrl, body, { headers });
        let answer = "No response received.";
        let status = false;

        if (response.data && response.data.success) {
            answer = response.data.message || answer;
            status = true;
        } else if (response.data.message) {
            answer = response.data.message;
            status = false;
        }

        // Sauvegarde du nouvel échange
        appendToChatHistory(userId, [
            { role: "user", content: query },
            { role: "assistant", content: answer }
        ]);

        // On recharge les 10 dernières conversations
        const updatedHistory = loadChatHistory(userId);
        const pairs = [];

        for (let i = updatedHistory.length - 2; i >= 0; i -= 2) {
            const userMsg = updatedHistory[i];
            const botMsg = updatedHistory[i + 1];
            if (userMsg && botMsg && userMsg.role === "user" && botMsg.role === "assistant") {
                pairs.push({ question: userMsg.content, reponse: botMsg.content });
            }
            if (pairs.length >= 10) break;
        }

        // Création d’un objet avec question1, question2, etc.
        const historyObject = {};
        for (let i = 0; i < pairs.length; i++) {
            const num = pairs.length - i;
            historyObject[`question${num}`] = pairs[i].question;
            historyObject[`reponse${num}`] = pairs[i].reponse;
        }

        // Résultat final
        res.json({
            status,
            reply: font ? answer.replace(/\*\*(.*?)\*\*/g, (_, text) => font.bold(text)) : answer,
            author: exports.config.author,
            history: [historyObject]
        });

    } catch (error) {
        console.error("Error while contacting AI API:", error.message);
        res.status(500).json({ status: false, error: "Failed to fetch AI response." });
    }
};

// ===== MEMORY SYSTEM =====
function loadChatHistory(uid) {
    const file = path.join(chatHistoryDir, `memory_${uid}.json`);
    if (!fs.existsSync(file)) return [];
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (e) { console.error(e); return []; }
}

function appendToChatHistory(uid, newEntries) {
    if (!fs.existsSync(chatHistoryDir)) fs.mkdirSync(chatHistoryDir);
    const file = path.join(chatHistoryDir, `memory_${uid}.json`);
    const history = loadChatHistory(uid);
    fs.writeFileSync(file, JSON.stringify([...history, ...newEntries], null, 2));
}

function clearChatHistory(uid) {
    const file = path.join(chatHistoryDir, `memory_${uid}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
}