// Every word the game shows, in one place (easy to translate later). The
// how-to-play guide and the rules sheet are here too, so the in-game help and
// Notes/HOW-TO-PLAY.md say the same thing.
globalThis.HS = globalThis.HS || {};
(function (HS) {
  "use strict";
  const EN = {
    title: "ROOFTOP SPADES", tag: "Partnership Spades on a city rooftop. You and the player across the table are a team.",
    play: "Play", playSolo: "Play", howTo: "How to play", rules: "Rules", settings: "Settings",
    bots: "Bots", easy: "Easy", normal: "Normal", sharp: "Sharp",
    timer: "Turn timer", off: "Off", on: "On", secs: "{0} s",
    gameTo: "Game to", chaos: "Chaos bots", chaosHelp: "Bots sometimes cut their own partner, just for the drama.",
    blindNil: "Blind nil", hostPicks: "You're the host: these options go for every game on the roof.", waitHost: "The host picks the options.",
    seatsNote: "{0} at the table, {1} bots fill the other seats.", soloNote: "Walk up to a table and sit down. Bots fill the empty chairs.",
    // The walk-up rooftop.
    walkIn: "Step onto the roof", lobbyNote: "Walk up to a table and sit down. Sit at the same table to play together: the player across from you is your partner.",
    tierRegular: "Regular", tierRookie: "Rookie", tierSharp: "Sharp", tableWord: "table",
    tierSubRegular: "Normal bots", tierSubRookie: "Easy bots", tierSubSharp: "Sharp bots",
    walkKeysDesk: "WASD or arrows to walk · Shift to hurry · drag to look · E to sit down",
    walkKeysTouch: "Left side: walk stick · drag to look · tap Sit down at a table",
    sitDown: "Sit down", sitJoin: "Join the game", sitTable: "{0} table", sitBots: "{0} · bots fill the empty chairs", sitPlaying: "{0} at the table · take a bot's chair",
    tableDone: "Game over at this table: the next round starts after HopLobby's results.",
    busyTable: "A game is on at the {0} table: join them there.", tableFull: "The table is full: watch from here.", sitting: "Sitting down…", noAnswer: "No answer from the host: try again.",
    boardOpen: "Open · walk up and sit down", boardBots: "Bots playing · sit down to take a chair", boardPlaying: "Playing: {0} · {1} chairs free", boardPlaying1: "Playing: {0} · 1 chair free", boardFull: "Full: {0}", boardMore: "{0} +{1}",
    standUp: "Stand up", standShort: "Stand up", tStood: "{0} got up: a bot takes the chair", tSat: "{0} sat down",
    keysDesk: "Drag to look around · hover a card in your tray to lift it, click to play · 1 2 3 look at partner, left, right · Space back to your hand · Z zoom in on the last card · R reactions · H rules · P settings",
    keysTouch: "Drag to look around · tap a card to lift it, tap again to play",
    boot1: "Setting up the rooftop…", boot2: "Hanging the lights…", boot3: "Shuffling the deck…", ready: "Ready",
    // Status line.
    yourBid: "Your bid", yourTurn: "Your turn: play a card", yourLead: "Your lead", bidding: "{0} is bidding…", playing: "{0} is playing…",
    dealing: "{0} deals…", trickTo: "{0} takes the trick", handOver: "Hand over", watching: "Watching (the table is full)",
    // The chat feed (left side) and the status line.
    zoomAuto: "Zoom each card played", zoomCap: "{0} played", zoomNone: "No card played yet",
    ledTag: "Led", partnerTag: "Partner", chatBid: "bids {0}", chatTook: "takes the trick", chatTookYou: "take the trick", ledSuit: "{0} led",
    thinking: "thinking…", waiting: " ", took: "took {0}", timeLeft: "{0}s",
    // Bidding panel.
    bidTitle: "How many tricks will you take?", bidNil: "Nil", bidBlind: "Blind nil", bidLook: "Look at your cards",
    bidHint: "Suggested: {0}", bidPartner: "Partner bid {0}", bidBlindHelp: "You're 100+ behind: you may bid blind nil (+/-200) before looking.",
    teamBid: "Your team: {0}", yourBidIs: "Your bid", tagBid: "BID {0} · took {1}", tagBidding: "bidding…", tagNoBid: "no bid yet",
    // Scores.
    us: "US", them: "THEM", bags: "bags {0}", bid: "bid", took2: "took", hand: "Hand {0}", target: "to {0}",
    // Hand summary.
    sumTitle: "Hand {0}", sumBid: "Bid", sumTook: "Took", sumPoints: "Points", sumBags: "Bags", sumTotal: "Total",
    sumNilMade: "{0} made nil +{1}", sumNilFail: "{0} missed nil −{1}", sumSet: "Set: −{0}", sumMade: "Made it: +{0}", sumPenalty: "10 bags: −{0}",
    nextIn: "Next hand in {0}…", dealNow: "Deal now",
    // Game over.
    youWin: "You win!", youLose: "They win", teamWins: "{0} win", finalScore: "{0} – {1}", cutsLine: "Partner cuts: {0}", coversLine: "Nice covers: {0}",
    playAgain: "Play again", playAgainHost: "Play again (everyone)", endAll: "End game for everyone", backLobby: "Back to the lobby", backMenu: "Back to the menu", waitNext: "Waiting for the host…",
    // Events (toasts and tags).
    tagCut: "Cut your partner", tagCutTop: "Cut your partner's top card", tagNil: "Nil broken by partner", tagCover: "Nice cover",
    // {1} in tCutTop / tNilCut / tCover and {0} in tNilBroken are possessives ("Tasha's", "your"): main.js poss().
    tCut: "{0} cut {1}", tCutTop: "{0} cut {1} top card", tNilCut: "{0} left {1} nil uncovered", tCover: "{0} covered {1} nil",
    tBroken: "Spades are broken", tNilBroken: "{0} nil is broken", yourPoss: "your", youObj: "you", youTakeTrick: "You take the trick",
    playCard: "Play {0}", tNilMade: "{0} made nil!", tBlindMade: "{0} made blind nil!", tSet: "{0} got set", tBoston: "{0} took all 13!",
    tBagPenalty: "{0}: 10 bags, −100", tTimeout: "Time's up: a card was played for {0}", tLeft: "{0} left: a bot keeps their seat", tJoined: "{0} sat down", tHostNow: "You're the host now",
    teamUs: "You & {0}", teamThem: "{0} & {1}", you: "You",
    // Reactions.
    r_wave: "Wave", r_cheer: "Cheer", r_shrug: "Shrug", r_thumbs: "Thumbs up", r_clap: "Clap", r_nod: "Nod", r_shake: "Head shake", r_laugh: "Laugh", r_facepalm: "Facepalm", r_point: "Point at partner",
    reactions: "Reactions",
    // Settings.
    music: "Music", sound: "Sound", graphics: "Graphics", high: "High", medium: "Medium", low: "Low", assist: "Glow legal cards", reactAuto: "Table reactions", tags: "Name tags",
    resume: "Back to the table", sens: "Look speed",
    hlTitle: "HopLobby settings", hlVolume: "Volume", hlInvert: "Invert look", hlFov: "Field of view", hlGame: "This game",
    hlNote: "These follow HopLobby's settings: change them in its menu (Esc).", hlMuted: "Muted", hlVolLine: "Master {0}% · Music {1}% · Effects {2}%", auto: "Auto", ultra: "Ultra", potato: "Potato", yes: "Yes", no: "No",
    rotate: "Turn your phone sideways for the best view.", rotateOk: "Play anyway",
    close: "Close", next: "Next", skip: "Skip tutorial", done: "Done"
  };
  // The rules sheet (H). Short sections, the standard game.
  const RULES = [
    ["The game", "Four players, two teams: you and the player across the table are partners. Win as many tricks as your team bids. First team to 500 wins; a team at −200 loses."],
    ["Bidding", "After the deal everyone bids, starting left of the dealer, how many tricks they'll take (1–13). Your team's bid is you plus your partner. <b>Nil</b> (0) means you promise to take no tricks: +100 if you make it, −100 if you don't. <b>Blind nil</b>, bid before looking at your cards, is ±200 and only allowed when your team is 100 or more behind."],
    ["Playing", "The player left of the dealer leads. Everyone plays one card, clockwise. <b>Follow suit</b> if you can. If you can't, play anything, including a spade. The highest card of the suit led wins, unless someone played a spade: then the highest spade wins. The winner leads next."],
    ["Spades", "Spades are trumps. You can't <b>lead</b> a spade until one has been played on another suit (spades are “broken”), unless you have nothing but spades."],
    ["Scoring", "Make your bid: 10 points per trick bid, +1 for each extra trick (a <b>bag</b>). Miss it (you're <b>set</b>): −10 per trick bid. Every 10 bags costs 100 points. Tricks a nil bidder takes count as bags for the team."],
    ["Cutting your partner", "Trumping a trick your partner was already winning, or leaving your nil partner to take a trick you could have covered. The table notices: your partner reacts and a tag shows over your seat. Cover them well and you get a nod instead."],
    ["The rooftop", "Three tables: <b>Rookie</b> (easy bots), <b>Regular</b> and <b>Sharp</b>. Walk with <b>WASD</b> or the arrows (Shift to hurry; on a phone, the stick on the left), walk up to a chair and press <b>E</b> (or tap Sit down). Friends who sit at the same table play with you; bots fill the empty chairs. <b>Q</b> or Stand up gets you out of your chair: a bot keeps it warm."],
    ["Controls", "Drag to look around. Hover a card in your tray to lift it and click to play it (on a phone: tap to lift, tap again to play). <b>1 2 3</b> look at your partner, left, right; <b>4</b> the trick; <b>Space</b> back to your hand. <b>Z</b> (or 🔍, or tapping a card in the feed) zooms in on the last card played. <b>R</b> reactions, <b>Tab</b> scores, <b>H</b> rules, <b>P</b> settings. Esc is HopLobby's menu."]
  ];
  // The tutorial: a guided hand against three bots. Each step waits for something to happen.
  const TUTORIAL = [
    { id: "look", text: "Welcome to the rooftop. You're sitting at the table: <b>drag</b> to look around. Your <b>partner</b> sits straight across from you; the other two are your opponents.", wait: "look" },
    { id: "keys", text: "Press <b>1</b>, <b>2</b> or <b>3</b> to glance at your partner, the player on your left, or on your right. <b>Space</b> brings you back to your cards.", wait: "next" },
    { id: "hand", text: "These are your 13 cards, standing in your tray and sorted by suit. <b>Spades</b> beat every other suit, so count them.", wait: "next" },
    { id: "bid", text: "Time to <b>bid</b>: how many tricks do you think you'll win? Aces, kings and lots of spades win tricks. The suggestion is a good start.", wait: "bid" },
    { id: "follow", text: "Play goes clockwise. <b>Follow suit</b> if you can: the glowing cards are the ones you're allowed to play. Click one to play it.", wait: "play" },
    { id: "trick", text: "The highest card of the suit led takes the trick, unless someone trumps it with a spade. Keep playing: watch who wins each one.", wait: "tricks3" },
    { id: "cut", text: "<b>Cutting your partner</b>: if your partner is already winning a trick, don't trump it with a spade. Your partner will let you know. Sometimes you have no choice, and that's fine.", wait: "next" },
    { id: "react", text: "Press <b>R</b> (or the smile button) to react: wave, cheer, shrug, clap, and more. Everyone at the table sees it.", wait: "react" },
    { id: "score", text: "Make your team's bid and you score 10 a trick; miss it and you lose that much. Extra tricks are <b>bags</b>: ten of them cost 100. Play the hand out!", wait: "handEnd" },
    { id: "done", text: "That's Spades! First team to 500 wins. Press <b>H</b> any time for the rules. Good luck.", wait: "next", last: true }
  ];
  let lang = EN;
  HS.t = function (k) {
    let s = lang[k] !== undefined ? lang[k] : EN[k] !== undefined ? EN[k] : k;
    for (let i = 1; i < arguments.length; i++) s = s.split("{" + (i - 1) + "}").join(String(arguments[i]));
    return s;
  };
  HS.RULES = RULES;
  HS.TUTORIAL = TUTORIAL;
  HS.setLang = function () { lang = EN; };
  HS.fillStrings = function () {
    if (typeof document === "undefined") return;
    document.querySelectorAll("[data-t]").forEach(function (el) { el.textContent = HS.t(el.getAttribute("data-t")); });
  };
})(globalThis.HS);
