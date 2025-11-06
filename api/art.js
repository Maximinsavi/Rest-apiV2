// server.js
// Express + SSE + Puppeteer robot
// Usage:
// 1) npm init -y
// 2) npm i express puppeteer
// 3) node server.js
// 4) Ouvre http://localhost:3000 -> tu verras iframe + logs
// 5) Clique "Démarrer le robot" sur la page pour lancer le bot côté serveur

const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// === CONFIG ===
// Lien direct vers le profil (modifie si besoin)
const directLink = 'https://maxgram.wapaxo.com/?u=Thibaut&p=64932261';

// Liste des posts à envoyer (modifie)
const posts = [
  { text: 'Post automatique n°1 🚀', image: '' },
  { text: 'Post automatique n°2 avec image 🖼️', image: 'https://via.placeholder.com/400' },
  { text: 'Post automatique n°3 🎯', image: '' }
];

// Délai entre étapes (ms)
const delays = {
  initialLoad: 3000,
  afterRedirect: 1500,
  betweenPosts: 3000,
  waitForSelector: 8000
};

// SSE clients
let sseClients = [];

// Utilitaires SSE
function sendSSE(msg) {
  const data = `data: ${JSON.stringify(msg)}\n\n`;
  sseClients.forEach(res => res.write(data));
}

// Serve main page (iframe + logs + start button)
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`
<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Robot MaxGram Controller</title>
  <style>
    body{font-family:Arial,Helvetica,sans-serif;margin:10px;}
    #controls{margin-bottom:8px;}
    button{padding:8px 12px;background:#27ae60;color:#fff;border:none;cursor:pointer;}
    #log{height:260px;border:1px solid #ccc;padding:6px;overflow:auto;background:#f9f9f9;}
    iframe{width:100%;height:420px;border:1px solid #999;margin-top:10px;}
    .err{color:#c0392b;font-weight:bold;}
    .ok{color:#16a085;font-weight:bold;}
  </style>
</head>
<body>
  <h2>Robot MaxGram Controller</h2>
  <div id="controls">
    <button id="startBtn">Démarrer le robot</button>
    <button id="stopBtn" disabled>Arrêter</button>
  </div>
  <div id="log"></div>
  <iframe id="targetFrame" src="${directLink}"></iframe>

  <script>
    const logEl = document.getElementById('log');
    function appendLog(txt, cls){
      const p = document.createElement('div');
      if(cls) p.className = cls;
      p.textContent = (new Date()).toLocaleTimeString() + ' — ' + txt;
      logEl.appendChild(p);
      logEl.scrollTop = logEl.scrollHeight;
    }

    // SSE connect
    const evt = new EventSource('/events');
    evt.onmessage = function(e){
      try {
        const m = JSON.parse(e.data);
        appendLog(m.msg, m.level === 'error' ? 'err' : (m.level === 'success' ? 'ok' : ''));
        if(m.url) {
          // optionally navigate iframe when server requests it
          document.getElementById('targetFrame').src = m.url;
        }
      } catch(err) {
        appendLog('SSE parse error: ' + e.data, 'err');
      }
    };

    // start/stop
    document.getElementById('startBtn').addEventListener('click', async () => {
      appendLog('Demande de démarrage envoyée au serveur...');
      fetch('/start', { method: 'POST' }).then(r => {
        if(r.ok) {
          appendLog('Bot démarré (côté serveur).');
          document.getElementById('startBtn').disabled = true;
          document.getElementById('stopBtn').disabled = false;
        } else {
          appendLog('Erreur lors du démarrage', 'err');
        }
      });
    });

    document.getElementById('stopBtn').addEventListener('click', async () => {
      appendLog('Demande d\'arrêt envoyée au serveur...');
      fetch('/stop', { method: 'POST' }).then(r => {
        appendLog('Arrêt demandé.');
        document.getElementById('startBtn').disabled = false;
        document.getElementById('stopBtn').disabled = true;
      });
    });
  </script>
</body>
</html>
  `);
});

// SSE endpoint
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  res.write('retry: 2000\n\n');

  sseClients.push(res);
  req.on('close', () => {
    sseClients = sseClients.filter(r => r !== res);
  });
});

// Flags to control the bot
let browserInstance = null;
let botRunning = false;
let stopRequested = false;

