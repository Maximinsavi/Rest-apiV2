const axios = require('axios');

exports.config = {
    name: "gptChat",
    version: "1.0.0",
    author: "Clarence",
    description: "Generate responses based on user input using GPT AI.",
    method: 'get',
    link: [`/ai2?q=`],
    guide: "ai How does quantum computing work?",
    category: "ai"
};

exports.initialize = async ({ req, res, font }) => {
    const query = req.query.q;

    if (!query) {
        return res.status(400).json({ error: "No prompt provided" });
    }

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
        "messages": [
            {
                "role": "user",
                "content": query,
                "finalInstruction": "\nProvide a direct and useful answer in English."
            }
        ],
        "projectName": "wordpress",
        "temperature": 0.9
    };

    const getResponse = async () => {
        try {
            const response = await axios.post(baseUrl, body, { headers });
            return response.data;
        } catch (error) {
            console.error('Error fetching response:', error);
            return { success: false, message: "Error fetching data from AI." };
        }
    };

    let answer = "This Endpoint is Under Maintenance!";
    try {
        const response = await getResponse();
        if (response.success) {
            answer = response.message;
        } else {
            throw new Error('AI response failed');
        }
    } catch (error) {
        return res.status(500).json({ error: "Service unavailable" });
    }

    res.json({
        message: answer.replace(/\*\*(.*?)\*\*/g, (_, text) => font.bold(text)),
        author: exports.config.author
    });
};