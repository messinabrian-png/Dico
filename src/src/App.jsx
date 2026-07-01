import { useState, useEffect, useCallback, useRef } from "react";

// ─── Constants ───────────────────────────────────────────────────────────────
const STORAGE_KEY_PREFIX = "ledico_";
const POLL_INTERVAL = 1500;
const POINTS_CORRECT = 3;
const ROUND_COUNT = null; // dynamique : = nombre de joueurs

// ─── Utilities ───────────────────────────────────────────────────────────────
function genId(len = 6) {
  return Math.random().toString(36).slice(2, 2 + len).toUpperCase();
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Claude API ──────────────────────────────────────────────────────────────
async function fetchWordFromAI(usedWords = []) {
  const usedStr = usedWords.length > 0 ? `Mots déjà utilisés (ne pas répéter) : ${usedWords.join(", ")}.` : "";
  const prompt = `Tu es un générateur de mots rares mais réels en français pour un jeu de société.
${usedStr}
Génère UN seul mot français rare, peu connu, qui existe dans le dictionnaire Larousse ou Robert.
Évite les mots trop techniques ou scientifiques. Préfère des mots du vocabulaire courant ancien, littéraire, ou dialectal.
Réponds UNIQUEMENT en JSON valide (pas de markdown, pas de backticks) :
{"mot":"le_mot","definition":"La définition claire et concise en français, en une ou deux phrases maximum, commençant par la nature grammaticale (ex: n.m. , adj., v.tr., etc.)"}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await response.json();
  const text = data.content.map((b) => b.text || "").join("").trim();
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ─── Shared Storage Helpers ───────────────────────────────────────────────────
async function roomGet(roomId) {
  try {
    const r = await window.storage.get(`${STORAGE_KEY_PREFIX}room_${roomId}`, true);
    return r ? JSON.parse(r.value) : null;
  } catch { return null; }
}
async function roomSet(roomId, data) {
  await window.storage.set(`${STORAGE_KEY_PREFIX}room_${roomId}`, JSON.stringify(data), true);
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=IM+Fell+English:ital@0;1&family=Lato:wght@300;400;700&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --parchment: #f5edd6;
    --parchment-dark: #e8d9b5;
    --ink: #1a1207;
    --ink-light: #4a3b22;
    --sepia: #8b6914;
    --sepia-light: #c9a84c;
    --red: #8b1a1a;
    --green: #1a5c2e;
    --shadow: rgba(26,18,7,0.18);
  }

  body { background: #2c1f0e; font-family: 'Lato', sans-serif; min-height: 100vh; }

  .app {
    min-height: 100vh;
    background: radial-gradient(ellipse at top, #3d2b12, #1a0f04);
    display: flex; align-items: center; justify-content: center;
    padding: 1rem;
  }

  .page {
    background: var(--parchment);
    max-width: 680px; width: 100%;
    border-radius: 2px;
    box-shadow: 0 8px 60px rgba(0,0,0,0.6), inset 0 0 80px rgba(139,105,20,0.08);
    border: 1px solid var(--parchment-dark);
    overflow: hidden;
    position: relative;
  }

  .page::before {
    content: '';
    position: absolute; top: 0; left: 0; right: 0; bottom: 0;
    background: repeating-linear-gradient(0deg, transparent, transparent 28px, rgba(139,105,20,0.06) 28px, rgba(139,105,20,0.06) 29px);
    pointer-events: none;
  }

  .header {
    background: var(--ink);
    padding: 1.5rem 2rem;
    text-align: center;
    border-bottom: 3px double var(--sepia);
  }
  .header-title {
    font-family: 'Playfair Display', serif;
    font-size: 2.2rem; font-weight: 700;
    color: var(--parchment);
    letter-spacing: .15em;
    text-transform: uppercase;
  }
  .header-sub {
    font-family: 'IM Fell English', serif;
    font-style: italic;
    color: var(--sepia-light);
    font-size: 0.85rem;
    margin-top: .2rem;
    letter-spacing: .08em;
  }

  .content { padding: 2rem; position: relative; }

  /* ── Typography ── */
  h2 {
    font-family: 'Playfair Display', serif;
    color: var(--ink); font-size: 1.4rem;
    border-bottom: 1px solid var(--parchment-dark);
    padding-bottom: .5rem; margin-bottom: 1.2rem;
  }
  h3 {
    font-family: 'Playfair Display', serif;
    color: var(--ink-light); font-size: 1.1rem;
    margin-bottom: .6rem;
  }
  p { color: var(--ink-light); line-height: 1.6; font-size: .95rem; }
  label { display: block; font-size: .8rem; font-weight: 700; color: var(--sepia); letter-spacing: .1em; text-transform: uppercase; margin-bottom: .35rem; }

  /* ── Inputs ── */
  input, textarea {
    width: 100%; padding: .7rem .9rem;
    background: rgba(255,255,255,0.55);
    border: 1.5px solid var(--parchment-dark);
    border-radius: 2px;
    font-family: 'Lato', sans-serif; font-size: .95rem;
    color: var(--ink); outline: none;
    transition: border-color .2s;
  }
  input:focus, textarea:focus { border-color: var(--sepia); background: rgba(255,255,255,0.8); }
  textarea { resize: vertical; min-height: 90px; }

  /* ── Buttons ── */
  .btn {
    display: inline-block; padding: .7rem 1.6rem;
    font-family: 'Lato', sans-serif; font-weight: 700;
    font-size: .85rem; letter-spacing: .12em; text-transform: uppercase;
    border: none; border-radius: 2px; cursor: pointer;
    transition: all .15s;
  }
  .btn-primary {
    background: var(--ink); color: var(--parchment);
    box-shadow: 0 2px 8px var(--shadow);
  }
  .btn-primary:hover { background: var(--ink-light); transform: translateY(-1px); }
  .btn-secondary {
    background: transparent; color: var(--sepia);
    border: 1.5px solid var(--sepia-light);
  }
  .btn-secondary:hover { background: var(--parchment-dark); }
  .btn-danger { background: var(--red); color: var(--parchment); }
  .btn-success { background: var(--green); color: #e8f5ec; }
  .btn:disabled { opacity: .45; cursor: not-allowed; transform: none; }
  .btn-full { width: 100%; text-align: center; }

  /* ── Form group ── */
  .form-group { margin-bottom: 1.2rem; }
  .form-row { display: flex; gap: .8rem; }
  .form-row .form-group { flex: 1; }

  /* ── Divider ── */
  .divider {
    display: flex; align-items: center; gap: .8rem;
    margin: 1.4rem 0; color: var(--sepia-light); font-size: .8rem;
    letter-spacing: .1em; text-transform: uppercase;
  }
  .divider::before, .divider::after {
    content: ''; flex: 1; height: 1px; background: var(--parchment-dark);
  }

  /* ── Players list ── */
  .player-list { list-style: none; margin: .8rem 0; }
  .player-list li {
    display: flex; align-items: center; gap: .6rem;
    padding: .45rem .7rem; margin-bottom: .3rem;
    background: rgba(255,255,255,0.4);
    border: 1px solid var(--parchment-dark);
    border-radius: 2px; font-size: .9rem; color: var(--ink-light);
  }
  .player-list li .dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--sepia-light); flex-shrink: 0;
  }
  .player-list li.host .dot { background: var(--red); }
  .player-list li .score-badge {
    margin-left: auto; background: var(--ink); color: var(--parchment);
    font-size: .72rem; font-weight: 700;
    padding: .15rem .45rem; border-radius: 10px; letter-spacing: .05em;
  }

  /* ── Room code ── */
  .room-code {
    text-align: center; margin: 1rem 0;
    font-family: 'Playfair Display', serif;
    font-size: 2.8rem; font-weight: 700; letter-spacing: .25em;
    color: var(--sepia); background: rgba(255,255,255,0.5);
    padding: .6rem; border: 2px dashed var(--sepia-light); border-radius: 2px;
  }
  .room-code-label { text-align: center; font-size: .75rem; color: var(--ink-light); margin-top: .3rem; letter-spacing: .1em; text-transform: uppercase; }

  /* ── Word card ── */
  .word-card {
    background: rgba(255,255,255,0.5);
    border: 2px solid var(--parchment-dark);
    border-radius: 2px; padding: 1.4rem;
    margin-bottom: 1.4rem; text-align: center;
    box-shadow: inset 0 1px 4px rgba(139,105,20,0.1);
  }
  .word-label { font-size: .7rem; font-weight: 700; letter-spacing: .15em; text-transform: uppercase; color: var(--sepia); margin-bottom: .3rem; }
  .word-text {
    font-family: 'Playfair Display', serif;
    font-size: 2.2rem; font-weight: 700; color: var(--ink);
    letter-spacing: .05em;
  }
  .word-round { font-size: .75rem; color: var(--ink-light); margin-top: .3rem; }

  /* ── Definition choices ── */
  .def-list { list-style: none; margin: .5rem 0; }
  .def-item {
    padding: .85rem 1rem; margin-bottom: .6rem;
    background: rgba(255,255,255,0.45);
    border: 1.5px solid var(--parchment-dark);
    border-radius: 2px; cursor: pointer;
    font-size: .9rem; color: var(--ink-light); line-height: 1.5;
    transition: all .15s;
  }
  .def-item:hover { background: rgba(255,255,255,0.75); border-color: var(--sepia-light); }
  .def-item.selected { border-color: var(--sepia); background: rgba(201,168,76,0.18); color: var(--ink); }
  .def-item.correct { border-color: var(--green); background: rgba(26,92,46,0.1); }
  .def-item.wrong { border-color: var(--red); background: rgba(139,26,26,0.06); }
  .def-item .def-tag {
    display: block; font-size: .68rem; font-weight: 700;
    letter-spacing: .1em; text-transform: uppercase;
    margin-bottom: .3rem;
  }
  .def-item .def-tag.correct-tag { color: var(--green); }
  .def-item .def-tag.wrong-tag { color: var(--red); }
  .def-item .def-tag.voters { color: var(--sepia); }

  /* ── Progress bar ── */
  .progress { margin: .8rem 0; }
  .progress-bar { height: 4px; background: var(--parchment-dark); border-radius: 2px; }
  .progress-fill { height: 100%; background: var(--sepia); border-radius: 2px; transition: width .4s; }
  .progress-label { font-size: .75rem; color: var(--ink-light); margin-top: .3rem; }

  /* ── Score table ── */
  .score-table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
  .score-table th {
    text-align: left; padding: .5rem .7rem;
    font-size: .72rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase;
    color: var(--sepia); border-bottom: 2px solid var(--parchment-dark);
  }
  .score-table td { padding: .55rem .7rem; font-size: .9rem; color: var(--ink-light); border-bottom: 1px solid var(--parchment-dark); }
  .score-table tr.me td { font-weight: 700; color: var(--ink); background: rgba(201,168,76,0.12); }
  .score-table .rank { font-family: 'Playfair Display', serif; font-size: 1rem; color: var(--sepia); }
  .score-table .pts { font-family: 'Playfair Display', serif; font-size: 1.15rem; font-weight: 700; color: var(--ink); text-align: right; }

  /* ── Status pill ── */
  .status { display: inline-block; padding: .25rem .8rem; border-radius: 20px; font-size: .72rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  .status-waiting { background: rgba(139,105,20,.12); color: var(--sepia); }
  .status-writing { background: rgba(26,18,7,.1); color: var(--ink); }
  .status-voting { background: rgba(139,26,26,.1); color: var(--red); }

  /* ── Toast ── */
  .toast {
    position: fixed; bottom: 1.5rem; left: 50%; transform: translateX(-50%);
    background: var(--ink); color: var(--parchment);
    padding: .7rem 1.4rem; border-radius: 2px;
    font-size: .85rem; font-weight: 700; letter-spacing: .05em;
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    animation: slideUp .25s ease;
    z-index: 999;
  }
  @keyframes slideUp { from { opacity: 0; transform: translateX(-50%) translateY(12px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }

  /* ── Loading ── */
  .loading { text-align: center; padding: 2rem; }
  .spinner {
    width: 36px; height: 36px; border-radius: 50%;
    border: 3px solid var(--parchment-dark); border-top-color: var(--sepia);
    animation: spin .8s linear infinite; margin: 0 auto 1rem;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Misc ── */
  .text-center { text-align: center; }
  .mt-1 { margin-top: .5rem; } .mt-2 { margin-top: 1rem; } .mt-3 { margin-top: 1.5rem; }
  .mb-1 { margin-bottom: .5rem; } .mb-2 { margin-bottom: 1rem; }
  .muted { color: var(--ink-light); font-size: .85rem; }
  .ornament { text-align: center; color: var(--sepia-light); font-size: 1.2rem; margin: 1rem 0; letter-spacing: .4em; }
`;

// ─── Phase: Lobby ────────────────────────────────────────────────────────────
function LobbyScreen({ room, roomId, myId, onStart }) {
  const isHost = room.hostId === myId;
  const players = Object.values(room.players || {});
  const canStart = players.length >= 2;

  const copyCode = () => {
    navigator.clipboard.writeText(roomId).catch(() => {});
  };

  return (
    <div className="content">
      <h2>Salon d'attente</h2>
      <div className="room-code" onClick={copyCode} style={{ cursor: "pointer" }} title="Cliquer pour copier">{roomId}</div>
      <p className="room-code-label">Code de partie · Partagez-le à vos amis</p>

      <div className="mt-2 mb-2">
        <label>Joueurs connectés ({players.length})</label>
        <ul className="player-list">
          {players.map(p => (
            <li key={p.id} className={p.id === room.hostId ? "host" : ""}>
              <span className="dot" />
              {p.name} {p.id === room.hostId ? "★" : ""} {p.id === myId ? "(moi)" : ""}
            </li>
          ))}
        </ul>
      </div>

      {isHost ? (
        <>
          {!canStart && <p className="muted mb-2">Il faut au moins 2 joueurs pour commencer.</p>}
          <button className="btn btn-primary btn-full" onClick={onStart} disabled={!canStart}>
            Commencer la partie ({players.length} manche{players.length > 1 ? "s" : ""})
          </button>
        </>
      ) : (
        <div className="loading">
          <div className="spinner" />
          <p className="muted">En attente que l'hôte lance la partie…</p>
        </div>
      )}
    </div>
  );
}

// ─── Phase: Writing ───────────────────────────────────────────────────────────
function WritingScreen({ room, myId, onSubmit }) {
  const [def, setDef] = useState("");
  const round = room.rounds[room.currentRound];
  const myPlayer = room.players[myId];
  const hasSubmitted = round.definitions && round.definitions[myId];
  const players = Object.values(room.players || {});
  const submitted = Object.keys(round.definitions || {}).length;

  if (hasSubmitted) {
    return (
      <div className="content">
        <div className="word-card">
          <div className="word-label">Le mot</div>
          <div className="word-text">{round.word}</div>
          <div className="word-round">Manche {room.currentRound + 1} / {Object.keys(room.players).length}</div>
        </div>
        <div className="loading">
          <div className="spinner" />
          <p className="muted">Votre définition a été soumise !</p>
          <p className="muted mt-1">En attente des autres joueurs…</p>
        </div>
        <div className="progress mt-2">
          <div className="progress-bar"><div className="progress-fill" style={{ width: `${(submitted / players.length) * 100}%` }} /></div>
          <p className="progress-label">{submitted} / {players.length} définitions reçues</p>
        </div>
      </div>
    );
  }

  return (
    <div className="content">
      <div className="word-card">
        <div className="word-label">Le mot</div>
        <div className="word-text">{round.word}</div>
        <div className="word-round">Manche {room.currentRound + 1} / {Object.keys(room.players).length}</div>
      </div>
      <div className="form-group">
        <label>Votre définition</label>
        <textarea
          value={def}
          onChange={e => setDef(e.target.value)}
          placeholder={`À votre avis, que signifie « ${round.word} » ?`}
          maxLength={300}
        />
        <p className="muted mt-1" style={{ fontSize: ".75rem" }}>{def.length}/300 caractères</p>
      </div>
      <button className="btn btn-primary btn-full" onClick={() => onSubmit(def)} disabled={def.trim().length < 5}>
        Soumettre ma définition
      </button>
      <div className="progress mt-2">
        <div className="progress-bar"><div className="progress-fill" style={{ width: `${(submitted / players.length) * 100}%` }} /></div>
        <p className="progress-label">{submitted} / {players.length} définitions reçues</p>
      </div>
    </div>
  );
}

// ─── Phase: Voting ────────────────────────────────────────────────────────────
function VotingScreen({ room, myId, onVote }) {
  const [voted, setVoted] = useState(null);
  const round = room.rounds[room.currentRound];
  const players = Object.values(room.players || {});
  const myDef = round.definitions?.[myId];
  const voteCount = Object.keys(round.votes || {}).length;
  const hasVoted = round.votes && round.votes[myId];

  // Build shuffled list: all player defs + real def
  const choices = round.shuffledChoices || [];

  if (hasVoted) {
    return (
      <div className="content">
        <div className="word-card">
          <div className="word-label">Le mot</div>
          <div className="word-text">{round.word}</div>
        </div>
        <div className="loading">
          <div className="spinner" />
          <p className="muted">Vote enregistré !</p>
        </div>
        <div className="progress mt-2">
          <div className="progress-bar"><div className="progress-fill" style={{ width: `${(voteCount / players.length) * 100}%` }} /></div>
          <p className="progress-label">{voteCount} / {players.length} votes reçus</p>
        </div>
      </div>
    );
  }

  return (
    <div className="content">
      <div className="word-card">
        <div className="word-label">Le mot</div>
        <div className="word-text">{round.word}</div>
      </div>
      <h3>Quelle est la vraie définition ?</h3>
      <p className="muted mb-2">Votez pour la définition qui vous semble correcte.</p>
      <ul className="def-list">
        {choices.map((c, i) => (
          <li
            key={i}
            className={`def-item${voted === i ? " selected" : ""}${c.authorId === myId ? " selected" : ""}`}
            onClick={() => {
              if (c.authorId === myId) return; // can't vote for yourself
              setVoted(i);
              onVote(c.id);
            }}
            style={{ opacity: c.authorId === myId ? 0.55 : 1, cursor: c.authorId === myId ? "default" : "pointer" }}
          >
            {c.authorId === myId && <span className="def-tag wrong-tag">Votre définition</span>}
            {c.definition}
          </li>
        ))}
      </ul>
      <div className="progress mt-2">
        <div className="progress-bar"><div className="progress-fill" style={{ width: `${(voteCount / players.length) * 100}%` }} /></div>
        <p className="progress-label">{voteCount} / {players.length} votes reçus</p>
      </div>
    </div>
  );
}

// ─── Phase: Results (per round) ───────────────────────────────────────────────
function ResultsScreen({ room, myId, onNext, isLastRound }) {
  const round = room.rounds[room.currentRound];
  const isHost = room.hostId === myId;
  const choices = round.shuffledChoices || [];
  const votes = round.votes || {};

  // Count votes per choice id
  const votesPerChoice = {};
  Object.values(votes).forEach(choiceId => {
    votesPerChoice[choiceId] = (votesPerChoice[choiceId] || 0) + 1;
  });

  return (
    <div className="content">
      <div className="word-card">
        <div className="word-label">Révélation — Manche {room.currentRound + 1}</div>
        <div className="word-text">{round.word}</div>
      </div>

      <ul className="def-list">
        {choices.map((c, i) => {
          const isReal = c.isReal;
          const vcount = votesPerChoice[c.id] || 0;
          const voterNames = Object.entries(votes)
            .filter(([, cid]) => cid === c.id)
            .map(([pid]) => room.players[pid]?.name || "?");
          return (
            <li key={i} className={`def-item ${isReal ? "correct" : "wrong"}`} style={{ cursor: "default" }}>
              {isReal
                ? <span className="def-tag correct-tag">✓ La vraie définition</span>
                : <span className="def-tag wrong-tag">{c.authorId ? `Inventée par ${room.players[c.authorId]?.name || "?"}` : "Inventée"}</span>
              }
              {c.definition}
              {vcount > 0 && (
                <span className="def-tag voters" style={{ marginTop: ".4rem" }}>
                  {vcount} vote{vcount > 1 ? "s" : ""} — {voterNames.join(", ")}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="ornament">✦ ✦ ✦</div>

      {isHost && (
        <button className="btn btn-primary btn-full" onClick={onNext}>
          {isLastRound ? "Voir les scores finaux" : "Manche suivante →"}
        </button>
      )}
      {!isHost && <p className="muted text-center">En attente de l'hôte…</p>}
    </div>
  );
}

// ─── Phase: Final Scores ──────────────────────────────────────────────────────
function FinalScreen({ room, myId, onRestart }) {
  const isHost = room.hostId === myId;
  const players = Object.values(room.players || {}).sort((a, b) => (b.score || 0) - (a.score || 0));

  return (
    <div className="content">
      <h2>Résultats finaux</h2>
      <div className="ornament">❧</div>
      <table className="score-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Joueur</th>
            <th style={{ textAlign: "right" }}>Points</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p, i) => (
            <tr key={p.id} className={p.id === myId ? "me" : ""}>
              <td className="rank">{i + 1}</td>
              <td>{p.name} {p.id === myId ? "(moi)" : ""}</td>
              <td className="pts">{p.score || 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted mt-2" style={{ fontSize: ".8rem" }}>
        <strong>Rappel :</strong> +{POINTS_CORRECT} pts pour la bonne réponse, +1 pt par personne qui a voté pour votre définition.
      </p>
      <div className="ornament mt-3">✦</div>
      {isHost && (
        <button className="btn btn-primary btn-full mt-2" onClick={onRestart}>
          Nouvelle partie
        </button>
      )}
      {!isHost && <p className="muted text-center mt-2">Merci d'avoir joué !</p>}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("home"); // home | join | game
  const [playerName, setPlayerName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [roomId, setRoomId] = useState(null);
  const [myId] = useState(() => genId(8));
  const [room, setRoom] = useState(null);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef(null);

  const showToast = (msg, dur = 2500) => {
    setToast(msg);
    setTimeout(() => setToast(null), dur);
  };

  // ── Polling ──
  const startPolling = useCallback((rid) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const r = await roomGet(rid);
      if (r) setRoom({ ...r });
    }, POLL_INTERVAL);
  }, []);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // ── Create Room ──
  const handleCreate = async () => {
    if (!playerName.trim()) return showToast("Entrez votre prénom !");
    setLoading(true);
    const rid = genId(4);
    const newRoom = {
      hostId: myId,
      phase: "lobby",
      currentRound: 0,
      rounds: [],
      players: { [myId]: { id: myId, name: playerName.trim(), score: 0 } },
      usedWords: [],
    };
    await roomSet(rid, newRoom);
    setRoomId(rid);
    setRoom(newRoom);
    startPolling(rid);
    setScreen("game");
    setLoading(false);
  };

  // ── Join Room ──
  const handleJoin = async () => {
    if (!playerName.trim()) return showToast("Entrez votre prénom !");
    if (!joinCode.trim()) return showToast("Entrez le code de la partie !");
    setLoading(true);
    const rid = joinCode.trim().toUpperCase();
    const r = await roomGet(rid);
    if (!r) { setLoading(false); return showToast("Code invalide ou partie introuvable."); }
    if (r.phase !== "lobby") { setLoading(false); return showToast("Cette partie a déjà commencé !"); }
    r.players[myId] = { id: myId, name: playerName.trim(), score: 0 };
    await roomSet(rid, r);
    setRoomId(rid);
    setRoom(r);
    startPolling(rid);
    setScreen("game");
    setLoading(false);
  };

  // ── Start Game ──
  const handleStart = async () => {
    setLoading(true);
    const r = await roomGet(roomId);
    // Fetch first word
    try {
      const { mot, definition } = await fetchWordFromAI(r.usedWords || []);
      r.usedWords = [...(r.usedWords || []), mot];
      r.rounds = [{ word: mot, realDefinition: definition, definitions: {}, votes: {}, shuffledChoices: null }];
      r.phase = "writing";
      r.currentRound = 0;
      await roomSet(roomId, r);
      setRoom({ ...r });
    } catch (e) {
      showToast("Erreur IA, réessayez.");
    }
    setLoading(false);
  };

  // ── Submit Definition ──
  const handleSubmitDef = async (def) => {
    const r = await roomGet(roomId);
    const round = r.rounds[r.currentRound];
    round.definitions[myId] = def;
    // Check if all submitted
    const players = Object.values(r.players);
    if (Object.keys(round.definitions).length >= players.length) {
      // Build shuffled choices
      const realId = "real";
      const choices = [
        { id: realId, definition: round.realDefinition, isReal: true, authorId: null },
        ...Object.entries(round.definitions).map(([pid, d]) => ({
          id: `def_${pid}`,
          definition: d,
          isReal: false,
          authorId: pid,
        })),
      ];
      round.shuffledChoices = shuffle(choices);
      r.phase = "voting";
    }
    r.rounds[r.currentRound] = round;
    await roomSet(roomId, r);
    setRoom({ ...r });
  };

  // ── Vote ──
  const handleVote = async (choiceId) => {
    const r = await roomGet(roomId);
    const round = r.rounds[r.currentRound];
    round.votes[myId] = choiceId;
    const players = Object.values(r.players);
    if (Object.keys(round.votes).length >= players.length) {
      // Calculate scores
      const realChoice = round.shuffledChoices.find(c => c.isReal);
      Object.entries(round.votes).forEach(([pid, cid]) => {
        if (cid === realChoice.id) {
          r.players[pid].score = (r.players[pid].score || 0) + POINTS_CORRECT;
        }
      });
      // +1 per vote for fake definitions
      round.shuffledChoices.filter(c => !c.isReal && c.authorId).forEach(c => {
        const voteCount = Object.values(round.votes).filter(v => v === c.id).length;
        if (voteCount > 0 && r.players[c.authorId]) {
          r.players[c.authorId].score = (r.players[c.authorId].score || 0) + voteCount;
        }
      });
      r.phase = "results";
    }
    r.rounds[r.currentRound] = round;
    await roomSet(roomId, r);
    setRoom({ ...r });
  };

  // ── Next Round ──
  const handleNext = async () => {
    const r = await roomGet(roomId);
    const nextRound = r.currentRound + 1;
    const roundCount = Object.keys(r.players).length;
    if (nextRound >= roundCount) {
      r.phase = "final";
    } else {
      setLoading(true);
      try {
        const { mot, definition } = await fetchWordFromAI(r.usedWords || []);
        r.usedWords = [...(r.usedWords || []), mot];
        r.rounds.push({ word: mot, realDefinition: definition, definitions: {}, votes: {}, shuffledChoices: null });
        r.currentRound = nextRound;
        r.phase = "writing";
      } catch {
        showToast("Erreur IA, réessayez.");
        setLoading(false);
        return;
      }
      setLoading(false);
    }
    await roomSet(roomId, r);
    setRoom({ ...r });
  };

  // ── Restart ──
  const handleRestart = async () => {
    const r = await roomGet(roomId);
    r.phase = "lobby";
    r.currentRound = 0;
    r.rounds = [];
    Object.keys(r.players).forEach(pid => { r.players[pid].score = 0; });
    await roomSet(roomId, r);
    setRoom({ ...r });
  };

  // ─── Render ───
  const renderGame = () => {
    if (!room) return <div className="loading content"><div className="spinner" /><p className="muted">Connexion…</p></div>;
    if (loading) return <div className="loading content"><div className="spinner" /><p className="muted">Génération du mot par l'IA…</p></div>;

    const { phase } = room;
    if (phase === "lobby") return <LobbyScreen room={room} roomId={roomId} myId={myId} onStart={handleStart} />;
    if (phase === "writing") return <WritingScreen room={room} myId={myId} onSubmit={handleSubmitDef} />;
    if (phase === "voting") return <VotingScreen room={room} myId={myId} onVote={handleVote} />;
    if (phase === "results") return <ResultsScreen room={room} myId={myId} onNext={handleNext} isLastRound={room.currentRound >= Object.keys(room.players).length - 1} />;
    if (phase === "final") return <FinalScreen room={room} myId={myId} onRestart={handleRestart} />;
    return null;
  };

  return (
    <>
      <style>{styles}</style>
      <div className="app">
        <div className="page">
          <div className="header">
            <div className="header-title">Le Dictionnaire</div>
            <div className="header-sub">Le jeu des définitions imaginaires</div>
          </div>

          {screen === "home" && (
            <div className="content">
              <div className="form-group">
                <label>Votre prénom</label>
                <input value={playerName} onChange={e => setPlayerName(e.target.value)} placeholder="Comment vous appelle-t-on ?" maxLength={20} />
              </div>
              <button className="btn btn-primary btn-full" onClick={handleCreate} disabled={loading || !playerName.trim()}>
                Créer une partie
              </button>
              <div className="divider">ou</div>
              <div className="form-row">
                <div className="form-group">
                  <label>Code de partie</label>
                  <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} placeholder="Ex: AB3C" maxLength={6} />
                </div>
              </div>
              <button className="btn btn-secondary btn-full" onClick={handleJoin} disabled={loading || !playerName.trim() || !joinCode.trim()}>
                Rejoindre une partie
              </button>
              <div className="ornament mt-3">❦</div>
              <p className="muted text-center" style={{ fontSize: ".8rem" }}>
                1 manche par joueur · +{POINTS_CORRECT} pts bonne réponse · +1 pt par vote reçu
              </p>
            </div>
          )}

          {screen === "game" && renderGame()}
        </div>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
