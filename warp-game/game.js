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

  // -------- Canvas sizing --------
  let W=0,H=0,DPR=1;
  function resize(){
    DPR = Math.min(devicePixelRatio || 1, 2);
    W = canvas.width = Math.floor(innerWidth * DPR);
    H = canvas.height = Math.floor(innerHeight * DPR);
    canvas.style.width = innerWidth + "px";
    canvas.style.height = innerHeight + "px";
  }
  addEventListener("resize", resize, {passive:true});
  resize();

  // -------- Starfield --------
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

  // -------- Lanes (3 lanes) --------
  const laneCount = 3;

  function laneX(i){
    const pad = W*0.18; // tighter, more arcade
    const usable = W - pad*2;
    return pad + (usable/(laneCount-1))*i;
  }

  // -------- Game state --------
  const state = {
    running:false,
    paused:false,
    practice:false,

    score:0,
    lives:3,
    combo:1,
    comboHits:0,
    comboTimer:0,   // decays if you stop collecting
    astro:0,
    cash:0,

    shield:0,       // seconds
    speed: 640,     // world scroll
    t:0,
    difficulty:0,
    menuDemo:true
  };

  const ship = {
    lane: 1,
    targetLane: 1,
    x: 0,
    y: 0,
    r: 18,
    inv: 0,
    trail: [],
  };

  let entities = [];  // briefs, ufos, pickups, powerups
  let missiles = [];  // ufo missiles
  let particles = [];
  let spawnTimer = 0;
  let missileTimer = 0;

  // types: "brief", "ufo", "astro", "cash", "shield", "slow", "magnet"
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
      // pickups
      if(r < 0.18) type = "astro";
      else if(r < 0.36) type = "cash";
      // powerups (rar)
      else if(r < 0.40) type = "shield";
      else if(r < 0.43) type = "slow";
      else if(r < 0.46) type = "magnet";
      // enemies
      else if(r < (0.46 + 0.20 + d*0.012)) type = "ufo";
      else type = "brief";
    }

    const size = (type==="ufo") ? 23*DPR : 20*DPR;

    entities.push({
      type,
      lane,
      x,
      y,
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
      r: 6*DPR,
      vy: state.speed * 1.35,
      t: 0
    });
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

  function syncUI(){
    uiScore.textContent = String(Math.floor(state.score));
    uiLives.textContent = String(state.lives);
    uiCombo.textContent = `x${state.combo}`;
    uiAstro.textContent = String(state.astro);
    uiCash.textContent = String(state.cash);
    uiShield.textContent = `${Math.max(0, Math.ceil(state.shield))}s`;
  }

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
    state.speed = 680;
    state.t = 0;
    state.difficulty = 0;

    ship.lane = 1;
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

    // Seed a couple of pickups early for good first impression
    spawnEntity("cash");
    spawnEntity("astro");

    syncUI();
  }

  // --- Menu demo so desktop never looks "static" ---
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

    state.speed = 560;
    state.t = 0;
    state.difficulty = 2.0;

    ship.lane = 1;
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

  // -------- Input: tap left/right halves (mobile + desktop) + arrows --------
  function dashLeft(){ ship.targetLane = clamp(ship.targetLane - 1, 0, laneCount-1); }
  function dashRight(){ ship.targetLane = clamp(ship.targetLane + 1, 0, laneCount-1); }

  function onPointerDown(ev){
    const rect = canvas.getBoundingClientRect();
    const px = (ev.clientX - rect.left) / rect.width; // 0..1
    if(px < 0.5) dashLeft(); else dashRight();
  }

  canvas.addEventListener("pointerdown", (ev)=>{
    ev.preventDefault();
    // If overlay is visible, let buttons handle it; still allow background demo.
    if(overlay.style.display !== "none") return;
    onPointerDown(ev);
  }, {passive:false});

  addEventListener("keydown", (ev)=>{
    if(ev.key === "p" || ev.key === "P"){ state.paused = !state.paused; }
    if(ev.key === "r" || ev.key === "R"){ reset(state.practice); }
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

  // -------- Mechanics --------
  function applyComboHit(){
    state.comboHits += 1;
    state.comboTimer = 1.8; // refresh

    // combo ladder (arcade)
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

      // recompute combo
      const hits = state.comboHits;
      let c = 1;
      if(hits >= 3) c = 2;
      if(hits >= 7) c = 3;
      if(hits >= 12) c = 4;
      if(hits >= 18) c = 5;
      state.combo = c;
    }
  }

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
      // slow motion for a moment
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

    // shield absorbs first hit
    if(state.shield > 0){
      state.shield = Math.max(0, state.shield - 4);
      ship.inv = 0.6;
      addParticles(ship.x, ship.y, 18, true);
      // small penalty, keep game fair
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

  // -------- Draw helpers (recognisable minimal icons) --------
  function drawBrief(x,y,s){
    ctx.fillStyle = "rgba(255,255,255,.90)";
    ctx.fillRect(x - s*0.55, y - s*0.65, s*1.1, s*1.3);

    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.fillRect(x - s*0.40, y - s*0.35, s*0.8, s*0.10);
    ctx.fillRect(x - s*0.40, y - s*0.15, s*0.65, s*0.10);
    ctx.fillRect(x - s*0.40, y + s*0.05, s*0.55, s*0.10);

    ctx.fillStyle = "rgba(166,255,77,.60)";
    ctx.beginPath();
    ctx.moveTo(x + s*0.55, y - s*0.65);
    ctx.lineTo(x + s*0.28, y - s*0.65);
    ctx.lineTo(x + s*0.55, y - s*0.38);
    ctx.closePath();
    ctx.fill();
  }

  function drawUFO(x,y,s,t){
    const wob = Math.sin(t)*0.8*DPR;
    ctx.fillStyle = "rgba(255,255,255,.18)";
    ctx.beginPath();
    ctx.ellipse(x, y + wob, s*0.85, s*0.28, 0, 0, Math.PI*2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,.22)";
    ctx.lineWidth = 2*DPR;
    ctx.beginPath();
    ctx.ellipse(x, y + wob, s*0.95, s*0.34, 0, 0, Math.PI*2);
    ctx.stroke();

    ctx.fillStyle = "rgba(166,255,77,.25)";
    ctx.beginPath();
    ctx.ellipse(x, y - s*0.12 + wob, s*0.38, s*0.22, 0, Math.PI, 0, true);
    ctx.fill();

    ctx.fillStyle = "rgba(166,255,77,.85)";
    for(let i=-2;i<=2;i++){
      ctx.fillRect(x + i*s*0.22 - 2*DPR, y + s*0.10 + wob, 4*DPR, 3*DPR);
    }
  }

  function drawAstronaut(x,y,s,t){
    const bob = Math.sin(t)*2*DPR;
    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.fillRect(x - s*0.42, y - s*0.35 + bob, s*0.84, s*0.92);
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.fillRect(x - s*0.22, y - s*0.10 + bob, s*0.44, s*0.22);
    ctx.fillStyle = "rgba(166,255,77,.62)";
    ctx.fillRect(x - s*0.46, y + s*0.62 + bob, s*0.92, 3*DPR);
  }

  function drawCash(x,y,s,t){
    const pulse = (Math.sin(t*1.6)*0.25 + 0.75);
    ctx.strokeStyle = "rgba(166,255,77,.60)";
    ctx.lineWidth = 2*DPR;
    ctx.beginPath();
    ctx.arc(x,y,s*0.62,0,Math.PI*2);
    ctx.stroke();

    ctx.fillStyle = `rgba(166,255,77,${0.12 + pulse*0.14})`;
    ctx.beginPath();
    ctx.arc(x,y,s*0.62,0,Math.PI*2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.font = `${Math.floor(18*DPR)}px system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial`;
    ctx.textAlign = "center";
    ctx.fillText("$", x, y + 6*DPR);
    ctx.textAlign = "left";
  }

  function drawPower(x,y,s,t,type){
    // powerups share a capsule look + distinct glyph
    const pulse = (Math.sin(t*2.0)*0.25 + 0.75);
    ctx.strokeStyle = "rgba(166,255,77,.45)";
    ctx.lineWidth = 2*DPR;
    ctx.beginPath();
    ctx.roundRect(x - s*0.62, y - s*0.45, s*1.24, s*0.9, 10*DPR);
    ctx.stroke();

    ctx.fillStyle = `rgba(166,255,77,${0.08 + pulse*0.10})`;
    ctx.beginPath();
    ctx.roundRect(x - s*0.62, y - s*0.45, s*1.24, s*0.9, 10*DPR);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.font = `${Math.floor(16*DPR)}px system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial`;
    ctx.textAlign = "center";
    const glyph = type==="shield" ? "🛡" : type==="slow" ? "⏳" : "🧲";
    ctx.fillText(glyph, x, y + 6*DPR);
    ctx.textAlign = "left";
  }

  // polyfill-ish for roundRect on older canvases
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

  function drawMissile(m){
    // tiny rocket
    ctx.fillStyle = "rgba(255,255,255,.88)";
    ctx.fillRect(m.x - 2*DPR, m.y - 8*DPR, 4*DPR, 14*DPR);
    ctx.fillStyle = "rgba(166,255,77,.95)";
    ctx.fillRect(m.x - 1*DPR, m.y + 6*DPR, 2*DPR, 4*DPR);
  }

  function drawShip(){
    // trail
    for(const tr of ship.trail){
      ctx.fillStyle = `rgba(166,255,77,${0.09*tr.a})`;
      ctx.beginPath();
      ctx.arc(tr.x, tr.y, 18*DPR*(0.55+tr.a*0.45), 0, Math.PI*2);
      ctx.fill();
    }

    // glow
    const shieldBoost = (state.shield>0) ? 0.10 : 0;
    const g = ctx.createRadialGradient(ship.x,ship.y,0,ship.x,ship.y, 75*DPR);
    g.addColorStop(0, `rgba(166,255,77,${0.12 + shieldBoost})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(ship.x,ship.y, 75*DPR, 0, Math.PI*2);
    ctx.fill();

    // body
    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.beginPath();
    ctx.moveTo(ship.x, ship.y - 18*DPR);
    ctx.lineTo(ship.x + 14*DPR, ship.y + 14*DPR);
    ctx.lineTo(ship.x, ship.y + 6*DPR);
    ctx.lineTo(ship.x - 14*DPR, ship.y + 14*DPR);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(166,255,77,.95)";
    ctx.fillRect(ship.x - 7*DPR, ship.y + 6*DPR, 14*DPR, 4*DPR);

    // inv flash
    if(ship.inv > 0){
      ctx.strokeStyle = "rgba(166,255,77,.55)";
      ctx.lineWidth = 2*DPR;
      ctx.beginPath();
      ctx.arc(ship.x,ship.y, 28*DPR, 0, Math.PI*2);
      ctx.stroke();
    }

    // shield bubble
    if(state.shield > 0){
      ctx.strokeStyle = "rgba(166,255,77,.35)";
      ctx.lineWidth = 2*DPR;
      ctx.beginPath();
      ctx.arc(ship.x,ship.y, 34*DPR, 0, Math.PI*2);
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

  function drawBG(dt){
    ctx.clearRect(0,0,W,H);

    // stars
    const speedFactor = state.speed/640;
    for(const s of stars){
      s.tw += 0.02;
      const a = (Math.sin(s.tw)*0.25 + 0.75) * s.a;
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillRect(s.x, s.y, s.s, s.s);
      s.y += s.v * speedFactor * (dt*60);
      if(s.y > H){ s.y = -2*DPR; s.x = Math.random()*W; }
    }

    // arcade lane rails (more visible)
    for(let i=0;i<laneCount;i++){
      const x = laneX(i);

      // glow rail
      const grad = ctx.createLinearGradient(x, H*0.10, x, H*0.92);
      grad.addColorStop(0, "rgba(166,255,77,.00)");
      grad.addColorStop(0.5, "rgba(166,255,77,.10)");
      grad.addColorStop(1, "rgba(166,255,77,.00)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 3*DPR;
      ctx.beginPath();
      ctx.moveTo(x, H*0.10);
      ctx.lineTo(x, H*0.92);
      ctx.stroke();

      // thin white guide
      ctx.strokeStyle = "rgba(255,255,255,.07)";
      ctx.lineWidth = 1*DPR;
      ctx.beginPath();
      ctx.moveTo(x, H*0.10);
      ctx.lineTo(x, H*0.92);
      ctx.stroke();
    }

    // vignette
    const v = ctx.createRadialGradient(W*0.5,H*0.5,0,W*0.5,H*0.5,Math.max(W,H)*0.65);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = v;
    ctx.fillRect(0,0,W,H);
  }

  function update(dt){
    if(!state.running || state.paused) return;

    state.t += dt;

    // powerup timers
    state.shield = Math.max(0, state.shield - dt);
    state._slowT = Math.max(0, (state._slowT||0) - dt);
    state._magnetT = Math.max(0, (state._magnetT||0) - dt);

    // difficulty / speed
    if(!state.menuDemo){
      state.difficulty = Math.min(14, state.difficulty + dt*0.12);
      const slowFactor = state._slowT > 0 ? 0.65 : 1.0;
      state.speed = (700 + state.difficulty*30) * slowFactor;

      // time score
      state.score += (state.practice ? 3.5 : 7.5) * dt * 60;
    } else {
      // demo speed
      state.speed = 560;
    }

    // ship movement: snap lanes fast (arcade)
    const tx = laneX(ship.targetLane);
    ship.x = lerp(ship.x, tx, 1 - Math.pow(0.0004, dt*60)); // snappier than before
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
      // pick a random ufo currently on screen
      const ufos = entities.filter(e=>e.type==="ufo" && !e.dead && e.y>H*0.10 && e.y < H*0.55);
      if(ufos.length){
        const u = ufos[Math.floor(Math.random()*ufos.length)];
        spawnMissile(u.x, u.y + 10*DPR, u.lane);
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

    // magnet effect: pull pickups toward ship slightly
    const magnetOn = (state._magnetT||0) > 0;
    if(magnetOn){
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
        m.y += 220*DPR;
        addParticles(m.x, m.y, 12, false);
      }
    }

    // combo decay
    decayCombo(dt);

    // if overlay visible (menu demo), auto wiggle lanes so it looks alive
    if(state.menuDemo && overlay.style.display !== "none"){
      if(Math.random() < 0.02){
        ship.targetLane = Math.floor(rnd(0,laneCount));
      }
    }

    syncUI();
  }

  function draw(dt){
    drawBG(dt);

    // entities
    for(const e of entities){
      if(e.type === "brief") drawBrief(e.x,e.y, 18*DPR);
      else if(e.type === "ufo") drawUFO(e.x,e.y, 22*DPR, state.t + e.wob);
      else if(e.type === "astro") drawAstronaut(e.x,e.y, 20*DPR, state.t + e.wob);
      else if(e.type === "cash") drawCash(e.x,e.y, 20*DPR, state.t + e.wob);
      else drawPower(e.x,e.y, 20*DPR, state.t + e.wob, e.type);
    }

    // missiles
    for(const m of missiles) drawMissile(m);

    // ship
    drawShip();

    // particles
    drawParticles(dt);

    // center combo flash (only when combo > 1)
    if(state.combo > 1 && overlay.style.display === "none"){
      ctx.fillStyle = "rgba(255,255,255,.80)";
      ctx.font = `${Math.floor(18*DPR)}px system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial`;
      ctx.textAlign = "center";
      ctx.fillText(`COMBO x${state.combo}`, W*0.5, H*0.22);
      ctx.textAlign = "left";
    }

    // subtle scanlines
    ctx.fillStyle = "rgba(255,255,255,.022)";
    for(let y=0; y<H; y += Math.floor(3*DPR)){
      ctx.fillRect(0, y, W, 1*DPR);
    }
  }

  // -------- Main loop --------
  let last = performance.now();
  function loop(t){
    requestAnimationFrame(loop);
    const dt = Math.min(0.033, (t-last)/1000);
    last = t;
    update(dt);
    draw(dt);
  }
  requestAnimationFrame(loop);

  // Prevent scroll on touch
  canvas.addEventListener("touchstart", e=>e.preventDefault(), {passive:false});
  canvas.addEventListener("touchmove", e=>e.preventDefault(), {passive:false});

  // Start in menu demo so desktop is never "static"
  overlay.style.display = "flex";
  startMenuDemo();
})();