// Start bot
app.post('/start', express.json(), async (req, res) => {
  if(botRunning) {
    res.status(409).send('Bot déjà en cours');
    return;
  }
  botRunning = true;
  stopRequested = false;
  res.status(200).send('OK');

  // run puppeteer in background
  runBot().catch(err => {
    sendSSE({ level: 'error', msg: 'Erreur générale du bot: ' + String(err) });
    botRunning = false;
  });
});

// Stop bot
app.post('/stop', (req, res) => {
  stopRequested = true;
  if(browserInstance) {
    // attempt graceful close
    browserInstance.close().catch(()=>{});
  }
  botRunning = false;
  res.send('stopping');
});

// === ROBOT PUPPETEER ===
async function runBot(){
  sendSSE({ level:'info', msg: 'Lancement du navigateur Puppeteer...' });
  browserInstance = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browserInstance.newPage();
  page.setDefaultTimeout(20000);

  try {
    // 1) Ouvrir le lien direct
    sendSSE({ level:'info', msg: `Chargement : ${directLink}` });
    await page.goto(directLink, { waitUntil: 'networkidle2' });

    // small wait for potential redirect/login handling by the site
    await page.waitForTimeout(delays.initialLoad);

    // 2) Check if site redirected to index.html (success condition)
    const currentUrl = page.url();
    sendSSE({ level:'info', msg: 'URL actuelle : ' + currentUrl });
    const successRedirect = /index(\\.html)?(\\?|$)/i.test(currentUrl);
    if(!successRedirect){
      // If not redirected, try to detect elements that indicate successful profile load
      const profileSelectors = ['.user-header', '.username', '#profile-identifier'];
      let profileFound = false;
      for(const sel of profileSelectors){
        if(await page.$(sel) !== null){ profileFound = true; break; }
      }
      if(!profileFound){
        sendSSE({ level:'error', msg: 'Profil/connexion non détecté — arrêt du bot.' });
        await browserInstance.close();
        botRunning = false;
        return;
      } else {
        sendSSE({ level:'info', msg: 'Profil détecté via sélecteur — continuer.' });
      }
    } else {
      sendSSE({ level:'success', msg: 'Redirection vers index détectée.' });
    }

    // If page is not the home page, navigate to home (index.html)
    if(!/index(\\.html)?(\\?|$)/i.test(page.url())){
      const homeUrl = new URL(page.url());
      homeUrl.pathname = '/index.html';
      sendSSE({ level:'info', msg: 'Navigation vers la page d\'accueil...' , url: homeUrl.toString() });
      await page.goto(homeUrl.toString(), { waitUntil: 'networkidle2' });
      await page.waitForTimeout(delays.afterRedirect);
    }

    // 3) Cliquer sur "Create post" (essayer plusieurs sélecteurs)
    sendSSE({ level:'info', msg: 'Recherche du bouton "Create post" ...' });
    const createPostSelectors = [
      'a[href*="page-creat-post"]',
      'a[href*="page-bot-post"]',
      'a#create-post',
      'button#create-post',
      'a:contains("Create")',
      'a:contains("Créer")'
    ];

    let clickedCreate = false;
    // try common anchors/buttons
    const createCandidates = [
      'a[href="/page-creat-post.html"]',
      'a[href*="page-creat-post"]',
      'a[href*="page-bot-post"]',
      'a[href="/page-bot-post.html"]',
      'a.create-post',
      'button.create-post',
      'a#new-post',
      'button#new-post'
    ];
    for(const sel of createCandidates){
      const el = await page.$(sel);
      if(el){
        await el.click();
        clickedCreate = true;
        sendSSE({ level:'success', msg: `Clique sur create via sélecteur "${sel}"` });
        break;
      }
    }

    // fallback: try to click first link that contains 'creat' or 'post'
    if(!clickedCreate){
      const anchors = await page.$$eval('a', as => as.map(a => ({ href: a.getAttribute('href')||'', text: a.innerText||'' })));
      for(const a of anchors){
        const txt = (a.text || '').toLowerCase();
        const href = (a.href || '').toLowerCase();
        if(txt.includes('cré') || txt.includes('create') || txt.includes('post') || href.includes('creat')) {
          // click via selector by searching element with matching href/text
          try {
            await page.evaluate((pattern) => {
              const els = Array.from(document.querySelectorAll('a'));
              for(const e of els){
                const t = (e.innerText||'').toLowerCase();
                const h = (e.getAttribute('href')||'').toLowerCase();
                if(t.includes(pattern) || h.includes(pattern)) { e.click(); break; }
              }
            }, txt.includes('cré') ? 'cré' : (txt.includes('create') ? 'create' : 'post'));
            clickedCreate = true;
            sendSSE({ level:'success', msg: `Clique sur un lien contenant "${txt || href}"` });
            break;
          } catch(e){}
        }
      }
    }

    if(!clickedCreate){
      sendSSE({ level:'error', msg: 'Bouton "Create post" introuvable — arrêt.' });
      await browserInstance.close();
      botRunning = false;
      return;
    }

    // Wait for navigation to the create page
    await page.waitForTimeout(delays.afterRedirect);
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: delays.waitForSelector }).catch(()=>{});

    // 4) Sur la page de création : remplir et soumettre
    sendSSE({ level:'info', msg: 'Page de création — préparation des posts...' });

    // Try to find textarea and submit button
    const textareaSelectorCandidates = ['textarea[name="text"]', 'textarea#text', 'textarea', 'textarea[placeholder]'];
    const imgSelectorCandidates = ['input[name="var-img"]', 'input[name="image"]', 'input[type="text"]'];
    const submitSelectorCandidates = ['button[name="blog_submit"]', 'button[type="submit"]', 'input[type="submit"]', 'button.post, button.publish'];

    // helper to find selector
    async function findSelector(cands){
      for(const s of cands){
        try {
          const el = await page.$(s);
          if(el) return s;
        } catch(err){}
      }
      return null;
    }

    const textareaSel = await findSelector(textareaSelectorCandidates);
    const imgSel = await findSelector(imgSelectorCandidates);
    const submitSel = await findSelector(submitSelectorCandidates);

    if(!textareaSel || !submitSel){
      sendSSE({ level:'error', msg: `Formulaire introuvable (textarea:${!!textareaSel}, submit:${!!submitSel})` });
      await browserInstance.close();
      botRunning = false;
      return;
    }

    sendSSE({ level:'info', msg: `Utilisation des sélecteurs: textarea="${textareaSel}", image="${imgSel}", submit="${submitSel}"` });

    for(let i=0;i<posts.length && !stopRequested;i++){
      const p = posts[i];
      sendSSE({ level:'info', msg: `Envoi post ${i+1}/${posts.length}: ${p.text}` });

      // Focus and type the text
      await page.focus(textareaSel);
      await page.evaluate((sel)=>{ document.querySelector(sel).value = ''; }, textareaSel);
      await page.type(textareaSel, p.text, { delay: 40 });

      // set image if selector exists
      if(imgSel && p.image){
        try {
          await page.evaluate((sel, val) => { const el = document.querySelector(sel); if(el) el.value = val; }, imgSel, p.image);
        } catch(err){
          sendSSE({ level:'error', msg: 'Erreur en définissant l\'image: ' + String(err) });
        }
      }

      // Click submit
      try {
        await page.click(submitSel);
        sendSSE({ level:'success', msg: `Post ${i+1} soumis.` });
      } catch(err){
        // fallback: dispatch submit event on form
        try {
          await page.evaluate((ts) => {
            const el = document.querySelector(ts);
            if(!el) return;
            let form = el.closest('form');
            if(form){ form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }
          }, submitSel);
          sendSSE({ level:'info', msg: 'Tentative alternative de soumission envoyée.' });
        } catch(e){
          sendSSE({ level:'error', msg: 'Impossible de cliquer sur submit: ' + String(e) });
        }
      }

      await page.waitForTimeout(delays.betweenPosts);
    }

    sendSSE({ level:'success', msg: 'Tous les posts traités.' });

  } catch (err) {
    sendSSE({ level:'error', msg: 'Erreur du bot: ' + String(err) });
  } finally {
    try{ await browserInstance.close(); }catch(e){}
    browserInstance = null;
    botRunning = false;
    sendSSE({ level:'info', msg: 'Bot terminé.' });
  }
}

// start express
app.listen(PORT, () => {
  console.log('Server listening on http://localhost:' + PORT);
  sendSSE({ level:'info', msg: 'Server démarré sur port ' + PORT });
});