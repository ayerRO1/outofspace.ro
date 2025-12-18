(() => {
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");

  const uiScore  = document.getElementById("uiScore");
  const uiLives  = document.getElementById("uiLives");
  const uiCombo  = document.getElementById("uiCombo");
  const uiAstro  = document.getElementById("uiAstro");
  const uiCash   = document.getElementById("uiCash");
  const uiShield = document.getElementById("uiShield");

  const overlay = document.getElementById("overlay");
  const btnStart = document.getElementById("btnStart");
  const btnPractice = document.getElementById("btnPractice");

  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const lerp = (a,b,t)=>a+(b-a)*t;
  const rnd = (a,b)=>a+Math.random()*(b-a);

  // ---------- Canvas sizing ----------
  let W=0,H=0,DPR=1;
  function resize(){
    DPR = Math.min(devicePixelRatio || 1, 2);
    W = canvas.width = Math.floor(innerWidth * DPR);
    H = canvas.height = Math.floor(innerHeight * DPR);
    canvas.style.width = innerWidth + "px";
    canvas.style.height = innerHeight + "px";
  }
  addEventListener("resize", () => { resize(); initStars(); }, {passive:true});
  resize();

  // ---------- roundRect polyfill ----------
  if(!CanvasRenderingContext2D.prototype.roundRect){
    CanvasRenderingContext2D.prototype.roundRect = function(x,y,w,h,r){
      r = Math.min(r, w/2, h/2);
      this.beginPath();
      this.moveTo(x+r,y);
      this.arcTo(x+w,y,x+w,y+h,r);
      this.arcTo(x+w,y+h,x,y+h,r);
      this.arcTo(x,y+h,x,y,r);
      this.arcTo(x,y,x+w,y,r);
      this.closePath();
      return this;
    };
  }

  // ---------- Color system ----------
  const COL_GREEN = "166,255,77";   // good
  const COL_RED   = "255,80,80";    // deadlines (danger)
  const COL_PURP  = "198,80,255";   // UFO
  const COL_WHITE = "255,255,255";

  function glowCircle(x, y, r, color, alpha=0.20){
    const g = ctx.createRadialGradient(x, y, 0, x, y, r*2.8);
    g.addColorStop(0, `rgba(${color}, ${alpha})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r*2.8, 0, Math.PI*2);
    ctx.fill();

    ctx.strokeStyle = `rgba(${color}, 0.55)`;
    ctx.lineWidth = 2*DPR;
    ctx.beginPath();
    ctx.arc(x, y, r*1.05, 0, Math.PI*2);
    ctx.stroke();
  }

  // ---------- Starfield ----------
  const stars=[];
  function initStars(){
    stars.length=0;
    const count = Math.floor((innerWidth*innerHeight)/9000);
    for(let i=0;i<count;i++){
      stars.push({
        x:Math.random()*W,
        y:Math.random()*H,
        s:rnd(0.6,1.6)*DPR,
        a:rnd(0.12,0.9),
        v:rnd(0.4,1.6)*DPR,
        tw:rnd(0,Math.PI*2)
      });
    }
  }
  initStars();

  // ---------- Lanes ----------
  const laneCount = 3;
  function laneX(i){
    const pad = W*0.18;
    const usable = W - pad*2;
    return pad + (usable/(laneCount-1))*i;
  }

  // ---------- State ----------
  const state = {
    running:false,
    paused:false,
    practice:false,
    menuDemo:true,

    score:0,
    lives:3,

    combo:1,
    comboHits:0,
    comboTimer:0,

    astro:0,
    cash:0,

    shield:0,   // seconds
    speed:560,
    t:0,
    difficulty:2.0,

    _slowT:0,
    _magnetT:0,
  };

  const ship = {
    lane:1,
    targetLane:1,
    x:0,
    y:0,
    r:18,
    inv:0,
    trail:[],
  };

  // entities: brief/ufo + pickups/powerups
  // types: "brief","ufo","astro","cash","shield","slow","magnet"
  let entities = [];
  // missiles from UFOs
  let missiles = [];
  // particles
  let particles = [];

  let spawnTimer = 0;
  let missileTimer = 0;

  function syncUI(){
    uiScore.textContent = String(Math.floor(state.score));
    uiLives.textContent = String(state.lives);
    uiCombo.textContent = `x${state.combo}`;
    uiAstro.textContent = String(state.astro);
    uiCash.textContent = String(state.cash);
    uiShield.textContent = `${Math.max(0, Math.ceil(state.shield))}s`;
  }

  function addParticles(x,y,n=10, green=false){
    for(let i=0;i<n;i++){
      particles.push({
        x, y,
        vx: rnd(-2.8,2.8)*DPR,
        vy: rnd(-3.4,2.2)*DPR,
        life: rnd(0.18,0.55),
        g: green
      });
    }
  }

  function spawnEntity(forceType=null){
    const lane = Math.floor(rnd(0,laneCount));
    const x = laneX(lane);
    const y = -70*DPR;

    const d = state.difficulty;
    let type = "brief";

    if(forceType){
      type = forceType;
    } else {
      const r = Math.random();

      // goodies
      if(r < 0.18) type = "astro";
      else if(r < 0.36) type = "cash";
      else if(r < 0.40) type = "shield";
      else if(r < 0.43) type = "slow";
      else if(r < 0.46) type = "magnet";

      // enemies
      else if(r < (0.46 + 0.20 + d*0.012)) type = "ufo";
      else type = "brief";
    }

    const size = (type==="ufo") ? 23*DPR : 20*DPR;

    entities.push({
      type, lane,
      x, y,
      r: size,
      vy: state.speed * (type==="ufo" ? 1.02 : 1.0),
      wob: rnd(0,Math.PI*2),
      dead:false
    });
  }

  function spawnMissile(fromX, fromY, lane){
    missiles.push({
      x: fromX,
      y: fromY,
      lane,
      r: 9*DPR,
      vy: state.speed * 1.35,
      t: 0
    });
  }

  // ---------- Input ----------
  function dashLeft(){ ship.targetLane = clamp(ship.targetLane - 1, 0, laneCount-1); }
  function dashRight(){ ship.targetLane = clamp(ship.targetLane + 1, 0, laneCount-1); }

  function onPointerDown(ev){
    const rect = canvas.getBoundingClientRect();
    const px = (ev.clientX - rect.left) / rect.width;
    if(px < 0.5) dashLeft(); else dashRight();
  }

  canvas.addEventListener("pointerdown", (ev)=>{
    ev.preventDefault();
    if(overlay.style.display !== "none") return;
    onPointerDown(ev);
  }, {passive:false});

  addEventListener("keydown", (ev)=>{
    if(ev.key === "p" || ev.key === "P") state.paused = !state.paused;
    if(ev.key === "r" || ev.key === "R") reset(state.practice);

    if(ev.key === "ArrowLeft" || ev.key === "a" || ev.key === "A") dashLeft();
    if(ev.key === "ArrowRight" || ev.key === "d" || ev.key === "D") dashRight();
  });

  btnStart.addEventListener("click", ()=>{
    overlay.style.display = "none";
    reset(false);
  });
  btnPractice.addEventListener("click", ()=>{
    overlay.style.display = "none";
    reset(true);
  });

  // ---------- Combo ----------
  function applyComboHit(){
    state.comboHits += 1;
    state.comboTimer = 1.8;

    const hits = state.comboHits;
    let c = 1;
    if(hits >= 3) c = 2;
    if(hits >= 7) c = 3;
    if(hits >= 12) c = 4;
    if(hits >= 18) c = 5;
    state.combo = c;
  }

  function decayCombo(dt){
    if(state.comboHits <= 0) return;
    state.comboTimer -= dt;
    if(state.comboTimer <= 0){
      state.comboHits = Math.max(0, state.comboHits - 1);
      state.comboTimer = 0.35;

      const hits = state.comboHits;
      let c = 1;
      if(hits >= 3) c = 2;
      if(hits >= 7) c = 3;
      if(hits >= 12) c = 4;
      if(hits >= 18) c = 5;
      state.combo = c;
    }
  }

  // ---------- Collect / Hit ----------
  function collect(type, x, y){
    const mult = state.combo;

    if(type === "astro"){
      state.astro += 1;
      state.score += (160 * mult);
      applyComboHit();
      addParticles(x,y,10,true);
    } else if(type === "cash"){
      state.cash += 1;
      state.score += (120 * mult);
      applyComboHit();
      addParticles(x,y,8,true);
    } else if(type === "shield"){
      state.shield = Math.min(12, state.shield + 6);
      state.score += 80 * mult;
      applyComboHit();
      addParticles(x,y,14,true);
    } else if(type === "slow"){
      state._slowT = 2.2;
      state.score += 60 * mult;
      applyComboHit();
      addParticles(x,y,12,true);
    } else if(type === "magnet"){
      state._magnetT = 3.8;
      state.score += 60 * mult;
      applyComboHit();
      addParticles(x,y,12,true);
    }
  }

  function hitObstacle(){
    if(state.practice) return;
    if(ship.inv > 0) return;

    if(state.shield > 0){
      state.shield = Math.max(0, state.shield - 4);
      ship.inv = 0.6;
      addParticles(ship.x, ship.y, 18, true);
      state.comboHits = 0;
      state.combo = 1;
      return;
    }

    state.lives -= 1;
    state.comboHits = 0;
    state.combo = 1;
    ship.inv = 1.0;
    addParticles(ship.x, ship.y, 18, false);

    if(state.lives <= 0){
      overlay.style.display = "flex";
      overlay.querySelector("h1").textContent = "Run complete";
      overlay.querySelectorAll("p")[0].innerHTML =
        `Score <span class="green">${Math.floor(state.score)}</span> • 👨‍🚀 <span class="green">${state.astro}</span> • $ <span class="green">${state.cash}</span>`;
      overlay.querySelectorAll("p")[1].innerHTML =
        `Tap left/right to dodge. Keep it <span class="green">bold</span>.`;
    }
  }

  // ---------- Reset / Menu demo ----------
  function reset(practice=false){
    state.practice = practice;
    state.running = true;
    state.paused = false;
    state.menuDemo = false;

    state.score = 0;
    state.lives = practice ? 99 : 3;

    state.combo = 1;
    state.comboHits = 0;
    state.comboTimer = 0;

    state.astro = 0;
    state.cash = 0;

    state.shield = 0;
    state._slowT = 0;
    state._magnetT = 0;

    state.speed = 680;
    state.t = 0;
    state.difficulty = 0;

    ship.targetLane = 1;
    ship.x = laneX(1);
    ship.y = H*0.76;
    ship.r = 18*DPR;
    ship.inv = 0;
    ship.trail.length = 0;

    entities = [];
    missiles = [];
    particles = [];
    spawnTimer = 0;
    missileTimer = 0;

    spawnEntity("cash");
    spawnEntity("astro");

    syncUI();
  }

  function startMenuDemo(){
    state.running = true;
    state.paused = false;
    state.practice = true;
    state.menuDemo = true;

    state.score = 0;
    state.lives = 3;
    state.combo = 1;
    state.comboHits = 0;
    state.comboTimer = 0;
    state.astro = 0;
    state.cash = 0;
    state.shield = 0;

    state._slowT = 0;
    state._magnetT = 0;

    state.speed = 560;
    state.t = 0;
    state.difficulty = 2.0;

    ship.targetLane = 1;
    ship.x = laneX(1);
    ship.y = H*0.76;
    ship.r = 18*DPR;
    ship.inv = 0.2;
    ship.trail.length = 0;

    entities = [];
    missiles = [];
    particles = [];
    spawnTimer = 0.15;
    missileTimer = 0.6;

    syncUI();
  }

  // ---------- Draw helpers (emoji-style) ----------
  function drawBrief(x,y,s){
    glowCircle(x,y,s*0.9, COL_RED, 0.20);

    ctx.fillStyle = "rgba(255,80,80,.92)";
    ctx.beginPath();
    ctx.roundRect(x - s*0.75, y - s*0.25, s*1.5, s*0.95, 10*DPR);
    ctx.fill();

    ctx.fillStyle = "rgba(255,120,120,.92)";
    ctx.beginPath();
    ctx.roundRect(x - s*0.75, y - s*0.55, s*0.62, s*0.38, 9*DPR);
    ctx.fill();

    ctx.fillStyle = "rgba(0,0,0,.22)";
    ctx.fillRect(x - s*0.52, y + s*0.05, s*1.04, 2*DPR);
    ctx.fillRect(x - s*0.52, y + s*0.20, s*0.82, 2*DPR);
  }

  function drawUFO(x,y,s,t){
    glowCircle(x,y,s*0.95, COL_PURP, 0.18);

    const wob = Math.sin(t)*0.8*DPR;

    ctx.fillStyle = "rgba(255,255,255,.28)";
    ctx.beginPath();
    ctx.ellipse(x, y - s*0.20 + wob, s*0.38, s*0.22, 0, Math.PI, 0, true);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,.18)";
    ctx.beginPath();
    ctx.ellipse(x, y + wob, s*0.95, s*0.34, 0, 0, Math.PI*2);
    ctx.fill();

    ctx.strokeStyle = "rgba(198,80,255,.55)";
    ctx.lineWidth = 2*DPR;
    ctx.beginPath();
    ctx.ellipse(x, y + wob, s*0.98, s*0.36, 0, 0, Math.PI*2);
    ctx.stroke();

    ctx.fillStyle = "rgba(198,80,255,.90)";
    for(let i=-1;i<=1;i++){
      ctx.beginPath();
      ctx.arc(x + i*s*0.30, y + s*0.12 + wob, 2.3*DPR, 0, Math.PI*2);
      ctx.fill();
    }

    ctx.fillStyle = "rgba(198,80,255,.08)";
    ctx.beginPath();
    ctx.moveTo(x - s*0.55, y + s*0.20 + wob);
    ctx.lineTo(x + s*0.55, y + s*0.20 + wob);
    ctx.lineTo(x, y + s*0.85 + wob);
    ctx.closePath();
    ctx.fill();
  }

  function drawAstronaut(x,y,s,t){
    glowCircle(x,y,s*0.9, COL_GREEN, 0.18);

    const bob = Math.sin(t)*2*DPR;

    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.beginPath();
    ctx.roundRect(x - s*0.52, y - s*0.55 + bob, s*1.04, s*1.10, 14*DPR);
    ctx.fill();

    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.beginPath();
    ctx.roundRect(x - s*0.32, y - s*0.25 + bob, s*0.64, s*0.38, 10*DPR);
    ctx.fill();

    ctx.fillStyle = "rgba(166,255,77,.85)";
    ctx.beginPath();
    ctx.arc(x + s*0.34, y + s*0.12 + bob, 3*DPR, 0, Math.PI*2);
    ctx.fill();
  }

  function drawCash(x,y,s,t){
    glowCircle(x,y,s*0.9, COL_GREEN, 0.20);

    const pulse = (Math.sin(t*1.6)*0.25 + 0.75);
    ctx.fillStyle = `rgba(166,255,77,${0.10 + pulse*0.12})`;
    ctx.beginPath();
    ctx.arc(x,y,s*0.72,0,Math.PI*2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,.94)";
    ctx.font = `${Math.floor(18*DPR)}px system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial`;
    ctx.textAlign = "center";
    ctx.fillText("$", x, y + 6*DPR);
    ctx.textAlign = "left";
  }

  function drawPower(x,y,s,t,type){
    glowCircle(x,y,s*0.95, COL_GREEN, 0.18);

    const pulse = (Math.sin(t*2.0)*0.25 + 0.75);
    ctx.fillStyle = `rgba(166,255,77,${0.08 + pulse*0.10})`;
    ctx.beginPath();
    ctx.arc(x,y,s*0.72,0,Math.PI*2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.font = `${Math.floor(16*DPR)}px system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial`;
    ctx.textAlign = "center";
    const glyph = type==="shield" ? "🛡" : type==="slow" ? "⏳" : "🧲";
    ctx.fillText(glyph, x, y + 6*DPR);
    ctx.textAlign = "left";
  }

  function drawMissile(m){
    glowCircle(m.x, m.y, 10*DPR, COL_RED, 0.10);

    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.beginPath();
    ctx.roundRect(m.x - 4*DPR, m.y - 10*DPR, 8*DPR, 18*DPR, 4*DPR);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(m.x, m.y - 14*DPR);
    ctx.lineTo(m.x + 5*DPR, m.y - 8*DPR);
    ctx.lineTo(m.x - 5*DPR, m.y - 8*DPR);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(166,255,77,.85)";
    ctx.fillRect(m.x - 8*DPR, m.y + 2*DPR, 4*DPR, 6*DPR);
    ctx.fillRect(m.x + 4*DPR, m.y + 2*DPR, 4*DPR, 6*DPR);

    ctx.fillStyle = "rgba(255,80,80,.90)";
    ctx.beginPath();
    ctx.moveTo(m.x, m.y + 14*DPR);
    ctx.lineTo(m.x + 4*DPR, m.y + 9*DPR);
    ctx.lineTo(m.x - 4*DPR, m.y + 9*DPR);
    ctx.closePath();
    ctx.fill();
  }

  function drawShip(){
    for(const tr of ship.trail){
      ctx.fillStyle = `rgba(166,255,77,${0.08*tr.a})`;
      ctx.beginPath();
      ctx.arc(tr.x, tr.y, 18*DPR*(0.55+tr.a*0.45), 0, Math.PI*2);
      ctx.fill();
    }

    const boost = (state.shield>0) ? 0.10 : 0;
    const g = ctx.createRadialGradient(ship.x,ship.y,0,ship.x,ship.y, 78*DPR);
    g.addColorStop(0, `rgba(166,255,77,${0.12 + boost})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(ship.x,ship.y, 78*DPR, 0, Math.PI*2);
    ctx.fill();

    // rocket body
    ctx.fillStyle = "rgba(255,255,255,.94)";
    ctx.beginPath();
    ctx.roundRect(ship.x - 10*DPR, ship.y - 16*DPR, 20*DPR, 34*DPR, 10*DPR);
    ctx.fill();

    // nose cone
    ctx.beginPath();
    ctx.moveTo(ship.x, ship.y - 24*DPR);
    ctx.lineTo(ship.x + 10*DPR, ship.y - 8*DPR);
    ctx.lineTo(ship.x - 10*DPR, ship.y - 8*DPR);
    ctx.closePath();
    ctx.fill();

    // window
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.beginPath();
    ctx.arc(ship.x, ship.y - 4*DPR, 4.5*DPR, 0, Math.PI*2);
    ctx.fill();

    // fins
    ctx.fillStyle = "rgba(166,255,77,.95)";
    ctx.fillRect(ship.x - 16*DPR, ship.y + 4*DPR, 6*DPR, 10*DPR);
    ctx.fillRect(ship.x + 10*DPR, ship.y + 4*DPR, 6*DPR, 10*DPR);

    // flame
    ctx.fillStyle = "rgba(166,255,77,.95)";
    ctx.beginPath();
    ctx.moveTo(ship.x, ship.y + 26*DPR);
    ctx.lineTo(ship.x + 8*DPR, ship.y + 14*DPR);
    ctx.lineTo(ship.x - 8*DPR, ship.y + 14*DPR);
    ctx.closePath();
    ctx.fill();

    if(ship.inv > 0){
      ctx.strokeStyle = "rgba(255,255,255,.22)";
      ctx.lineWidth = 2*DPR;
      ctx.beginPath();
      ctx.arc(ship.x,ship.y, 30*DPR, 0, Math.PI*2);
      ctx.stroke();
    }

    if(state.shield > 0){
      ctx.strokeStyle = "rgba(166,255,77,.35)";
      ctx.lineWidth = 2*DPR;
      ctx.beginPath();
      ctx.arc(ship.x,ship.y, 36*DPR, 0, Math.PI*2);
      ctx.stroke();
    }
  }

  function drawParticles(dt){
    for(const p of particles){
      const a = clamp(p.life*2.0, 0, 1);
      ctx.fillStyle = p.g ? `rgba(166,255,77,${0.8*a})` : `rgba(255,255,255,${0.55*a})`;
      ctx.fillRect(p.x, p.y, 2*DPR, 2*DPR);
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;
      p.vx *= (1 - 2.3*dt);
      p.vy *= (1 - 2.3*dt);
      p.life -= dt;
    }
    particles = particles.filter(p=>p.life>0);
  }

  // ---------- Background ----------
  function drawBG(dt){
    ctx.clearRect(0,0,W,H);

    const speedFactor = state.speed/640;

    // stars
    for(const s of stars){
      s.tw += 0.02;
      const a = (Math.sin(s.tw)*0.25 + 0.75) * s.a;
      ctx.fillStyle = `rgba(${COL_WHITE},${a})`;
      ctx.fillRect(s.x, s.y, s.s, s.s);
      s.y += s.v * speedFactor * (dt*60);
      if(s.y > H){ s.y = -2*DPR; s.x = Math.random()*W; }
    }

    // arcade lane rails (visible)
    const top = H*0.10;
    const bot = H*0.92;

    // subtle track band
    ctx.fillStyle = "rgba(166,255,77,.03)";
    ctx.fillRect(W*0.12, top, W*0.76, bot-top);

    for(let i=0;i<laneCount;i++){
      const x = laneX(i);

      const grad = ctx.createLinearGradient(x, top, x, bot);
      grad.addColorStop(0, "rgba(166,255,77,.00)");
      grad.addColorStop(0.5, "rgba(166,255,77,.12)");
      grad.addColorStop(1, "rgba(166,255,77,.00)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 3*DPR;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bot);
      ctx.stroke();

      ctx.strokeStyle = "rgba(255,255,255,.07)";
      ctx.lineWidth = 1*DPR;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bot);
      ctx.stroke();
    }

    // vignette
    const v = ctx.createRadialGradient(W*0.5,H*0.5,0,W*0.5,H*0.5,Math.max(W,H)*0.65);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = v;
    ctx.fillRect(0,0,W,H);
  }

  // ---------- Update ----------
  function update(dt){
    if(!state.running || state.paused) return;

    state.t += dt;

    state.shield = Math.max(0, state.shield - dt);
    state._slowT = Math.max(0, state._slowT - dt);
    state._magnetT = Math.max(0, state._magnetT - dt);

    if(!state.menuDemo){
      state.difficulty = Math.min(14, state.difficulty + dt*0.12);
      const slowFactor = state._slowT > 0 ? 0.65 : 1.0;
      state.speed = (700 + state.difficulty*30) * slowFactor;
      state.score += (state.practice ? 3.5 : 7.5) * dt * 60;
    } else {
      state.speed = 560;
    }

    // ship movement
    const tx = laneX(ship.targetLane);
    ship.x = lerp(ship.x, tx, 1 - Math.pow(0.0004, dt*60));
    ship.y = H*0.76;

    ship.trail.push({x:ship.x, y:ship.y+14*DPR, a:1});
    if(ship.trail.length>22) ship.trail.shift();
    for(const tr of ship.trail) tr.a *= 0.90;

    ship.inv = Math.max(0, ship.inv - dt);

    // spawn entities
    spawnTimer -= dt;
    const spawnEvery = clamp(0.50 - state.difficulty*0.018, 0.18, 0.50);
    if(spawnTimer<=0){
      spawnEntity();
      if(Math.random() < 0.10 + state.difficulty*0.01) spawnEntity();
      spawnTimer = spawnEvery;
    }

    // UFO missiles cadence
    missileTimer -= dt;
    const missileEvery = clamp(1.05 - state.difficulty*0.03, 0.35, 1.05);
    if(missileTimer <= 0){
      const ufos = entities.filter(e=>e.type==="ufo" && !e.dead && e.y>H*0.10 && e.y < H*0.55);
      if(ufos.length){
        const u = ufos[Math.floor(Math.random()*ufos.length)];
        spawnMissile(u.x, u.y + 12*DPR, u.lane);
        addParticles(u.x, u.y, 6, true);
      }
      missileTimer = missileEvery;
    }

    // move entities
    for(const e of entities){
      e.wob += dt*3.0;
      e.y += e.vy * dt;
    }
    entities = entities.filter(e => e.y < H + 140*DPR && !e.dead);

    // move missiles
    for(const m of missiles){
      m.t += dt*6;
      m.y += m.vy * dt;
    }
    missiles = missiles.filter(m => m.y < H + 80*DPR);

    // magnet effect
    if(state._magnetT > 0){
      for(const e of entities){
        if(e.type==="astro" || e.type==="cash" || e.type==="shield" || e.type==="slow" || e.type==="magnet"){
          e.x = lerp(e.x, ship.x, 0.05);
        }
      }
    }

    // collisions
    const sr = ship.r + 2*DPR;

    // entity collisions
    for(const e of entities){
      const dx = ship.x - e.x;
      const dy = ship.y - e.y;
      const rr = sr + e.r;
      if(dx*dx + dy*dy <= rr*rr){
        if(e.type === "brief" || e.type === "ufo"){
          hitObstacle();
          e.dead = true;
          addParticles(e.x, e.y, 16, false);
        } else {
          collect(e.type, e.x, e.y);
          e.dead = true;
        }
      }
    }
    entities = entities.filter(e=>!e.dead);

    // missile collisions
    for(const m of missiles){
      const dx = ship.x - m.x;
      const dy = ship.y - m.y;
      const rr = sr + m.r + 2*DPR;
      if(dx*dx + dy*dy <= rr*rr){
        hitObstacle();
        m.y += 240*DPR;
        addParticles(m.x, m.y, 12, false);
      }
    }

    // combo decay
    decayCombo(dt);

    // menu demo wiggle
    if(state.menuDemo && overlay.style.display !== "none"){
      if(Math.random() < 0.02){
        ship.targetLane = Math.floor(rnd(0,laneCount));
      }
    }

    syncUI();
  }

  // ---------- Draw ----------
  function draw(dt){
    drawBG(dt);

    // entities
    for(const e of entities){
      const t = state.t + e.wob;
      if(e.type === "brief") drawBrief(e.x,e.y, 18*DPR);
      else if(e.type === "ufo") drawUFO(e.x,e.y, 22*DPR, t);
      else if(e.type === "astro") drawAstronaut(e.x,e.y, 20*DPR, t);
      else if(e.type === "cash") drawCash(e.x,e.y, 20*DPR, t);
      else drawPower(e.x,e.y, 20*DPR, t, e.type);
    }

    // missiles
    for(const m of missiles) drawMissile(m);

    // ship
    drawShip();

    // particles
    drawParticles(dt);

    // combo label (subtle)
    if(state.combo > 1 && overlay.style.display === "none"){
      ctx.fillStyle = "rgba(255,255,255,.80)";
      ctx.font = `${Math.floor(18*DPR)}px system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial`;
      ctx.textAlign = "center";
      ctx.fillText(`COMBO x${state.combo}`, W*0.5, H*0.22);
      ctx.textAlign = "left";
    }

    // scanlines
    ctx.fillStyle = "rgba(255,255,255,.022)";
    for(let y=0; y<H; y += Math.floor(3*DPR)){
      ctx.fillRect(0, y, W, 1*DPR);
    }
  }

  // ---------- Loop ----------
  let last = performance.now();
  function loop(t){
    requestAnimationFrame(loop);
    const dt = Math.min(0.033, (t-last)/1000);
    last = t;
    update(dt);
    draw(dt);
  }
  requestAnimationFrame(loop);

  // prevent scroll on touch
  canvas.addEventListener("touchstart", e=>e.preventDefault(), {passive:false});
  canvas.addEventListener("touchmove", e=>e.preventDefault(), {passive:false});

  // boot
  overlay.style.display = "flex";
  startMenuDemo();
})();
