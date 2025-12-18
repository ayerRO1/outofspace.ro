/* OUTOFSPACE — WARP GATE (Canvas, mobile-first, skill-based)
   Controls: Hold (mouse/touch) to charge, release to warp.
   Keyboard: R restart, P pause.
*/
(() => {
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");

  const uiScore  = document.getElementById("uiScore");
  const uiStreak = document.getElementById("uiStreak");
  const uiFuel   = document.getElementById("uiFuel");
  const uiStage  = document.getElementById("uiStage");
  const uiGates  = document.getElementById("uiGates");

  const overlay = document.getElementById("overlay");
  const btnStart = document.getElementById("btnStart");
  const btnPractice = document.getElementById("btnPractice");

  const toastEl = document.getElementById("toast");

  // ---------- Utils ----------
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const lerp = (a,b,t)=>a+(b-a)*t;
  const rnd = (a,b)=>a+Math.random()*(b-a);
  const dist2 = (ax,ay,bx,by)=>((ax-bx)*(ax-bx)+(ay-by)*(ay-by));
  const now = ()=>performance.now();

  function showToast(msg, ms=1100){
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(()=>toastEl.classList.remove("show"), ms);
  }

  // Audio (minimal, premium) — lazy-init after user gesture
  let audioCtx = null;
  function A(){
    if(audioCtx) return audioCtx;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }
  function beep({type="sine", f=440, t=0.07, v=0.04, det=0}){
    try{
      const ac = A();
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type;
      o.frequency.value = f;
      if(det) o.detune.value = det;
      g.gain.value = v;
      o.connect(g); g.connect(ac.destination);
      const n = ac.currentTime;
      o.start(n);
      g.gain.exponentialRampToValueAtTime(0.0001, n + t);
      o.stop(n + t);
    }catch{}
  }
  function noise(t=0.08, v=0.03){
    try{
      const ac = A();
      const len = Math.floor(ac.sampleRate * t);
      const b = ac.createBuffer(1, len, ac.sampleRate);
      const d = b.getChannelData(0);
      for(let i=0;i<len;i++) d[i] = (Math.random()*2-1)*(1 - i/len);
      const src = ac.createBufferSource();
      const g = ac.createGain();
      g.gain.value = v;
      src.buffer = b;
      src.connect(g); g.connect(ac.destination);
      src.start();
    }catch{}
  }

  // ---------- Canvas sizing ----------
  let W=0,H=0,DPR=1;
  function resize(){
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.floor(innerWidth * DPR);
    H = Math.floor(innerHeight * DPR);
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = innerWidth + "px";
    canvas.style.height = innerHeight + "px";
  }
  addEventListener("resize", resize, {passive:true});
  resize();

  // ---------- World ----------
  const ACCENT = "#A6FF4D";
  const BG1 = "#070A12";
  const BG2 = "#0B0F1A";

  const STAGES = ["Brief","Concept","Design","Ads","Launch"];
  const WORDS = ["Brand","CTA","ROI","+Awareness","Strategy","Story","Craft","Signal","Impact","Unforgettable"];
  const EASTER = ["Out of this world.", "Out of the box.", "Make it bold.", "No fluff. Just signal."];

  // Starfield (premium subtle)
  const stars = [];
  function initStars(){
    stars.length = 0;
    const count = Math.floor((innerWidth*innerHeight)/9000);
    for(let i=0;i<count;i++){
      stars.push({
        x: Math.random(),
        y: Math.random(),
        r: rnd(0.6, 1.6),
        a: rnd(0.12, 0.9),
        tw: rnd(0, Math.PI*2),
        sp: rnd(0.3, 1.2),
      });
    }
  }
  initStars();

  // Planets (parallax props)
  const planets = [];
  function initPlanets(){
    planets.length = 0;
    const n = 8;
    for(let i=0;i<n;i++){
      planets.push({
        x: rnd(0.1, 0.9),
        y: rnd(0.1, 0.9),
        r: rnd(14, 64),
        hue: Math.floor(rnd(0, 360)),
        ring: Math.random() < 0.35,
        par: rnd(0.04, 0.16),
      });
    }
  }
  initPlanets();

  // ---------- Game State ----------
  const input = {
    holding:false,
    holdStart:0,
    holdPower:0, // 0..1
    pointerX:0, pointerY:0,
    paused:false
  };

  const ship = {
    x: 0, y: 0,
    vx: 0, vy: 0,
    r: 14,
    trail: [],
    dashT: 0,
  };

  let gate = null;
  let debris = [];
  let clients = [];
  let tokens = [];
  let particles = [];

  const state = {
    running:false,
    practice:false,
    score:0,
    streak:0,
    fuel:1, // 0..1
    gates:0,
    stageIdx:0,
    time:0,
    difficulty:0,
    over:false
  };

  function reset(practice=false){
    state.practice = practice;
    state.running = true;
    state.over = false;
    state.score = 0;
    state.streak = 0;
    state.fuel = 1;
    state.gates = 0;
    state.stageIdx = 0;
    state.time = 0;
    state.difficulty = 0;

    ship.x = W*0.22;
    ship.y = H*0.52;
    ship.vx = 0;
    ship.vy = 0;
    ship.trail.length = 0;
    ship.dashT = 0;

    debris = [];
    clients = [];
    tokens = [];
    particles = [];

    spawnGate(true);
    spawnPack();
    syncUI();
  }

  function syncUI(){
    uiScore.textContent = String(Math.floor(state.score));
    uiStreak.textContent = String(state.streak);
    uiFuel.textContent = `${Math.floor(state.fuel*100)}%`;
    uiStage.textContent = STAGES[state.stageIdx % STAGES.length];
    uiGates.textContent = String(state.gates);
  }

  // ---------- Spawning ----------
  function spawnGate(first=false){
    const baseR = Math.min(W,H) * 0.09;
    const r = clamp(baseR - state.difficulty*2.2, baseR*0.55, baseR);
    const ring = r;
    const perfect = r * 0.42;

    const minX = W*0.35;
    const maxX = W*0.88;
    const x = first ? W*0.72 : rnd(minX, maxX);
    const y = rnd(H*0.18, H*0.82);

    gate = {
      x, y,
      r: ring,
      pr: perfect,
      wob: rnd(0, Math.PI*2),
      label: STAGES[state.stageIdx % STAGES.length],
      hue: 105,
    };
  }

  function spawnPack(){
    // Debris (ad clutter)
    const dCount = state.practice ? 6 : clamp(10 + state.difficulty*2, 10, 22);
    debris = Array.from({length:dCount}, () => ({
      x: rnd(W*0.34, W*0.96),
      y: rnd(H*0.12, H*0.88),
      r: rnd(10, 24),
      vx: rnd(-0.18, 0.18)*DPR,
      vy: rnd(-0.18, 0.18)*DPR,
      spin: rnd(-1,1),
      t: rnd(0, 10),
    }));

    // Clients (astronauts)
    const cCount = state.practice ? 4 : 3;
    clients = Array.from({length:cCount}, () => ({
      x: rnd(W*0.34, W*0.96),
      y: rnd(H*0.12, H*0.88),
      r: 12,
      bob: rnd(0, Math.PI*2),
      alive:true
    }));

    // Tokens (marketing words)
    const tCount = state.practice ? 3 : 2;
    tokens = Array.from({length:tCount}, () => ({
      x: rnd(W*0.34, W*0.96),
      y: rnd(H*0.12, H*0.88),
      r: 12,
      txt: WORDS[Math.floor(Math.random()*WORDS.length)],
      alive:true
    }));
  }

  // ---------- Input (mouse/touch) ----------
  function setPointerFromEvent(ev){
    const rect = canvas.getBoundingClientRect();
    const x = (ev.clientX - rect.left) * DPR;
    const y = (ev.clientY - rect.top) * DPR;
    input.pointerX = x;
    input.pointerY = y;
  }

  function beginHold(){
    if(!state.running || state.over) return;
    input.holding = true;
    input.holdStart = now();
    beep({type:"sine", f:220, t:0.04, v:0.02});
  }
  function endHold(){
    if(!input.holding || !state.running || state.over) return;
    input.holding = false;

    // Warp dash
    const power = input.holdPower;
    input.holdPower = 0;

    const dx = gate.x - ship.x;
    const dy = gate.y - ship.y;
    const d = Math.sqrt(dx*dx + dy*dy) || 1;

    // dash distance capped + direction towards gate
    const base = lerp(160, 520, power) * DPR;
    const ux = dx / d;
    const uy = dy / d;

    ship.vx += ux * base;
    ship.vy += uy * base;
    ship.dashT = 0.24 + power*0.18;

    // fuel cost
    state.fuel = clamp(state.fuel - (0.08 + power*0.10), 0, 1);

    // FX
    for(let i=0;i<22;i++){
      particles.push({
        x: ship.x, y: ship.y,
        vx: rnd(-2.5,2.5)*DPR,
        vy: rnd(-2.5,2.5)*DPR,
        life: rnd(0.22,0.55),
        kind:"warp"
      });
    }
    beep({type:"triangle", f: 320 + power*220, t:0.06, v:0.05});
  }

  // Prevent page scroll on touch
  canvas.addEventListener("touchstart", (ev)=>{ ev.preventDefault(); }, {passive:false});
  canvas.addEventListener("touchmove",  (ev)=>{ ev.preventDefault(); }, {passive:false});

  canvas.addEventListener("pointerdown", (ev)=>{
    A();
    setPointerFromEvent(ev);
    beginHold();
  });
  canvas.addEventListener("pointermove", (ev)=>{
    setPointerFromEvent(ev);
  });
  canvas.addEventListener("pointerup", ()=>{
    endHold();
  });
  canvas.addEventListener("pointercancel", ()=>{
    endHold();
  });

  // Keyboard helpers (desktop)
  addEventListener("keydown", (ev)=>{
    if(ev.key === "p" || ev.key === "P"){
      input.paused = !input.paused;
      showToast(input.paused ? "Paused" : "Resume");
      beep({type:"sine", f: input.paused ? 220 : 440, t:0.05, v:0.03});
    }
    if(ev.key === "r" || ev.key === "R"){
      reset(state.practice);
      showToast("Restart");
      beep({type:"square", f:420, t:0.05, v:0.03});
    }
  });

  // Buttons
  btnStart.addEventListener("click", ()=>{
    overlay.style.display = "none";
    reset(false);
    showToast("Make it unforgettable.");
  });
  btnPractice.addEventListener("click", ()=>{
    overlay.style.display = "none";
    reset(true);
    showToast("Practice mode");
  });

  // ---------- Mechanics ----------
  function updateHold(){
    if(!input.holding){ input.holdPower = 0; return; }
    const t = (now() - input.holdStart) / 1000;
    // Smooth charge curve: 0..1 in ~1.0s
    const p = 1 - Math.exp(-t*2.4);
    input.holdPower = clamp(p, 0, 1);

    // subtle charging sound
    if(Math.random() < 0.06) beep({type:"sine", f: 180 + input.holdPower*140, t:0.02, v:0.01});
  }

  function applyForces(dt){
    // friction + mild gravity to keep motion alive
    const fr = 0.90;
    ship.vx *= Math.pow(fr, dt*60);
    ship.vy *= Math.pow(fr, dt*60);

    // keep within screen (bounce)
    ship.x += ship.vx * dt;
    ship.y += ship.vy * dt;

    const pad = 18*DPR;
    if(ship.x < pad){ ship.x = pad; ship.vx *= -0.6; }
    if(ship.x > W-pad){ ship.x = W-pad; ship.vx *= -0.6; }
    if(ship.y < pad){ ship.y = pad; ship.vy *= -0.6; }
    if(ship.y > H-pad){ ship.y = H-pad; ship.vy *= -0.6; }

    // Dash decay timer
    if(ship.dashT > 0) ship.dashT = Math.max(0, ship.dashT - dt);

    // Trail
    ship.trail.push({x:ship.x, y:ship.y, a:1});
    if(ship.trail.length > 26) ship.trail.shift();
    for(const t of ship.trail) t.a *= 0.92;
  }

  function updateEntities(dt){
    // Gate wobble
    gate.wob += dt*1.6;

    // Debris drift
    for(const d of debris){
      d.t += dt*2.0;
      d.x += d.vx * dt * 60;
      d.y += d.vy * dt * 60;
      if(d.x < W*0.28) d.x = W*0.96;
      if(d.x > W*0.98) d.x = W*0.30;
      if(d.y < H*0.06) d.y = H*0.94;
      if(d.y > H*0.94) d.y = H*0.06;
    }

    // Clients bob
    for(const c of clients){
      if(!c.alive) continue;
      c.bob += dt*2.2;
    }

    // Particles
    for(const p of particles){
      p.life -= dt;
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;
      p.vx *= (1 - 2.2*dt);
      p.vy *= (1 - 2.2*dt);
    }
    particles = particles.filter(p=>p.life > 0);

    // Fuel regen (slow) when not holding
    const regen = input.holding ? 0.015 : 0.04;
    state.fuel = clamp(state.fuel + regen*dt, 0, 1);
  }

  function collide(){
    // Gate pass check
    const d2g = dist2(ship.x, ship.y, gate.x, gate.y);
    const rr = gate.r * gate.r;

    // If inside ring at any time, count as pass when moving forward enough
    // We'll score once per gate when ship crosses into it with momentum
    if(!gate._passed && d2g <= rr && (Math.abs(ship.vx)+Math.abs(ship.vy) > 120*DPR)){
      gate._passed = true;

      const perfect = d2g <= (gate.pr*gate.pr);
      state.gates += 1;

      // scoring + streak
      const base = perfect ? 220 : 120;
      const mult = 1 + Math.min(6, state.streak) * 0.12;
      const pts = base * mult;

      state.score += pts;
      state.streak += perfect ? 1 : 0;
      if(!perfect) state.streak = Math.max(0, state.streak-1);

      // stage progression
      if(state.gates % 3 === 0){
        state.stageIdx += 1;
        showToast(`Stage: ${STAGES[state.stageIdx % STAGES.length]}`);
      } else {
        showToast(perfect ? "Perfect gate" : "Gate cleared");
      }

      // difficulty climbs
      state.difficulty = Math.min(12, state.difficulty + 0.25 + (perfect?0.08:0));

      // FX
      for(let i=0;i<26;i++){
        particles.push({
          x: gate.x, y: gate.y,
          vx: rnd(-3.5,3.5)*DPR,
          vy: rnd(-3.5,3.5)*DPR,
          life: rnd(0.28,0.65),
          kind: perfect ? "perfect" : "gate"
        });
      }
      beep({type:"triangle", f: perfect ? 780 : 520, t:0.08, v:0.05});
      if(perfect) beep({type:"sine", f: 1040, t:0.05, v:0.03});
      if(!perfect) noise(0.05, 0.02);

      // new gate & new pack
      spawnGate(false);
      spawnPack();
      gate._passed = false;

      // occasional easter
      if(Math.random() < 0.14) showToast(EASTER[Math.floor(Math.random()*EASTER.length)], 1200);

      syncUI();
    }

    // Debris hit (ad clutter)
    for(const d of debris){
      const hit = dist2(ship.x, ship.y, d.x, d.y) <= (ship.r + d.r)*(ship.r + d.r);
      if(hit){
        // penalty unless practice
        if(!state.practice){
          state.streak = 0;
          state.fuel = clamp(state.fuel - 0.20, 0, 1);
          state.score = Math.max(0, state.score - 80);
          showToast("Ad clutter hit — find the signal");
          noise(0.10, 0.03);
          for(let i=0;i<18;i++){
            particles.push({
              x: ship.x, y: ship.y,
              vx: rnd(-3,3)*DPR,
              vy: rnd(-3,3)*DPR,
              life: rnd(0.18,0.5),
              kind:"hit"
            });
          }
          // small knockback
          ship.vx *= -0.45;
          ship.vy *= -0.45;
        } else {
          showToast("Hit (practice)");
        }
        syncUI();
        break;
      }
    }

    // Clients collect
    for(const c of clients){
      if(!c.alive) continue;
      if(dist2(ship.x, ship.y, c.x, c.y) <= (ship.r + c.r + 6*DPR)**2){
        c.alive = false;
        state.score += 160;
        state.fuel = clamp(state.fuel + 0.18, 0, 1);
        showToast("Client secured +160");
        beep({type:"square", f:680, t:0.06, v:0.04});
        for(let i=0;i<12;i++){
          particles.push({
            x: c.x, y: c.y,
            vx: rnd(-2.2,2.2)*DPR,
            vy: rnd(-2.2,2.2)*DPR,
            life: rnd(0.18,0.5),
            kind:"client"
          });
        }
        syncUI();
      }
    }

    // Tokens collect
    for(const t of tokens){
      if(!t.alive) continue;
      if(dist2(ship.x, ship.y, t.x, t.y) <= (ship.r + t.r + 6*DPR)**2){
        t.alive = false;
        state.score += 90;
        state.fuel = clamp(state.fuel + 0.10, 0, 1);
        showToast(`${t.txt} +90`);
        beep({type:"sine", f:520, t:0.05, v:0.03});
        syncUI();
      }
    }

    // Fuel empty => game over (unless practice)
    if(!state.practice && state.fuel <= 0.001){
      state.over = true;
      state.running = true;
      showToast("Fuel empty — restart");
      noise(0.12, 0.03);
      overlay.style.display = "flex";
      overlay.querySelector("h1").textContent = "Run complete";
      overlay.querySelector("p").innerHTML =
        `Score <span class="green">${Math.floor(state.score)}</span> • Gates <span class="green">${state.gates}</span> • Stage <span class="green">${STAGES[state.stageIdx % STAGES.length]}</span>`;
    }
  }

  // ---------- Rendering ----------
  function drawBG(){
    // Soft gradients
    const grd = ctx.createLinearGradient(0,0,0,H);
    grd.addColorStop(0, BG1);
    grd.addColorStop(1, BG2);
    ctx.fillStyle = grd;
    ctx.fillRect(0,0,W,H);

    // Stars
    for(const s of stars){
      s.tw += 0.008*s.sp;
      const a = (Math.sin(s.tw)*0.35 + 0.65) * s.a;
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillRect(s.x*W, s.y*H, s.r*DPR, s.r*DPR);
    }

    // Planets (parallax)
    for(const p of planets){
      const x = p.x*W;
      const y = p.y*H;
      const r = p.r*DPR;

      const g1 = ctx.createRadialGradient(x-r*0.2, y-r*0.25, 0, x, y, r*1.7);
      g1.addColorStop(0, `hsla(${p.hue}, 80%, 60%, 0.34)`);
      g1.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g1;
      ctx.beginPath();
      ctx.arc(x,y,r*1.7,0,Math.PI*2);
      ctx.fill();

      ctx.fillStyle = `hsla(${p.hue}, 80%, 58%, 0.36)`;
      ctx.beginPath();
      ctx.arc(x,y,r,0,Math.PI*2);
      ctx.fill();

      if(p.ring){
        ctx.strokeStyle = "rgba(255,255,255,.18)";
        ctx.lineWidth = 2*DPR;
        ctx.beginPath();
        ctx.ellipse(x,y,r*1.6,r*0.55,0.35,0,Math.PI*2);
        ctx.stroke();
      }
    }

    // Subtle vignette
    const v = ctx.createRadialGradient(W*0.5,H*0.5,0,W*0.5,H*0.5,Math.max(W,H)*0.65);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = v;
    ctx.fillRect(0,0,W,H);
  }

  function drawGate(){
    const wob = Math.sin(gate.wob)*0.6;
    const R = gate.r + wob*DPR;
    const PR = gate.pr + wob*0.4*DPR;

    // Outer glow
    const glow = ctx.createRadialGradient(gate.x,gate.y,0,gate.x,gate.y,R*1.6);
    glow.addColorStop(0, "rgba(166,255,77,0.10)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(gate.x,gate.y,R*1.6,0,Math.PI*2);
    ctx.fill();

    // Ring
    ctx.strokeStyle = "rgba(166,255,77,0.85)";
    ctx.lineWidth = 4*DPR;
    ctx.beginPath();
    ctx.arc(gate.x,gate.y,R,0,Math.PI*2);
    ctx.stroke();

    // Perfect ring
    ctx.strokeStyle = "rgba(166,255,77,0.32)";
    ctx.lineWidth = 2*DPR;
    ctx.beginPath();
    ctx.arc(gate.x,gate.y,PR,0,Math.PI*2);
    ctx.stroke();

    // Label
    ctx.font = `${Math.floor(12*DPR)}px system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial`;
    ctx.fillStyle = "rgba(255,255,255,.80)";
    ctx.textAlign = "center";
    ctx.fillText(gate.label.toUpperCase(), gate.x, gate.y - R - 10*DPR);
    ctx.textAlign = "left";
  }

  function drawDebris(){
    for(const d of debris){
      const pulse = Math.sin(d.t)*0.5+0.5;
      ctx.fillStyle = `rgba(255,255,255,${0.10 + pulse*0.06})`;
      ctx.beginPath();
      ctx.arc(d.x,d.y,d.r,0,Math.PI*2);
      ctx.fill();

      ctx.strokeStyle = "rgba(255,255,255,.14)";
      ctx.lineWidth = 2*DPR;
      ctx.beginPath();
      ctx.arc(d.x,d.y,d.r+3*DPR,0,Math.PI*2);
      ctx.stroke();
    }
  }

  function drawClients(){
    for(const c of clients){
      if(!c.alive) continue;
      const y = c.y + Math.sin(c.bob)*3*DPR;

      // astronaut icon (minimal)
      ctx.fillStyle = "rgba(255,255,255,.92)";
      ctx.fillRect(c.x-8*DPR, y-8*DPR, 16*DPR, 16*DPR);
      ctx.fillStyle = "rgba(0,0,0,.65)";
      ctx.fillRect(c.x-3*DPR, y-4*DPR, 6*DPR, 6*DPR);
      ctx.fillStyle = "rgba(166,255,77,.55)";
      ctx.fillRect(c.x-9*DPR, y+9*DPR, 18*DPR, 2*DPR);
    }
  }

  function drawTokens(){
    for(const t of tokens){
      if(!t.alive) continue;

      ctx.strokeStyle = "rgba(166,255,77,.35)";
      ctx.lineWidth = 2*DPR;
      ctx.beginPath();
      ctx.arc(t.x,t.y,14*DPR,0,Math.PI*2);
      ctx.stroke();

      ctx.fillStyle = "rgba(166,255,77,.10)";
      ctx.beginPath();
      ctx.arc(t.x,t.y,14*DPR,0,Math.PI*2);
      ctx.fill();

      ctx.font = `${Math.floor(11*DPR)}px system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial`;
      ctx.fillStyle = "rgba(255,255,255,.85)";
      ctx.textAlign = "center";
      ctx.fillText(t.txt, t.x, t.y + 4*DPR);
      ctx.textAlign = "left";
    }
  }

  function drawShip(){
    // Trail
    for(const t of ship.trail){
      ctx.fillStyle = `rgba(166,255,77,${0.10 * t.a})`;
      ctx.beginPath();
      ctx.arc(t.x,t.y, 12*DPR*(0.6+t.a*0.35), 0, Math.PI*2);
      ctx.fill();
    }

    // Body
    const speed = Math.min(1, (Math.abs(ship.vx)+Math.abs(ship.vy)) / (680*DPR));
    const glow = ctx.createRadialGradient(ship.x,ship.y,0,ship.x,ship.y, 52*DPR);
    glow.addColorStop(0, `rgba(166,255,77,${0.16 + speed*0.10})`);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(ship.x,ship.y, 52*DPR, 0, Math.PI*2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.beginPath();
    ctx.moveTo(ship.x + 16*DPR, ship.y);
    ctx.lineTo(ship.x - 10*DPR, ship.y - 8*DPR);
    ctx.lineTo(ship.x - 6*DPR, ship.y);
    ctx.lineTo(ship.x - 10*DPR, ship.y + 8*DPR);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(166,255,77,.95)";
    ctx.fillRect(ship.x - 6*DPR, ship.y - 2*DPR, 14*DPR, 4*DPR);

    // Charge indicator
    if(input.holding){
      const p = input.holdPower;
      ctx.strokeStyle = `rgba(166,255,77,${0.25 + p*0.55})`;
      ctx.lineWidth = 3*DPR;
      ctx.beginPath();
      ctx.arc(ship.x,ship.y, (22 + p*22)*DPR, 0, Math.PI*2);
      ctx.stroke();
    }
  }

  function drawParticles(){
    for(const p of particles){
      let col = "rgba(255,255,255,.55)";
      if(p.kind==="warp") col = "rgba(166,255,77,.80)";
      if(p.kind==="perfect") col = "rgba(166,255,77,.95)";
      if(p.kind==="gate") col = "rgba(166,255,77,.55)";
      if(p.kind==="hit") col = "rgba(255,255,255,.35)";
      if(p.kind==="client") col = "rgba(255,255,255,.75)";
      ctx.fillStyle = col;
      ctx.fillRect(p.x, p.y, 2*DPR, 2*DPR);
    }
  }

  function drawCRT(){
    // scanlines
    ctx.fillStyle = "rgba(255,255,255,.03)";
    for(let y=0; y<H; y += Math.floor(3*DPR)){
      ctx.fillRect(0, y, W, 1*DPR);
    }
    // slight shimmer when dashing
    if(ship.dashT > 0){
      const k = ship.dashT;
      for(let i=0;i<7;i++){
        const yy = Math.floor(rnd(0,H));
        ctx.fillStyle = `rgba(255,255,255,${0.05*k})`;
        ctx.fillRect(0, yy, W, Math.floor(rnd(1,3))*DPR);
      }
      ctx.fillStyle = `rgba(166,255,77,${0.04*k})`;
      ctx.fillRect(2*DPR,0,W,H);
    }
  }

  // ---------- Main Loop ----------
  let last = 0;
  function frame(t){
    requestAnimationFrame(frame);
    const dt = Math.min(0.033, (t - last)/1000 || 0.016);
    last = t;

    drawBG();

    if(!state.running){
      drawCRT();
      return;
    }

    if(!input.paused && !state.over){
      state.time += dt;
      updateHold();
      applyForces(dt);
      updateEntities(dt);
      collide();
      syncUI();
    }

    drawGate();
    drawDebris();
    drawClients();
    drawTokens();
    drawParticles();
    drawShip();

    // Charge bar UI (bottom subtle)
    if(state.running && !state.over){
      const p = input.holding ? input.holdPower : 0;
      const barW = Math.min(W*0.52, 520*DPR);
      const x = (W - barW)/2;
      const y = H - 26*DPR;
      ctx.fillStyle = "rgba(255,255,255,.10)";
      ctx.fillRect(x, y, barW, 6*DPR);
      ctx.fillStyle = `rgba(166,255,77,${0.45 + p*0.40})`;
      ctx.fillRect(x, y, barW*p, 6*DPR);
    }

    drawCRT();
  }

  // Start rendering immediately (menu overlay is on)
  requestAnimationFrame(frame);

  // Ensure overlay text resets if user reloads after a game over
  overlay.style.display = "flex";
})();
