(() => {
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");

  const uiScore = document.getElementById("uiScore");
  const uiLives = document.getElementById("uiLives");
  const uiStreak = document.getElementById("uiStreak");
  const uiAstro = document.getElementById("uiAstro");
  const uiCash = document.getElementById("uiCash");

  const overlay = document.getElementById("overlay");
  const btnStart = document.getElementById("btnStart");
  const btnPractice = document.getElementById("btnPractice");

  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const lerp = (a,b,t)=>a+(b-a)*t;
  const rnd = (a,b)=>a+Math.random()*(b-a);

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

  // --- Premium starfield ---
  const stars=[];
  function initStars(){
    stars.length=0;
    const count = Math.floor((innerWidth*innerHeight)/9000);
    for(let i=0;i<count;i++){
      stars.push({ x:Math.random()*W, y:Math.random()*H, s:rnd(0.6,1.6)*DPR, a:rnd(0.12,0.9), v:rnd(0.2,1.2)*DPR, tw:rnd(0,Math.PI*2) });
    }
  }
  initStars();

  // --- Lanes ---
  const laneCount = 5;
  function laneX(i){
    const pad = W*0.12;
    const usable = W - pad*2;
    return pad + (usable/(laneCount-1))*i;
  }

  // --- Game state ---
  const state = {
    running:false,
    paused:false,
    practice:false,
    score:0,
    lives:3,
    streak:0,
    astro:0,
    cash:0,
    speed: 520, // px/s (world scroll)
    t:0,
    difficulty:0,
  };

  const ship = {
    lane: 2,
    x: 0,
    y: 0,
    targetLane: 2,
    r: 18*DPR,
    inv: 0, // invincibility timer
    trail: [],
  };

  let entities = []; // obstacles + pickups
  let spawnTimer = 0;

  function reset(practice=false){
    state.practice = practice;
    state.running = true;
    state.paused = false;
    state.score = 0;
    state.lives = practice ? 99 : 3;
    state.streak = 0;
    state.astro = 0;
    state.cash = 0;
    state.speed = 560;
    state.t = 0;
    state.difficulty = 0;

    ship.lane = 2;
    ship.targetLane = 2;
    ship.x = laneX(ship.lane);
    ship.y = H*0.74;
    ship.inv = 0;
    ship.trail.length = 0;

    entities = [];
    spawnTimer = 0;

    syncUI();
  }

  function syncUI(){
    uiScore.textContent = String(Math.floor(state.score));
    uiLives.textContent = String(state.lives);
    uiStreak.textContent = String(state.streak);
    uiAstro.textContent = String(state.astro);
    uiCash.textContent = String(state.cash);
  }

  // --- Entities ---
  // types: "brief", "ufo", "astro", "cash"
  function spawnEntity(){
    const lane = Math.floor(rnd(0,laneCount));
    const x = laneX(lane);
    const y = -60*DPR;

    // spawn mix shifts with difficulty
    const d = state.difficulty;
    const r = Math.random();

    let type = "brief";
    if(r < 0.18) type = "astro";
    else if(r < 0.36) type = "cash";
    else if(r < (0.36 + 0.22 + d*0.01)) type = "ufo";
    else type = "brief";

    const size = (type === "ufo") ? 22*DPR : 20*DPR;

    entities.push({
      type,
      lane,
      x,
      y,
      r: size,
      vy: state.speed * (type==="ufo" ? 1.05 : 1.0),
      wob: rnd(0,Math.PI*2),
    });
  }

  // --- Input (tap/click left/right) ---
  function dashLeft(){
    ship.targetLane = clamp(ship.targetLane - 1, 0, laneCount-1);
  }
  function dashRight(){
    ship.targetLane = clamp(ship.targetLane + 1, 0, laneCount-1);
  }

  function onPointerDown(ev){
    if(!state.running){ return; }
    const rect = canvas.getBoundingClientRect();
    const px = (ev.clientX - rect.left) / rect.width; // 0..1
    if(px < 0.5) dashLeft(); else dashRight();
  }

  canvas.addEventListener("pointerdown", (ev)=>{
    ev.preventDefault();
    if(overlay.style.display !== "none") return;
    onPointerDown(ev);
  }, {passive:false});

  addEventListener("keydown", (ev)=>{
    if(ev.key === "p" || ev.key === "P"){
      state.paused = !state.paused;
    }
    if(ev.key === "r" || ev.key === "R"){
      reset(state.practice);
    }
    // optional arrows (desktop)
    if(ev.key === "ArrowLeft") dashLeft();
    if(ev.key === "ArrowRight") dashRight();
  });

  btnStart.addEventListener("click", ()=>{
    overlay.style.display = "none";
    reset(false);
  });
  btnPractice.addEventListener("click", ()=>{
    overlay.style.display = "none";
    reset(true);
  });

  // --- Collision ---
  function hitObstacle(){
    if(state.practice) return;

    if(ship.inv > 0) return;

    state.lives -= 1;
    state.streak = 0;
    ship.inv = 1.0; // 1 sec invuln

    if(state.lives <= 0){
      // game over
      state.running = true;
      overlay.style.display = "flex";
      overlay.querySelector("h1").textContent = "Run complete";
      overlay.querySelectorAll("p")[0].innerHTML =
        `Score <span class="green">${Math.floor(state.score)}</span> • 👨‍🚀 <span class="green">${state.astro}</span> • $ <span class="green">${state.cash}</span>`;
      overlay.querySelectorAll("p")[1].innerHTML =
        `Tap left/right to dodge. Keep it <span class="green">bold</span>.`;
    }
  }

  function collect(type){
    if(type === "astro"){
      state.astro += 1;
      state.score += 180 + state.streak*10;
      state.streak += 1;
    } else if(type === "cash"){
      state.cash += 1;
      state.score += 120 + state.streak*8;
      state.streak += 1;
    }
  }

  // --- Drawing: minimal recognisable icons ---
  function drawBrief(x,y, s){
    // paper + fold
    ctx.fillStyle = "rgba(255,255,255,.88)";
    ctx.fillRect(x - s*0.55, y - s*0.65, s*1.1, s*1.3);
    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.fillRect(x - s*0.40, y - s*0.35, s*0.8, s*0.10);
    ctx.fillRect(x - s*0.40, y - s*0.15, s*0.65, s*0.10);
    ctx.fillRect(x - s*0.40, y + s*0.05, s*0.55, s*0.10);

    ctx.fillStyle = "rgba(166,255,77,.55)";
    ctx.beginPath();
    ctx.moveTo(x + s*0.55, y - s*0.65);
    ctx.lineTo(x + s*0.30, y - s*0.65);
    ctx.lineTo(x + s*0.55, y - s*0.40);
    ctx.closePath();
    ctx.fill();
  }

  function drawUFO(x,y,s, t){
    // saucer
    const wob = Math.sin(t)*0.8;
    ctx.fillStyle = "rgba(255,255,255,.18)";
    ctx.beginPath();
    ctx.ellipse(x, y + wob, s*0.80, s*0.28, 0, 0, Math.PI*2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,.22)";
    ctx.lineWidth = 2*DPR;
    ctx.beginPath();
    ctx.ellipse(x, y + wob, s*0.92, s*0.34, 0, 0, Math.PI*2);
    ctx.stroke();

    // dome
    ctx.fillStyle = "rgba(166,255,77,.28)";
    ctx.beginPath();
    ctx.ellipse(x, y - s*0.10 + wob, s*0.35, s*0.22, 0, Math.PI, 0, true);
    ctx.fill();

    // lights
    ctx.fillStyle = "rgba(166,255,77,.85)";
    for(let i=-2;i<=2;i++){
      ctx.fillRect(x + i*s*0.24 - 2*DPR, y + s*0.10 + wob, 4*DPR, 3*DPR);
    }
  }

  function drawAstronaut(x,y,s, t){
    const bob = Math.sin(t)*2*DPR;
    // body
    ctx.fillStyle = "rgba(255,255,255,.90)";
    ctx.fillRect(x - s*0.42, y - s*0.35 + bob, s*0.84, s*0.92);
    // visor
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.fillRect(x - s*0.22, y - s*0.10 + bob, s*0.44, s*0.22);
    // accent band
    ctx.fillStyle = "rgba(166,255,77,.60)";
    ctx.fillRect(x - s*0.46, y + s*0.62 + bob, s*0.92, 3*DPR);
  }

  function drawCash(x,y,s, t){
    const pulse = (Math.sin(t*1.6)*0.25 + 0.75);
    ctx.strokeStyle = "rgba(166,255,77,.55)";
    ctx.lineWidth = 2*DPR;
    ctx.beginPath();
    ctx.arc(x,y,s*0.62,0,Math.PI*2);
    ctx.stroke();

    ctx.fillStyle = `rgba(166,255,77,${0.12 + pulse*0.12})`;
    ctx.beginPath();
    ctx.arc(x,y,s*0.62,0,Math.PI*2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.font = `${Math.floor(18*DPR)}px system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial`;
    ctx.textAlign = "center";
    ctx.fillText("$", x, y + 6*DPR);
    ctx.textAlign = "left";
  }

  function drawShip(){
    // trail
    for(const tr of ship.trail){
      ctx.fillStyle = `rgba(166,255,77,${0.10*tr.a})`;
      ctx.beginPath();
      ctx.arc(tr.x, tr.y, 18*DPR*(0.6+tr.a*0.4), 0, Math.PI*2);
      ctx.fill();
    }

    // glow
    const g = ctx.createRadialGradient(ship.x,ship.y,0,ship.x,ship.y, 70*DPR);
    g.addColorStop(0, `rgba(166,255,77,${0.14 + (ship.inv>0?0.08:0)})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(ship.x,ship.y, 70*DPR, 0, Math.PI*2);
    ctx.fill();

    // body (tiny ship)
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
      ctx.strokeStyle = "rgba(166,255,77,.60)";
      ctx.lineWidth = 2*DPR;
      ctx.beginPath();
      ctx.arc(ship.x,ship.y, 28*DPR, 0, Math.PI*2);
      ctx.stroke();
    }
  }

  function drawBG(dt){
    ctx.clearRect(0,0,W,H);

    // stars move down (illusion forward)
    for(const s of stars){
      s.tw += 0.02;
      const a = (Math.sin(s.tw)*0.25 + 0.75) * s.a;
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillRect(s.x, s.y, s.s, s.s);
      s.y += s.v * (state.speed/520) * (dt*60);
      if(s.y > H){ s.y = -2*DPR; s.x = Math.random()*W; }
    }

    // subtle lane guides (premium)
    ctx.strokeStyle = "rgba(255,255,255,.06)";
    ctx.lineWidth = 1*DPR;
    for(let i=0;i<laneCount;i++){
      const x = laneX(i);
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
    state.score += (state.practice ? 4 : 8) * dt * 60; // time score
    state.difficulty = Math.min(12, state.difficulty + dt*0.12);
    state.speed = 560 + state.difficulty*26;

    // ship lane move (snappy, controllable)
    const tx = laneX(ship.targetLane);
    ship.x = lerp(ship.x, tx, 1 - Math.pow(0.0008, dt*60)); // fast smoothing
    ship.y = H*0.74;

    ship.trail.push({x:ship.x, y:ship.y+14*DPR, a:1});
    if(ship.trail.length>22) ship.trail.shift();
    for(const tr of ship.trail) tr.a *= 0.90;

    if(ship.inv>0) ship.inv = Math.max(0, ship.inv - dt);

    // spawns
    spawnTimer -= dt;
    const spawnEvery = clamp(0.55 - state.difficulty*0.02, 0.20, 0.55);
    if(spawnTimer<=0){
      spawnEntity();
      // sometimes double spawn later
      if(Math.random() < 0.12 + state.difficulty*0.01) spawnEntity();
      spawnTimer = spawnEvery;
    }

    // move entities
    for(const e of entities){
      e.wob += dt*3.0;
      e.y += e.vy * dt;
    }
    // cleanup
    entities = entities.filter(e => e.y < H + 120*DPR);

    // collisions
    const sr = 22*DPR;
    for(const e of entities){
      const dx = ship.x - e.x;
      const dy = ship.y - e.y;
      const rr = (sr + e.r);
      if(dx*dx + dy*dy <= rr*rr){
        if(e.type === "brief" || e.type === "ufo"){
          hitObstacle();
          // push entity away to avoid multi-hit
          e.y += 220*DPR;
        } else {
          collect(e.type);
          e.y += 220*DPR;
        }
      }
    }

    // streak decay if you stop collecting for too long
    if(state.streak>0 && Math.random()<0.01) state.streak = Math.max(0, state.streak-1);

    syncUI();
  }

  function draw(dt){
    drawBG(dt);

    // entities
    for(const e of entities){
      if(e.type === "brief") drawBrief(e.x,e.y, 18*DPR);
      if(e.type === "ufo") drawUFO(e.x,e.y, 22*DPR, state.t + e.wob);
      if(e.type === "astro") drawAstronaut(e.x,e.y, 20*DPR, state.t + e.wob);
      if(e.type === "cash") drawCash(e.x,e.y, 20*DPR, state.t + e.wob);
    }

    drawShip();

    // subtle scanlines
    ctx.fillStyle = "rgba(255,255,255,.025)";
    for(let y=0; y<H; y += Math.floor(3*DPR)){
      ctx.fillRect(0, y, W, 1*DPR);
    }
  }

  let last = performance.now();
  function loop(t){
    requestAnimationFrame(loop);
    const dt = Math.min(0.033, (t-last)/1000);
    last = t;

    if(state.running && !state.paused) update(dt);
    draw(dt);
  }
  requestAnimationFrame(loop);

  // Start in overlay/menu mode
  overlay.style.display = "flex";

  // Prevent scroll on touch
  canvas.addEventListener("touchstart", e=>e.preventDefault(), {passive:false});
  canvas.addEventListener("touchmove", e=>e.preventDefault(), {passive:false});
})();
