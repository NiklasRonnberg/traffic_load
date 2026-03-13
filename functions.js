// Viewport dimensions
const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);

// Map tiles
const hTiles = 22;
const vTiles = 12;

// Compute max tile size that fits in both dimensions
let tileSize = Math.floor(Math.min(vw / hTiles, vh / vTiles));

// Optional: round down to nearest multiple of 10
tileSize = Math.floor(tileSize / 10) * 10;

// Make sure tileSize is at least 1
tileSize = Math.max(tileSize, 1);

const canvasWidth = tileSize * hTiles;
const canvasHeight = tileSize * vTiles;

let firstGameStart = true;

// Player tank
let userTank;
let tankSpeed = 0;
let changeTankSpeedFlag = true;
let setTankSpeedStartTime = 0;

// Forward/backward speeds
const forwardSpeeds = [
    { target: 1, duration: 1000 }, // 0 → 1 in 1s
    { target: 2, duration: 2000 }, // 1 → 2 in 2s
    { target: 3, duration: 3000 }  // 2 → 3 in 3s
];
const backwardSpeed = { target: -1, duration: 2000 }; // 0 → -1 in 2s

let wPressedTime = null; // timestamp when W was pressed
let sPressedTime = null; // timestamp when S was pressed

// Mouse position
let mouseX = 0;
let mouseY = 0;

// Tank images
const tankBody = new Image();
const tankTurret = new Image();

// Tiles
const tiles = {};

// Particles and bullets
let smokeParticles = [];
let bullets = [];

// Upgrade levels & mechanics
let levels = [1, 1, 1, 1, 1];
let turretInertia = [0.01, 0.05, 0.2];
let shotCooldown = [1000, 500, 250];
let bulletDistanceFactor = [3, 5, 8];
let bulletPower = [0.5, 1, 3];
let maxSpeed = [0.25, 0.45, 0.75];
let tankHealth = 1; // 1 -> 0

// HUD
let hudOffsetY = -tileSize;   // start above screen
let hudTargetY = 0;
let hudSpeed = 0.08;
let hudVisible = false;
let hudClickZones = [];

// Timing
let lastShotTime = 0; // timestamp of the last fired bullet

// Explosions & sparks
let explosions = [];
const obstacleTiles = [3];
let sparks = [];

// Tile hits & fading
const tileHits = {}; // key = tile index, value = number of hits
let fadingTiles = [];  // Each entry: { xTile, yTile, currentAlpha, targetTile, startTime, duration }

// Game state
let gameStarted = false;
let gameOver = false;

// Audio
let audioContext;
let engineOscillator;
let engineGain;
let engineLFO;

// Crate
const crateImage = new Image();
crateImage.src = "images/crate.png";
let crates = [];
let nextCrateSpawnTime = 0;
const crateLifetime = 15000;
const crateSpawnIntervall = 15000;
let upgradeAvailable = false;
let cratePickupLock = false;

// First aid
const firstaidImage = new Image();
firstaidImage.src = "images/firstaid.png";

let firstaids = [];
let nextFirstaidSpawnTime = 0;
const firstaidLifetime = 15000;
const firstaidSpawnIntervall = 30000;
let firstaidPickupLock = false;
let improveHealth = false;






function startGame() {
    for (let i = 1; i <= 16; i++) {
        tiles[i] = new Image();
        tiles[i].src = "images/" + i + ".png";
    }

    tiles[20] = new Image();
    tiles[20].src = "images/20.png";
    tiles[15] = new Image();
    tiles[15].src = "images/15.png";
    tiles[16] = new Image();
    tiles[16].src = "images/16.png";
    tiles[17] = new Image();
    tiles[17].src = "images/17.png";

    tankBody.src = "images/tank.svg";
    tankTurret.src = "images/turret.svg";

    userTank = new Tank(
        Math.floor(tileSize * 0.7),
        Math.floor(tileSize * 0.7)
    );

    myGameArea.start();

    const startTile = getRandomStartTile();

    // Center the tank inside the tile
    const startX = startTile.x * tileSize + tileSize / 2;
    const startY = startTile.y * tileSize + tileSize / 2;

    // Random angle between 0 and 2*PI
    const startAngle = Math.random() * Math.PI * 2;

    userTank = new Tank(startX, startY);
    userTank.angle = startAngle;       // body angle
    userTank.turretAngle = startAngle; // start turret aligned with body
}

function getRandomStartTile() {
    // First, try the first column (x = 0)
    let validTiles = [];
    for (let y = 0; y < vTiles; y++) {
        const pos = y * hTiles + 0; // first column
        if (gameMap[pos] === 0 || gameMap[pos] === 1 || gameMap[pos] === 2) {
            validTiles.push({ x: 0, y });
        }
    }

    // If no valid tile in the first column, try the second column (x = 1)
    if (validTiles.length === 0) {
        for (let y = 0; y < vTiles; y++) {
            const pos = y * hTiles + 1; // second column
            if (gameMap[pos] === 0 || gameMap[pos] === 1 || gameMap[pos] === 2) {
                validTiles.push({ x: 1, y });
            }
        }
    }

    // If still empty, fallback to any tile (rare edge case)
    if (validTiles.length === 0) {
        for (let y = 0; y < vTiles; y++) {
            for (let x = 0; x < hTiles; x++) {
                const pos = y * hTiles + x;
                if (gameMap[pos] === 0 || gameMap[pos] === 1 || gameMap[pos] === 2) {
                    validTiles.push({ x, y });
                }
            }
        }
    }

    // Randomly pick one of the valid tiles
    return validTiles[Math.floor(Math.random() * validTiles.length)];
}

const myGameArea = {
    canvas: document.createElement("canvas"),

    start: function () {
        this.canvas.id = "arena";
        this.canvas.width = tileSize * hTiles;
        this.canvas.height = tileSize * vTiles;

        this.context = this.canvas.getContext("2d");

        document.body.insertBefore(this.canvas, document.body.childNodes[0]);

        this.frameNo = 0;

        this.interval = setInterval(updateGameArea, 20);

        window.addEventListener("keydown", function (e) {
            e.preventDefault();

            myGameArea.keys = myGameArea.keys || [];
            myGameArea.keys[e.keyCode] = true;
        });

        window.addEventListener("keyup", function (e) {
            myGameArea.keys[e.keyCode] = false;
        });

        this.canvas.addEventListener("mousemove", function (e) {
            const rect = myGameArea.canvas.getBoundingClientRect();

            const scaleX = myGameArea.canvas.width / rect.width;
            const scaleY = myGameArea.canvas.height / rect.height;

            mouseX = (e.clientX - rect.left) * scaleX;
            mouseY = (e.clientY - rect.top) * scaleY;

        });

        this.canvas.addEventListener("mousedown", function(e) {
            const rect = this.getBoundingClientRect();
            const scaleX = this.width / rect.width;
            const scaleY = this.height / rect.height;

            const mouseX = (e.clientX - rect.left) * scaleX;
            const mouseY = (e.clientY - rect.top) * scaleY;

            if (!gameStarted || !userTank || userTank.destroyed) return;

            if (upgradeAvailable) {
                if (audioContext) triggerSelection();
                for (const zone of hudClickZones) {
                    if (
                        mouseX >= zone.x &&
                        mouseX <= zone.x + zone.width &&
                        mouseY >= zone.y &&
                        mouseY <= zone.y + zone.height
                    ) {
                        const i = zone.index;

                        if (levels[i] < 3) {
                            levels[i]++;
                        }

                        upgradeAvailable = false;

                        return;   // <<< THIS stops the shot
                    }
                }

                return; // <<< clicking anywhere while upgrade is active does nothing
            }

            // --- SHOOTING ---
            const now = Date.now();

            if (now - lastShotTime >= shotCooldown[levels[1]-1]) {
                if (audioContext) {
                    const decay = 0.15 + Math.random() * 0.2;
                    const cutoff = 650 + Math.random() * 350;
                    triggerGunShot(audioContext, 0.75, 50, cutoff, decay);
                }

                const turretH = tileSize * 0.9;
                const turretW = turretH * 0.55;
                const pivotY = turretH * 0.67;

                const localTipX = 0;
                const localTipY = -pivotY;

                const tipX = userTank.x + localTipX * Math.cos(userTank.turretAngle) - localTipY * Math.sin(userTank.turretAngle);
                const tipY = userTank.y + localTipX * Math.sin(userTank.turretAngle) + localTipY * Math.cos(userTank.turretAngle);

                bullets.push(new Bullet(tipX, tipY, userTank.turretAngle));

                barrelSmoke(tipX, tipY);

                lastShotTime = now;
            }
        });

        drawBackground();   // draw map
    },

    clear: function () {
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

};

function Tank(x, y) {
    this.x = x;
    this.y = y;

    this.angle = 0;
    this.turretAngle = 0;

    this.speed = 0;
    this.moveAngle = 0;

    this.update = function () {
        if (this.destroyed) return;

        const ctx = myGameArea.context;
        const bodyH = tileSize * 0.9;
        const bodyW = bodyH * 0.55;

        const turretH = bodyH;
        const turretW = bodyW;

        const pivotX = turretW * 0.5;
        const pivotY = turretH * 0.67;

        // ---- DRAW BODY ----
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.drawImage(tankBody, -bodyW / 2, -bodyH / 2, bodyW, bodyH);
        ctx.restore();

        // ---- DRAW TURRET ----
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.turretAngle);
        ctx.drawImage(tankTurret, -pivotX, -pivotY, turretW, turretH);
        ctx.restore();
    };

    this.rotateTurretToMouse = function () {
        if (this.destroyed) return;

        const dx = mouseX - this.x;
        const dy = mouseY - this.y;

        const targetAngle = Math.atan2(dy, dx) + Math.PI / 2;

        let delta = targetAngle - this.turretAngle;

        // Wrap delta to [-PI, PI]
        delta = (delta + Math.PI) % (2 * Math.PI) - Math.PI;

        this.turretAngle += delta * turretInertia[levels[0] - 1];
    };

    this.hitBorder = function () {
        const bottom = myGameArea.canvas.height - 30;
        const top = 30;
        const right = myGameArea.canvas.width - 30;
        const left = 30;

        if (this.y > bottom) {
            tankSpeed = 0;
            this.y = bottom;
        }

        if (this.y < top) {
            tankSpeed = 0;
            this.y = top;
        }

        if (this.x > right) {
            tankSpeed = 0;
            this.x = right;
        }

        if (this.x < left) {
            tankSpeed = 0;
            this.x = left;
        }

        this.checkCollision();
    };

    this.checkCollision = function () {
        const look = lookAhead(this);

        let xToCheck = this.x;
        let yToCheck = this.y;

        if (this.speed > 0) {
            xToCheck = Math.floor((xToCheck + Math.sin(this.angle) * look) / tileSize);
            yToCheck = Math.floor((yToCheck - Math.cos(this.angle) * look) / tileSize);
        } else if (this.speed < 0) {
            xToCheck = Math.floor((xToCheck - Math.sin(this.angle) * look) / tileSize);
            yToCheck = Math.floor((yToCheck + Math.cos(this.angle) * look) / tileSize);
        }

        if (xToCheck < 0) xToCheck = 0;
        if (xToCheck > hTiles - 1) xToCheck = hTiles - 1;
        if (yToCheck < 0) yToCheck = 0;
        if (yToCheck > vTiles - 1) yToCheck = hTiles - 1;

        const pos = xToCheck + (yToCheck * hTiles);

        if (![1, 2, 15, 16, 17].includes(gameMap[pos])) {
            tankSpeed = 0;
        }

        this.newPos();
    };

    this.newPos = function () {
        this.angle += this.moveAngle * Math.PI / 180;

        this.x += this.speed * Math.sin(this.angle);
        this.y -= this.speed * Math.cos(this.angle);
    };
}

function lookAhead(tank) {
    // Check one tile ahead
    const checkDistance = tank.speed + 2; // a bit ahead
    const futureX = tank.x + Math.sin(tank.angle) * checkDistance;
    const futureY = tank.y - Math.cos(tank.angle) * checkDistance;
    const xTile = Math.floor(futureX / tileSize);
    const yTile = Math.floor(futureY / tileSize);

    if (xTile < 0 || xTile >= hTiles || yTile < 0 || yTile >= vTiles) {
        return 0; // stop at borders
    }

    const tile = gameMap[yTile * hTiles + xTile];

    if (tile === 3) {
        // Soft obstacle: reduce speed proportionally
        const tileCenterX = xTile * tileSize + tileSize / 2;
        const tileCenterY = yTile * tileSize + tileSize / 2;
        const dx = tileCenterX - tank.x;
        const dy = tileCenterY - tank.y;
        const distToCenter = Math.sqrt(dx*dx + dy*dy);
        return Math.min(tank.speed, distToCenter / tileSize * tank.speed);
    }

    if (![1, 2, 15, 16, 17].includes(tile)) {
        // Hard obstacle: stop
        return 0;
    }

    return tank.speed; // free to go
}

function updateGameArea() {
    myGameArea.clear();

    drawBackground();
    updateFadingTiles(); // draw fading tiles on top

    const timeNow = Date.now();

    // initialize first spawns
    if (gameStarted && nextCrateSpawnTime === 0) {
        nextCrateSpawnTime = timeNow + crateSpawnIntervall + Math.random() * crateSpawnIntervall;
    }
    if (gameStarted && nextFirstaidSpawnTime === 0) {
        nextFirstaidSpawnTime = timeNow + firstaidSpawnIntervall + Math.random() * firstaidSpawnIntervall;
    }

    // spawn crate
    if (gameStarted && crates.length === 0 && timeNow >= nextCrateSpawnTime) {
        spawnRandomCrate();
    }

    // remove crate after lifetime and schedule next spawn
    for (let i = crates.length - 1; i >= 0; i--) {
        if (timeNow - crates[i].spawnTime > crateLifetime) {
            if (audioContext) triggerCrateDisappear();

            crates.splice(i, 1);

            nextCrateSpawnTime = timeNow + crateSpawnIntervall + Math.random() * crateSpawnIntervall;
        }
    }

    // spawn first aid
    if (gameStarted && firstaids.length === 0 && timeNow >= nextFirstaidSpawnTime) {
        spawnRandomFirstaid();
    }

    // remove firstaid after lifetime and schedule next spawn
    for (let i = firstaids.length - 1; i >= 0; i--) {
        if (timeNow - firstaids[i].spawnTime > firstaidLifetime) {
            if (audioContext) triggerFirstaid(550, 55);

            firstaids.splice(i, 1);

            nextFirstaidSpawnTime = timeNow + firstaidSpawnIntervall + Math.random() * firstaidSpawnIntervall;
        }
    }

    if (!gameStarted) {
        userTank.update(); // draw tank only
        return;
    }

    // --- Reset tank movement ---
    userTank.moveAngle = 0;
    userTank.speed = 0;

    if (!userTank.destroyed) {
        if (myGameArea.keys && myGameArea.keys[65]) userTank.moveAngle = -1; // A key
        if (myGameArea.keys && myGameArea.keys[68]) userTank.moveAngle = 1;  // D key

        // --- Forward/Backward acceleration handling ---
        const now = new Date().getTime();
        if (myGameArea.keys && myGameArea.keys[87] && changeTankSpeedFlag) { // W key
            changeTankSpeedFlag = false;
            tankSpeed++;
            setTankSpeedStartTime = now;
        }
        if (myGameArea.keys && myGameArea.keys[87]) {
            if (wPressedTime === null) wPressedTime = now;
        } else wPressedTime = null;
        if (myGameArea.keys && myGameArea.keys[83]) {
            if (sPressedTime === null) sPressedTime = now;
        } else sPressedTime = null;

        // --- Compute target speed ---
        let targetSpeed = 0;
        if (wPressedTime) {
            const elapsed = now - wPressedTime;
            if (elapsed < forwardSpeeds[0].duration) targetSpeed = (elapsed / forwardSpeeds[0].duration) * 1;
            else if (elapsed < forwardSpeeds[0].duration + forwardSpeeds[1].duration) 
                targetSpeed = 1 + ((elapsed - forwardSpeeds[0].duration) / forwardSpeeds[1].duration) * 1;
            else if (elapsed < forwardSpeeds[0].duration + forwardSpeeds[1].duration + forwardSpeeds[2].duration) 
                targetSpeed = 2 + ((elapsed - forwardSpeeds[0].duration - forwardSpeeds[1].duration) / forwardSpeeds[2].duration) * 1;
            else targetSpeed = 3;
        } else if (sPressedTime) {
            const elapsed = now - sPressedTime;
            targetSpeed = - Math.min(1, elapsed / backwardSpeed.duration);
        }

        // --- Smoothly interpolate current speed ---
        const accelerationFactor = 0.1;
        tankSpeed += (targetSpeed - tankSpeed) * accelerationFactor;
        userTank.speed = tankSpeed * maxSpeed[levels[4]-1] * (tileSize/50);
    }

    // --- Generate smoke behind tank ---
    if (tankSpeed !== 0 && !userTank.destroyed) {
        const offset = tileSize * 0.3; // behind tank
        const smokeX = userTank.x - Math.sin(userTank.angle) * offset;
        const smokeY = userTank.y + Math.cos(userTank.angle) * offset;

        smokeParticles.push(new Smoke(smokeX, smokeY, userTank.angle));
    }

    // --- Update smoke particles ---
    for (let i = smokeParticles.length - 1; i >= 0; i--) {
        smokeParticles[i].update();
        if (smokeParticles[i].life <= 0 || smokeParticles[i].alpha <= 0) {
            smokeParticles.splice(i, 1);
        }
    }

    // --- Rotate turret, move tank, handle collisions ---
    userTank.rotateTurretToMouse();
    userTank.hitBorder();
    userTank.update();

    // --- Show upgrade crates ---
    const now = Date.now();

    for (let i = crates.length - 1; i >= 0; i--) {
        const crate = crates[i];
        const dx = crate.x * tileSize + tileSize / 2 - userTank.x;
        const dy = crate.y * tileSize + tileSize / 2 - userTank.y;

        const dist = Math.sqrt(dx*dx + dy*dy);

        if (dist < (tileSize * 0.5) && !cratePickupLock) {
            cratePickupLock = true;

            // play pick up sound
            if (audioContext) triggerCratePickup();

            // remove crate
            crates.splice(i, 1);

            upgradeAvailable = true;

            // restart crate cycle
            nextCrateSpawnTime = now + crateSpawnIntervall + Math.random() * crateSpawnIntervall;

            setTimeout(() => {
                cratePickupLock = false;
            }, 300);

            break;
        }
    }

    // --- Show first aids ---
    for (let i = firstaids.length - 1; i >= 0; i--) {
        const firstaid = firstaids[i];
        const dx = firstaid.x * tileSize + tileSize / 2 - userTank.x;
        const dy = firstaid.y * tileSize + tileSize / 2 - userTank.y;

        const dist = Math.sqrt(dx*dx + dy*dy);

        if (dist < (tileSize * 0.5) && !firstaidPickupLock) {
            firstaidPickupLock = true;
            // play pick up sound
            if (audioContext) triggerFirstaidPickup();

            if (tankHealth < 1) {
                tankHealth += 0.2;
            }

            // remove first aid
            firstaids.splice(i, 1);

            improveHealth = true;

            // restart firstaid cycle
            nextFirstaidSpawnTime = now + firstaidSpawnIntervall + Math.random() * firstaidSpawnIntervall;

            setTimeout(() => {
                firstaidPickupLock = false;
            }, 300);

            break;
        }
    }

    // --- Update bullets, explosions, sparks ---
    checkBulletCollision();
    for (let i = explosions.length - 1; i >= 0; i--) {
        explosions[i].update();
        if (explosions[i].isDead()) explosions.splice(i, 1);
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
        let s = sparks[i];
        s.x += s.vx;
        s.y += s.vy;
        s.life--;
        const ctx = myGameArea.context;
        ctx.save();
        ctx.fillStyle = "yellow";
        ctx.fillRect(s.x, s.y, 2, 2);
        ctx.fillStyle = "orange";
        ctx.fillRect(s.x + 1, s.y + 1, 1, 1);
        ctx.restore();
        if (s.life <= 0) sparks.splice(i, 1);
    }

    // --- Show HUD ---
    if (hudVisible) drawHUD();

    // --- Update engine sound ---
    if (!userTank || userTank.destroyed) {
        if (engineGain) {
            const now = audioContext.currentTime;
            engineGain.gain.cancelScheduledValues(now);
            engineGain.gain.linearRampToValueAtTime(0, now + 0.1);
        }
    } else if (engineOscillator && engineGain && engineLFO) {

        const minFreq = 50;   // idle pitch (same for all levels)
        const minLFOFreq = 8; // idle wobble

        // Max values depend on level
        const maxFreq = 65 + (levels[4] - 1) * 10;
        const maxLFOFreq = 16 + (levels[4] - 1) * 6;

        // Normalize speed to 0 → 1
        const normalizedSpeed = Math.min(Math.abs(tankSpeed / 3), 1);

        // Update oscillator frequency
        const newFreq = minFreq + (maxFreq - minFreq) * normalizedSpeed;
        engineOscillator.frequency.setTargetAtTime(newFreq, audioContext.currentTime, 0.05);

        // Update LFO frequency
        const newLFOFreq = minLFOFreq + (maxLFOFreq - minLFOFreq) * normalizedSpeed;
        engineLFO.frequency.setTargetAtTime(newLFOFreq, audioContext.currentTime, 0.05);
    }
}

function timer(startTime) {
    const newTime = new Date().getTime();

    if (newTime - startTime >= 250) {
        changeTankSpeedFlag = true;
    }
}

function drawBackground() {
    const ctx = myGameArea.context;

    for (let y = 0; y < vTiles; y++) {
        for (let x = 0; x < hTiles; x++) {
            // Draw base layer
            const baseTile = baseMap[y * hTiles + x];
            if (tiles[baseTile]) {
                ctx.drawImage(
                    tiles[baseTile],
                    x * tileSize,
                    y * tileSize,
                    tileSize,
                    tileSize
                );
            }

            // Draw overlay layer on top if exists
            const overlayTile = overlayMap[y * hTiles + x];
            if (overlayTile !== 0 && tiles[overlayTile]) {
                ctx.drawImage(
                    tiles[overlayTile],
                    x * tileSize,
                    y * tileSize,
                    tileSize,
                    tileSize
                );
            }
        }
    }

    // --- Draw crates on top of tiles ---
    const crateScale = 0.5; // % of tile size
    const crateSize = tileSize * crateScale;

    for (const crate of crates) {
        const drawX = crate.x * tileSize + (tileSize - crateSize) / 2;
        const drawY = crate.y * tileSize + (tileSize - crateSize) / 2;

        myGameArea.context.drawImage(
            crateImage,
            drawX,
            drawY,
            crateSize,
            crateSize
        );
    }

    // --- Draw first aids on top of tiles ---
    for (const firstaid of firstaids) {
        const drawX = firstaid.x * tileSize + (tileSize - crateSize) / 2;
        const drawY = firstaid.y * tileSize + (tileSize - crateSize) / 2;

        myGameArea.context.drawImage(
            firstaidImage,
            drawX,
            drawY,
            crateSize,
            crateSize
        );
    }
}

function Smoke(x, y, angle) {
    this.x = x;
    this.y = y;

    this.life = 60 + Math.random() * 40;
    this.size = (2 + Math.random() * 3) * 0.25 * (tileSize/50);

    this.dx = (Math.random() - 0.5) * 0.3;
    this.dy = (Math.random() - 0.5) * 0.3;

    this.alpha = 0.5;

    this.update = function () {

        // --- Do not draw dead/fully transparent particles ---
        if (this.life <= 0 || this.alpha <= 0) return;

        this.x += this.dx;
        this.y += this.dy;

        this.life--;
        this.alpha -= 0.006;
        this.size += 0.03;

        const ctx = myGameArea.context;

        ctx.save();
        ctx.globalAlpha = Math.max(this.alpha, 0); // ensure alpha >= 0

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = "#999";
        ctx.fill();

        ctx.restore();
    };
}

function Bullet(x, y, angle) {
    this.x = x;
    this.y = y;
    this.prevX = x;
    this.prevY = y;

    this.angle = angle;
    this.speed = 10 * (tileSize/80);

    this.vx = Math.sin(angle) * this.speed;
    this.vy = -Math.cos(angle) * this.speed;

    this.distanceTraveled = 0;
    this.maxDistance = tileSize * bulletDistanceFactor[levels[2]-1];

    this.power = bulletPower[levels[3]-1]; // individual bullet power

    this.update = function () {
        // store previous position
        this.prevX = this.x;
        this.prevY = this.y;

        // move bullet
        this.x += this.vx;
        this.y += this.vy;

        this.distanceTraveled += this.speed;

        // --- TILE CHECK ---
        let tileX = Math.floor(this.x / tileSize);
        let tileY = Math.floor(this.y / tileSize);

        if (tileX >= 0 && tileX < hTiles && tileY >= 0 && tileY < vTiles) {

            const tileIndex = tileY * hTiles + tileX;

            // Determine actual tile: overlay takes precedence
            const tile = overlayMap[tileIndex] !== 0 ? overlayMap[tileIndex] : baseMap[tileIndex];

            // --- BOUNCE ON TILE 20 ONLY ---
            if (tile === 20) {
                if (audioContext) {
                    //triggerRockHit(audioContext, sound level, cutoff, highfreq, highlevel, lowfreq, lowlevel, decay)
                    const level = 0.3 + Math.random() * 0.2;
                    const cutoff = 1000 + Math.random() * 500;
                    const decay = 0.05 + Math.random() * 0.05;
                    const highfreq = 3200 + Math.random() * (4800 - 3200);
                    const highlevel = 0.25 + Math.random() * (0.75 - 0.25);
                    const lowfreq = 160 + Math.random() * (240 - 160);
                    const lowlevel = 0.25 + Math.random() * (0.75 - 0.25);
                    triggerRockHit(audioContext, level, cutoff, highfreq, highlevel, lowfreq, lowlevel, decay);
                }

                let bounced = false;
                let prevTileX = Math.floor(this.prevX / tileSize);
                let prevTileY = Math.floor(this.prevY / tileSize);

                // Horizontal bounce
                if (prevTileX !== tileX) {
                    this.vx *= -1;
                    this.x = this.prevX + this.vx;
                    bounced = true;
                }

                // Vertical bounce
                if (prevTileY !== tileY) {
                    this.vy *= -1;
                    this.y = this.prevY + this.vy;
                    bounced = true;
                }

                if (bounced) {
                    const offset = tileSize * 0.2;
                    const dx = this.prevX - this.x;
                    const dy = this.prevY - this.y;
                    const len = Math.sqrt(dx*dx + dy*dy);
                    const xPos = this.x + (dx / len) * offset;
                    const yPos = this.y + (dy / len) * offset;
                    ricochetSparks(xPos, yPos);
                    barrelSmoke(xPos, yPos);
                    this.power /= 2;  // <-- halve bullet power on bounce
                }
            }
        }

        // --- DRAW BULLET ---
        const ctx = myGameArea.context;
        const bulletWidth = 2 * (tileSize/100);
        const bulletHeight = 2 * (tileSize/100);
        ctx.save();
        ctx.fillStyle = "black";
        ctx.fillRect(this.x - bulletWidth/2, this.y - bulletHeight/2, bulletWidth, bulletHeight);
        ctx.restore();

        // --- MAX DISTANCE ---
        if (this.distanceTraveled >= this.maxDistance) {
            barrelSmoke(this.x, this.y);
            const index = bullets.indexOf(this);
            if (index !== -1) bullets.splice(index, 1);
        }
    };
}

function barrelSmoke(x, y) {
    const smokeCount = 5; // tiny puff
    for (let i = 0; i < smokeCount; i++) {
        const s = new Smoke(x, y, 0); // angle is irrelevant for small puff
        s.life = 10 + Math.random() * 10;  // very short-lived
        s.size = (1 + Math.random() * 5) * (tileSize * 0.015); // tiny
        s.dx = (Math.random() - 0.5) * 0.5;
        s.dy = (Math.random() - 0.5) * 0.5;
        s.alpha = 0.6 + Math.random() * 0.4;
        smokeParticles.push(s);
    }
}

function checkBulletCollision() {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        bullet.update();

        // --- Crate collision ---
        for (let c = crates.length - 1; c >= 0; c--) {
            const crate = crates[c];
            const crateX = crate.x * tileSize + tileSize / 2;
            const crateY = crate.y * tileSize + tileSize / 2;
            const size = tileSize * 0.8;

            if (
                bullet.x > crateX - size/2 &&
                bullet.x < crateX + size/2 &&
                bullet.y > crateY - size/2 &&
                bullet.y < crateY + size/2
            ) {

                explosions.push(new Explosion(crateX, crateY));

                if (audioContext) {
                    triggerExplosion(audioContext, 0.4, 800, 100, 1, 1.5);
                    barrelSmoke(bullet.x, bullet.y);
                }

                // remove crate
                crates.splice(c, 1);
                // restart crate cycle
                const now = Date.now();
                nextCrateSpawnTime = now + crateSpawnIntervall + Math.random() * crateSpawnIntervall;
                cratePickupLock = false;

                // remove bullet
                bullets.splice(i, 1);

                break;
            }
        }

        // --- First aid collision ---
        for (let c = firstaids.length - 1; c >= 0; c--) {
            const firstaid = firstaids[c];
            const firstaidX = firstaid.x * tileSize + tileSize / 2;
            const firstaidY = firstaid.y * tileSize + tileSize / 2;
            const size = tileSize * 0.8;

            if (
                bullet.x > firstaidX - size/2 &&
                bullet.x < firstaidX + size/2 &&
                bullet.y > firstaidY - size/2 &&
                bullet.y < firstaidY + size/2
            ) {

                explosions.push(new Explosion(firstaidX, firstaidY));

                if (audioContext) {
                    triggerExplosion(audioContext, 0.4, 800, 100, 1, 1.5);
                    barrelSmoke(firstaid.x, firstaid.y);
                }

                // remove crate
                firstaids.splice(c, 1);
                // restart crate cycle
                const now = Date.now();
                nextFirstaidSpawnTime = now + firstaidSpawnIntervall + Math.random() * firstaidSpawnIntervall;
                firstaidPickupLock = false;

                // remove bullet
                bullets.splice(i, 1);

                break;
            }
        }

        const xTile = Math.floor(bullet.x / tileSize);
        const yTile = Math.floor(bullet.y / tileSize);
        const tileIndex = yTile * hTiles + xTile;

        // --- Out of bounds ---
        if (xTile < 0 || xTile >= hTiles || yTile < 0 || yTile >= vTiles) {
            bullets.splice(i, 1);
            continue;
        }

        const tile = overlayMap[tileIndex] !== 0 ? overlayMap[tileIndex] : baseMap[tileIndex];

        // --- Check destructible tiles ---
        if (tile === 3) {
            if (audioContext) {
                //triggerGroundHit(audioContext, sound level, freq, cutoff, decay)
                const gain = 0.5 + Math.random() * 0.2;
                const freq = 60 + Math.random() * 10;
                const cutoff = 750 + Math.random() * (1200 - 750);
                const decay = 0.3 + Math.random() * 0.1;
                triggerGroundHit(audioContext, gain, freq, cutoff, decay);
            }

            barrelSmoke(bullet.x, bullet.y);

            tileHits[tileIndex] = (tileHits[tileIndex] || 0) + bullet.power;

            if (tileHits[tileIndex] >= 3) {
                explosions.push(new Explosion(bullet.x, bullet.y, function() {
                    overlayMap[tileIndex] = 0;
                    overlayMap[tileIndex] = [15, 16, 17][Math.floor(Math.random() * 3)];
                    gameMap[tileIndex] = overlayMap[tileIndex] !== 0 ? overlayMap[tileIndex] : baseMap[tileIndex];
                    delete tileHits[tileIndex];
                    const tileCenterX = (tileIndex % hTiles) * tileSize + tileSize / 2;
                    const tileCenterY = Math.floor(tileIndex / hTiles) * tileSize + tileSize / 2;
                    longSmoke(tileCenterX, tileCenterY, 25, 150);

                    // --- Trigger pink noise explosion ---
                    if (audioContext) {
                        //riggerExplosion(audioContext, sound level, filterStartFreq, filterEndFreq, filter decay, decay) 
                        const cutOff = Math.floor(400 + Math.random() * (700 - 400 + 1));
                        const cutOffDecay = 1 + Math.random() * (2 - 1);

                        triggerExplosion(audioContext, 0.5, cutOff, 75, cutOffDecay, 2);
                    }

                    fadingTiles.push({
                        xTile: tileIndex % hTiles,
                        yTile: Math.floor(tileIndex / hTiles),
                        currentAlpha: 0,
                        targetTile: 0,
                        startTime: new Date().getTime() + 5000,
                        duration: 2000
                    });
                }));
            }

            bullets.splice(i, 1);
            continue;
        }

        // --- Check collision with the player tank ---
        const dx = bullet.x - userTank.x;
        const dy = bullet.y - userTank.y;
        const dist = Math.sqrt(dx*dx + dy*dy);

        // Simple circular hit detection based on tileSize
        if (dist < tileSize * 0.5) {
            if (audioContext) {
                const level = 0.05 + Math.random() * 0.05;
                const freq1 = Math.floor(400 + Math.random() * (600 - 400 + 1));
                const decay = 0.05 + Math.random() * (0.2 - 0.05);
                const decay2 = 0.05 + Math.random() * (0.15 - 0.05);
                //triggerTankHit(audioContext, soundlevel, freq1, freq2, decay, noise decay)
                triggerTankHit(audioContext, level, freq1, 550, decay, decay2);
            }
            // Apply damage with armor factor
            tankHealth -= bullet.power / 10;

            // Clamp health
            tankHealth = Math.max(tankHealth, 0);

            // Remove bullet
            bullets.splice(i, 1);

            // --- Tank destroyed ---
            if (tankHealth <= 0 && !userTank.destroyed) {
                // --- Trigger pink noise explosion ---
                if (audioContext) {
                    //riggerExplosion(audioContext, sound level, filterStartFreq, filterEndFreq, filter decay, decay) 
                    triggerExplosion(audioContext, 0.5, 1500, 75, 2, 4);
                }
                userTank.destroyed = true; // mark tank as destroyed
                userTank.speed = 0;
                userTank.moveAngle = 0;

                // Big explosion at tank position
                explosions.push(new Explosion(userTank.x, userTank.y, function() {
                    // THIS is the smoke like tile 3
                    longSmoke(userTank.x, userTank.y, 25, 150);

                    hudTargetY = -tileSize;
                    setTimeout(showGameOverButton, 3000);
                }, true));
            } else {
                explosions.push(new Explosion(userTank.x, userTank.y));
            }

            continue; // skip remaining bullet logic
        }

        // --- Stop bullet on hard tiles ---
        if (![1, 2, 15, 16, 17].includes(tile)) {
            barrelSmoke(bullet.x, bullet.y);
            bullets.splice(i, 1);
            continue;
        }

        // --- Remove bullet if traveled max distance ---
        if (bullet.distanceTraveled >= bullet.maxDistance) {
            if (audioContext) {
                //triggerGroundHit(audioContext, sound level, freq, cutoff, decay)
                const gain = 0.4 + Math.random() * 0.2;
                const freq = 85 + Math.random() * 15;
                const cutoff = 450 + Math.random() * (850 - 450);
                const decay = 0.1 + Math.random() * 0.05;
                triggerGroundHit(audioContext, gain, freq, cutoff, decay);
            }
            barrelSmoke(bullet.x, bullet.y);
            bullets.splice(i, 1);
            continue;
        }
    }
}

function ricochetSparks(x, y) {
    const ctx = myGameArea.context;

    for (let i = 0; i < 6; i++) {
        let angle = Math.random() * Math.PI * 2;
        let speed = Math.random() * 2 + 1;

        sparks.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 15
        });
    }
}

function Explosion(x, y, onComplete, isBig = false) {
    this.x = x;
    this.y = y;
    this.particles = [];
    this.life = isBig ? 50 : 20 + Math.random() * 10; // 50 frames (~1s) for big explosion

    const numParticles = isBig ? 150 : 30; // more particles for big explosion

    for (let i = 0; i < numParticles; i++) {
        const speedMultiplier = isBig ? (2 + Math.random() * 3) : (0.5 + Math.random() * 2);
        const size = isBig ? (4 + Math.random() * 8) : (2 + Math.random() * 3);

        const angle = Math.random() * Math.PI * 2;

        this.particles.push({
            x: this.x,
            y: this.y,
            dx: Math.cos(angle) * speedMultiplier,
            dy: Math.sin(angle) * speedMultiplier,
            size: size,
            alpha: 1,
        });
    }

    this.update = function () {
        this.life--;
        const ctx = myGameArea.context;

        for (let p of this.particles) {
            p.x += p.dx;
            p.y += p.dy;
            p.alpha -= isBig ? 0.025 : 0.04;  // fade slower for big
            p.size *= isBig ? 0.95 : 0.9;      // shrink slower for big

            ctx.save();
            ctx.globalAlpha = Math.max(p.alpha, 0);
            ctx.fillStyle = isBig ? "orange" : "#FFA500";
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        if (this.life <= 0 && onComplete) {
            onComplete();
            onComplete = null;
        }
    };

    this.isDead = function () {
        return this.life <= 0;
    };
}

function longSmoke(x, y, count = 20, life = 150) {
    for (let i = 0; i < count; i++) {
        const s = new Smoke(x, y, 0); // angle irrelevant
        s.life = life + Math.random() * 50; // ~3 seconds
        s.size = (5 + Math.random() * 5) * (tileSize * 0.01); // bigger smoke
        s.dx = (Math.random() - 0.5) * 1; // slow drift
        s.dy = (Math.random() - 0.5) * 1;
        s.alpha = 0.7 + Math.random() * 0.3;
        smokeParticles.push(s);
    }
}

function updateFadingTiles() {
    const now = new Date().getTime();
    for (let i = fadingTiles.length - 1; i >= 0; i--) {
        const ft = fadingTiles[i];
        const ctx = myGameArea.context;

        if (now >= ft.startTime) {
            const elapsed = now - ft.startTime;
            ft.currentAlpha = Math.min(elapsed / ft.duration, 1); // 0 → 1

            const x = ft.xTile * tileSize;
            const y = ft.yTile * tileSize;

            // --- Draw underlying base tile first ---
            const baseTile = baseMap[ft.yTile * hTiles + ft.xTile];
            if (tiles[baseTile]) {
                ctx.drawImage(tiles[baseTile], x, y, tileSize, tileSize);
            }

            // --- Draw overlay tile on top with alpha ---
            const overlayTile = overlayMap[ft.yTile * hTiles + ft.xTile];
            if (overlayTile !== 0 && tiles[overlayTile]) {
                ctx.save();
                ctx.globalAlpha = 1 - ft.currentAlpha; // fade out overlay
                ctx.drawImage(tiles[overlayTile], x, y, tileSize, tileSize);
                ctx.restore();
            }

            // --- When fade finished, remove overlay tile ---
            if (ft.currentAlpha >= 1) {
                overlayMap[ft.yTile * hTiles + ft.xTile] = ft.targetTile; // usually 0
                fadingTiles.splice(i, 1);
            }
        }
    }
}

function generateGameMap() {
    const width = hTiles;
    const height = vTiles;
    const mapSize = width * height;

    // --- Base layer: tiles 1 and 2 randomly ---
    let baseMap = new Array(mapSize);
    for (let i = 0; i < mapSize; i++) {
        baseMap[i] = Math.random() < 0.5 ? 1 : 2;
    }

    // --- Overlay layer: tiles 3 and 20, initially 0 (empty) ---
    let overlayMap = new Array(mapSize).fill(0);

    function idx(x, y) {
        return y * width + x;
    }

    function getNeighbors(x, y) {
        const neighbors = [];
        if (x > 0) neighbors.push([x - 1, y]);
        if (x < width - 1) neighbors.push([x + 1, y]);
        if (y > 0) neighbors.push([x, y - 1]);
        if (y < height - 1) neighbors.push([x, y + 1]);
        return neighbors;
    }

    function placeClusters(tileType, totalTiles, minClusters, maxClusters) {
        const numClusters = Math.min(maxClusters, Math.max(minClusters, Math.floor(Math.random() * (maxClusters - minClusters + 1))));
        let remainingTiles = totalTiles;

        for (let c = 0; c < numClusters; c++) {
            if (remainingTiles <= 0) break;

            const clusterSize = Math.min(Math.ceil(totalTiles / numClusters), remainingTiles);
            remainingTiles -= clusterSize;

            // Pick a random start tile
            let attempts = 0;
            let startX, startY;
            do {
                startX = Math.floor(Math.random() * width);
                startY = Math.floor(Math.random() * height);
                attempts++;
            } while (overlayMap[idx(startX, startY)] !== 0 && attempts < 100);

            overlayMap[idx(startX, startY)] = tileType;
            let tilesPlaced = 1;

            // Expand cluster
            let frontier = [[startX, startY]];

            while (tilesPlaced < clusterSize && frontier.length > 0) {
                const [fx, fy] = frontier.splice(Math.floor(Math.random() * frontier.length), 1)[0];
                const neighbors = getNeighbors(fx, fy);
                neighbors.forEach(([nx, ny]) => {
                    if (tilesPlaced >= clusterSize) return;
                    const index = idx(nx, ny);
                    if (overlayMap[index] === 0) { // place only on empty overlay
                        overlayMap[index] = tileType;
                        tilesPlaced++;
                        frontier.push([nx, ny]);
                    }
                });
            }
        }
    }

    // --- Place tile 20 clusters ---
    const numTile20 = 5 + Math.floor(Math.random() * 21); // 5–25 tiles
    placeClusters(20, numTile20, 1, 3);

    // --- Place tile 3 clusters ---
    const numTile3 = 50 + Math.floor(Math.random() * 51); // 50–100 tiles
    placeClusters(3, numTile3, 5, 15);

    return { baseMap, overlayMap };
}


function drawHUD() {
    const ctx = myGameArea.context;
    ctx.save();

    hudClickZones = [];

    hudOffsetY += (hudTargetY - hudOffsetY) * hudSpeed;
    ctx.translate(0, hudOffsetY);

    const padding = tileSize * 0.2;
    const radius = tileSize * 0.12;
    const circleSpacing = tileSize * 0.28;
    const labelCircleGap = tileSize * 0.18;
    const groupGap = tileSize * 0.8;
    const cornerRadius = tileSize * 0.35;

    ctx.font = `${tileSize * 0.3}px Arial`;

    // --- Choose your fill color here ---
    const circleFillColor = "rgba(155,155,155,255)";  // could be any CSS color

    const labels = [
        { label: "Turret speed", values: turretInertia, current: turretInertia[levels[0]-1], upgradeIndex: 0 },
        { label: "Reload speed", values: shotCooldown, current: shotCooldown[levels[1]-1], invert: true, upgradeIndex: 1 },
        { label: "Bullet distance", values: bulletDistanceFactor, current: bulletDistanceFactor[levels[2]-1], upgradeIndex: 2 },
        { label: "Bullet power", values: bulletPower, current: bulletPower[levels[3]-1], upgradeIndex: 3 },
        { label: "Tank speed", values: maxSpeed, current: maxSpeed[levels[4]-1], upgradeIndex: 4 },
        { label: "Tank health", values: [1,0.75,0.5,0.25,0], current: tankHealth, isHealth: true }
    ];

    // --- Draw rounded HUD background ---
    const hudHeight = tileSize * 0.5 + padding * 2;
    const barHeight = hudHeight * 0.75;

    ctx.fillStyle = "rgba(0,0,0,0.35)";
    if (upgradeAvailable) {
        ctx.fillStyle = "rgba(0,0,0,0.75)";
    }
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(canvasWidth, 0);
    ctx.lineTo(canvasWidth, barHeight - cornerRadius);
    ctx.quadraticCurveTo(canvasWidth, barHeight, canvasWidth - cornerRadius, barHeight);
    ctx.lineTo(cornerRadius, barHeight);
    ctx.quadraticCurveTo(0, barHeight, 0, barHeight - cornerRadius);
    ctx.closePath();
    ctx.fill();

    // --- Draw circles and labels ---
    ctx.strokeStyle = "white";  // outline color
    ctx.lineWidth = 2;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    let x = padding;
    const y = padding + radius;

    function drawGroup(label, possibleValues, currentValue, upgradeIndex, isHealth = false, invert = false) { 
        ctx.fillStyle = "rgba(255,255,255,255)";  // text color
        const labelWidth = ctx.measureText(label).width;

        if (upgradeAvailable && upgradeIndex !== undefined) {
            ctx.fillStyle = "rgba(100,255,75,1)";
        }

        ctx.fillText(label, x, y);

        if (upgradeAvailable && upgradeIndex !== undefined) {
            hudClickZones.push({
                index: upgradeIndex,
                x: x,
                y: y - tileSize * 0.2,
                width: labelWidth,
                height: tileSize * 0.4
            });
        }
        let circleX = x + labelWidth + labelCircleGap;

        for (let i = 0; i < possibleValues.length; i++) {
            ctx.beginPath();
            ctx.arc(circleX, y, radius, 0, Math.PI * 2);

            let filled = false;

            if (isHealth) {
                let filledCircles = 0;
                if (currentValue > 0.8) filledCircles = 5;
                else if (currentValue > 0.6) filledCircles = 4;
                else if (currentValue > 0.4) filledCircles = 3;
                else if (currentValue > 0.2) filledCircles = 2;
                else if (currentValue > 0) filledCircles = 1;
                else filledCircles = 0;

                if (i < filledCircles) filled = true;

            } else {
                if (invert) {
                    if (currentValue <= possibleValues[i]) filled = true;
                } else {
                    if (currentValue >= possibleValues[i]) filled = true;
                }
            }

            if (filled) {
                ctx.fillStyle = circleFillColor;
                ctx.fill();
            }

            ctx.strokeStyle = "rgba(255,255,255,255)";
            ctx.stroke();

            circleX += circleSpacing;
        }
        x = circleX + groupGap;
    }

    labels.forEach(l => drawGroup(
        l.label,
        l.values,
        l.current,
        l.upgradeIndex,
        l.isHealth || false,
        l.invert || false
    ));

    ctx.restore();
}


window.addEventListener("load", () => {
    const maps = generateGameMap();
    baseMap = maps.baseMap;
    overlayMap = maps.overlayMap;

    gameMap = new Array(hTiles * vTiles);
    for (let i = 0; i < gameMap.length; i++) {
        gameMap[i] = overlayMap[i] !== 0 ? overlayMap[i] : baseMap[i];
    }

    startGame();

    showStartButton();

    if (firstGameStart) {
        drawControlsHint();
        firstGameStart = false;
    }
});

function showStartButton() {
    const startButton = document.createElement("button");
    startButton.innerText = "START GAME";

    startButton.style.position = "absolute";
    startButton.style.fontSize = "24px";
    startButton.style.padding = "15px 30px";
    startButton.style.cursor = "pointer";
    startButton.style.backgroundColor = "#222";
    startButton.style.color = "#fff";
    startButton.style.border = "2px solid #fff";
    startButton.style.borderRadius = "10px";
    startButton.style.zIndex = "9999";

    // Center over canvas
    const rect = myGameArea.canvas.getBoundingClientRect();
    startButton.style.left = rect.left + rect.width / 2 + "px";
    startButton.style.top = rect.top + rect.height / 2 + "px";
    startButton.style.transform = "translate(-50%, -50%)";

    document.body.appendChild(startButton);

    startButton.addEventListener("click", () => {
        startButton.remove();
        const hint = document.getElementById("controlsHint");
        if (hint) hint.remove();
        
        // --- Initialize audio on user gesture ---
        initAudio();
        gameStarted = true;
        hudVisible = true;
        hudOffsetY = -tileSize;
        hudTargetY = 0;

    });
}

function drawControlsHint() {
    // Prevent adding multiple times
    if (window.controlsHintShown) return;
    window.controlsHintShown = true;

    const hint = document.createElement("div");
    hint.id = "controlsHint";
    hint.innerText = "W - forwards, S - backwards, A - turn left, D - turn right";

    hint.style.position = "absolute";
    hint.style.fontSize = "24px";
    hint.style.color = "#fff";
    hint.style.fontFamily = "Arial, sans-serif";
    hint.style.zIndex = "9999";
    hint.style.pointerEvents = "none"; // clicks pass through

    // Background with semi-transparent black and rounded corners
    hint.style.backgroundColor = "rgba(0, 0, 0, 0.35)";
    hint.style.padding = "10px 20px";
    hint.style.borderRadius = "10px";

    // Position relative to canvas
    const rect = myGameArea.canvas.getBoundingClientRect();
    hint.style.left = rect.left + rect.width / 2 + "px";
    hint.style.top = rect.top + rect.height * 0.75 + "px"; // lower third
    hint.style.transform = "translate(-50%, -50%)";

    document.body.appendChild(hint);
}

function showGameOverButton() {
    gameStarted = false;
    gameOver = true;

    hudTargetY = -tileSize; // slide HUD back up

    const gameOverButton = document.createElement("button");
    gameOverButton.innerText = "GAME OVER";

    gameOverButton.style.position = "absolute";
    gameOverButton.style.fontSize = "24px";
    gameOverButton.style.padding = "15px 30px";
    gameOverButton.style.cursor = "pointer";
    gameOverButton.style.backgroundColor = "#222";
    gameOverButton.style.color = "#fff";
    gameOverButton.style.border = "2px solid #fff";
    gameOverButton.style.borderRadius = "10px";
    gameOverButton.style.zIndex = "9999";

    // Center over canvas
    const rect = myGameArea.canvas.getBoundingClientRect();
    gameOverButton.style.left = rect.left + rect.width / 2 + "px";
    gameOverButton.style.top = rect.top + rect.height / 2 + "px";
    gameOverButton.style.transform = "translate(-50%, -50%)";

    document.body.appendChild(gameOverButton);

    gameOverButton.addEventListener("click", () => {

        gameOverButton.remove();

        resetGame();

    });
}


function resetGame() {
    // --- generate new map ---
    const maps = generateGameMap();
    baseMap = maps.baseMap;
    overlayMap = maps.overlayMap;

    gameMap = new Array(hTiles * vTiles);
    for (let i = 0; i < gameMap.length; i++) {
        gameMap[i] = overlayMap[i] !== 0 ? overlayMap[i] : baseMap[i];
    }

    // --- reset gameplay variables ---
    bullets = [];
    smokeParticles = [];
    explosions = [];
    sparks = [];
    tileHits = {};
    fadingTiles = [];

    tankSpeed = 0;

    levels = [1, 1, 1, 1, 1,];
    tankHealth = 1; // 1 -> 0

    gameStarted = false;
    gameOver = false;

    // --- place tank again ---
    const startTile = getRandomStartTile();
    const startX = startTile.x * tileSize + tileSize / 2;
    const startY = startTile.y * tileSize + tileSize / 2;
    const startAngle = Math.random() * Math.PI * 2;

    userTank = new Tank(startX, startY);
    userTank.angle = startAngle;
    userTank.turretAngle = startAngle;

    nextCrateSpawnTime = 0;
    crates = [];

    // --- show start button again ---
    showStartButton();
}










function initAudio() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext) {
        createEngineOscillator();
    }
}

function createEngineOscillator(frequency = 55, lfoFrequency = 6) {
    if (!audioContext) return;

    const now = audioContext.currentTime;

    // --- 1. Engine parameters ---
    const minGain = 0;
    const maxGain = 1;
    const amplitudeRange = (maxGain - minGain) / 2;

    // --- 2. Main engine oscillator ---
    engineOscillator = audioContext.createOscillator();
    engineOscillator.type = "triangle";
    engineOscillator.frequency.setValueAtTime(frequency, now);

    // --- 3. Gain stage for LFO modulation ---
    const oscillatorGain = audioContext.createGain();

    // --- 4. Master output gain ---
    engineGain = audioContext.createGain();

    // --- 5. LFO oscillator (engine wobble) ---
    engineLFO = audioContext.createOscillator();
    engineLFO.type = "triangle";
    engineLFO.frequency.setValueAtTime(lfoFrequency, now);

    // --- 6. LFO amplitude control ---
    const lfoGain = audioContext.createGain();
    lfoGain.gain.setValueAtTime(amplitudeRange, now);

    // --- 7. Constant offset to shift LFO range ---
    const lfoOffset = audioContext.createConstantSource();
    lfoOffset.offset.setValueAtTime(minGain + amplitudeRange, now);

    // --- 8. Audio routing ---
    engineOscillator.connect(oscillatorGain);

    engineLFO.connect(lfoGain);
    lfoGain.connect(oscillatorGain.gain);   // LFO modulation
    lfoOffset.connect(oscillatorGain.gain); // DC offset

    oscillatorGain.connect(engineGain);
    engineGain.connect(audioContext.destination);

    // --- 9. Engine startup envelope ---
    engineGain.gain.cancelScheduledValues(now);
    engineGain.gain.setValueAtTime(0, now);
    engineGain.gain.exponentialRampToValueAtTime(0.1, now + 0.5);

    // --- 10. Start nodes ---
    engineOscillator.start(now);
    engineLFO.start(now);
    lfoOffset.start(now);
}

function triggerExplosion(audioContext, maxGain = 0.5, filterStartFreq = 8000, filterEndFreq = 250, filterDuration = 2, gainDuration = 3) {
    // --- 1. Create white noise buffer ---
    const bufferSize = 2 * audioContext.sampleRate; // 2 seconds buffer
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }

    // --- 2. Noise source ---
    const noiseSource = audioContext.createBufferSource();
    noiseSource.buffer = buffer;
    noiseSource.loop = true;

    // --- 3. Lowpass filter ---
    const filter = audioContext.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = filterStartFreq;

    // --- 4. Output gain ---
    const gainNode = audioContext.createGain();
    gainNode.gain.value = maxGain;

    // --- 5. Connect nodes ---
    noiseSource.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // --- 6. Schedule filter frequency sweep ---
    const now = audioContext.currentTime;
    filter.frequency.setValueAtTime(filterStartFreq, now);
    filter.frequency.linearRampToValueAtTime(filterEndFreq, now + filterDuration);

    // --- 7. Schedule gain decay ---
    gainNode.gain.setValueAtTime(maxGain, now);
    gainNode.gain.linearRampToValueAtTime(0, now + gainDuration);

    // --- 8. Start and stop noise ---
    noiseSource.start(now);
    noiseSource.stop(now + gainDuration);

    // Optional: clean up after stopping
    noiseSource.onended = () => {
        noiseSource.disconnect();
        filter.disconnect();
        gainNode.disconnect();
    };

    return { noiseSource, filter, gainNode };
}


function triggerGunShot(audioContext, maxGain = 0.5, sineFreq = 75, cutoffFreq = 750, duration = 0.5) {
    const now = audioContext.currentTime;

    // --- 1. White noise buffer ---
    const bufferSize = Math.floor(audioContext.sampleRate * duration);
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }

    // --- 2. Noise source ---
    const noiseSource = audioContext.createBufferSource();
    noiseSource.buffer = buffer;
    noiseSource.loop = false;

    // --- 3. Sine wave source ---
    const sineOsc = audioContext.createOscillator();
    sineOsc.type = "sine";
    sineOsc.frequency.setValueAtTime(sineFreq, now);

    // --- 4. Gain nodes for independent decay ---
    const noiseGain = audioContext.createGain();
    const sineGain = audioContext.createGain();

    // Set initial gain
    noiseGain.gain.setValueAtTime(maxGain * 0.5, now);
    sineGain.gain.setValueAtTime(maxGain * 0.75, now);

    // Apply independent exponential decay
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + duration);          // noise quick decay
    sineGain.gain.exponentialRampToValueAtTime(0.01, now + duration * 2);      // sine lasts twice as long

    // --- 5. Lowpass filter before master output ---
    const lowpass = audioContext.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.setValueAtTime(cutoffFreq, now);

    // --- 6. Master gain (optional volume control) ---
    const masterGain = audioContext.createGain();
    masterGain.gain.setValueAtTime(1, now);

    // --- 7. Connect nodes ---
    noiseSource.connect(noiseGain);
    sineOsc.connect(sineGain);

    noiseGain.connect(lowpass);
    sineGain.connect(lowpass);

    lowpass.connect(masterGain);
    masterGain.connect(audioContext.destination);

    // --- 8. Start sources ---
    noiseSource.start(now);
    sineOsc.start(now);

    // --- 9. Stop sources after their envelope ends ---
    noiseSource.stop(now + duration);
    sineOsc.stop(now + duration * 2);

    // --- 10. Cleanup ---
    sineOsc.onended = () => {
        noiseSource.disconnect();
        sineOsc.disconnect();
        noiseGain.disconnect();
        sineGain.disconnect();
        lowpass.disconnect();
        masterGain.disconnect();
    };

    return { noiseSource, sineOsc, noiseGain, sineGain, lowpass, masterGain };
}

function triggerTankHit(audioContext, maxGain = 0.5, freq1 = 1800, freq2 = 2300, duration = 0.12, noiseDuration = 0.25) {
    const now = audioContext.currentTime;

    // --- 1. Oscillators (metal resonance) ---
    const osc1 = audioContext.createOscillator();
    const osc2 = audioContext.createOscillator();

    osc1.type = "triangle";
    osc2.type = "triangle";

    osc1.frequency.setValueAtTime(freq1, now);
    osc2.frequency.setValueAtTime(freq2, now);

    // slight pitch drop (metal relaxation)
    osc1.frequency.exponentialRampToValueAtTime(freq1 * 0.8, now + duration);
    osc2.frequency.exponentialRampToValueAtTime(freq2 * 0.8, now + duration);

    // --- 2. Ring modulation ---
    const ringGain = audioContext.createGain();
    osc1.connect(ringGain);
    osc2.connect(ringGain.gain);

    const ringOutput = audioContext.createGain();
    ringOutput.gain.setValueAtTime(0.0001, now);
    ringOutput.gain.exponentialRampToValueAtTime(maxGain * 0.8, now + 0.005);
    ringOutput.gain.exponentialRampToValueAtTime(0.01, now + duration * 1.6);

    ringGain.connect(ringOutput);

    // --- 3. Noise burst ---
    const bufferSize = Math.floor(audioContext.sampleRate * noiseDuration);
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }

    const noiseSource = audioContext.createBufferSource();
    noiseSource.buffer = buffer;

    // --- 4. Bandpass filter (metal scrape brightness) ---
    const noiseFilter = audioContext.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.setValueAtTime(3500, now);
    noiseFilter.Q.setValueAtTime(2, now);

    const noiseGain = audioContext.createGain();
    noiseGain.gain.setValueAtTime(maxGain, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + noiseDuration);

    // --- 5. Output ---
    const output = audioContext.createGain();
    output.gain.setValueAtTime(1, now);

    ringOutput.connect(output);
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(output);

    output.connect(audioContext.destination);

    // --- 6. Start ---
    osc1.start(now);
    osc2.start(now);
    noiseSource.start(now);

    // --- 7. Stop ---
    osc1.stop(now + duration * 1.6);
    osc2.stop(now + duration * 1.6);
    noiseSource.stop(now + noiseDuration);

    // --- 8. Cleanup ---
    osc1.onended = () => {
        osc1.disconnect();
        osc2.disconnect();
        noiseSource.disconnect();
        ringGain.disconnect();
        noiseFilter.disconnect();
        noiseGain.disconnect();
        ringOutput.disconnect();
        output.disconnect();
    };
}

function triggerRockHit(audioContext, maxGain = 0.4, cutoff = 1800, highfreq = 3200, highlevel = 0.25, lowfreq = 220, lowlevel = 0.35, duration = 0.06) {
    const now = audioContext.currentTime;

    // --- 1. Noise buffer (stone chips) ---
    const bufferSize = Math.floor(audioContext.sampleRate * duration);
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }

    const noiseSource = audioContext.createBufferSource();
    noiseSource.buffer = buffer;

    // --- 2. Highpass filter (bright rock fragments) ---
    const highpass = audioContext.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.setValueAtTime(cutoff, now);

    // --- 3. Sharp click oscillator ---
    const osc = audioContext.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(highfreq, now);

    const oscGain = audioContext.createGain();
    oscGain.gain.setValueAtTime(highlevel, now);
    oscGain.gain.exponentialRampToValueAtTime(0.01, now + duration);

    // --- 4. Low resonance (rock body) ---
    const lowOsc = audioContext.createOscillator();
    lowOsc.type = "sine";
    lowOsc.frequency.setValueAtTime(lowfreq, now);
    lowOsc.frequency.exponentialRampToValueAtTime(140, now + duration * 1.3);

    const lowGain = audioContext.createGain();
    lowGain.gain.setValueAtTime(lowlevel, now);
    lowGain.gain.exponentialRampToValueAtTime(0.01, now + duration * 1.3);

    // --- 5. Output envelope ---
    const outputGain = audioContext.createGain();
    outputGain.gain.setValueAtTime(maxGain, now);
    outputGain.gain.exponentialRampToValueAtTime(0.01, now + duration);

    // --- 6. Connections ---
    noiseSource.connect(highpass);
    highpass.connect(outputGain);

    osc.connect(oscGain);
    oscGain.connect(outputGain);

    lowOsc.connect(lowGain);
    lowGain.connect(outputGain);

    outputGain.connect(audioContext.destination);

    // --- 7. Start ---
    noiseSource.start(now);
    osc.start(now);
    lowOsc.start(now);

    // --- 8. Stop ---
    noiseSource.stop(now + duration);
    osc.stop(now + duration);
    lowOsc.stop(now + duration * 1.3);

    // --- 9. Cleanup ---
    osc.onended = () => {
        noiseSource.disconnect();
        osc.disconnect();
        lowOsc.disconnect();
        highpass.disconnect();
        oscGain.disconnect();
        lowGain.disconnect();
        outputGain.disconnect();
    };

    return { noiseSource, osc, lowOsc, outputGain };
}


function triggerGroundHit(audioContext, maxGain = 0.5, freq = 90, cutOff = 500, duration = 0.12) {
    const now = audioContext.currentTime;

    // --- 1. Low thud oscillator ---
    const osc = audioContext.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + duration);

    const oscGain = audioContext.createGain();
    oscGain.gain.setValueAtTime(maxGain * 0.8, now);
    oscGain.gain.exponentialRampToValueAtTime(0.01, now + duration);

    // --- 2. Noise burst (dirt spray) ---
    const bufferSize = Math.floor(audioContext.sampleRate * duration);
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }

    const noiseSource = audioContext.createBufferSource();
    noiseSource.buffer = buffer;

    // --- 3. Lowpass filter (soil absorbs highs) ---
    const lowpass = audioContext.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.setValueAtTime(cutOff, now);
    lowpass.Q.setValueAtTime(0.7, now);

    const noiseGain = audioContext.createGain();
    noiseGain.gain.setValueAtTime(maxGain, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + duration * 0.7);

    // --- 4. Output ---
    const output = audioContext.createGain();
    output.gain.setValueAtTime(1, now);

    osc.connect(oscGain);
    oscGain.connect(output);

    noiseSource.connect(lowpass);
    lowpass.connect(noiseGain);
    noiseGain.connect(output);

    output.connect(audioContext.destination);

    // --- 5. Start ---
    osc.start(now);
    noiseSource.start(now);

    // --- 6. Stop ---
    osc.stop(now + duration);
    noiseSource.stop(now + duration);

    // --- 7. Cleanup ---
    osc.onended = () => {
        osc.disconnect();
        noiseSource.disconnect();
        oscGain.disconnect();
        noiseGain.disconnect();
        lowpass.disconnect();
        output.disconnect();
    };

    return { osc, noiseSource, output };
}

function triggerCrateDrop() {
    if (!audioContext) return;

    const now = audioContext.currentTime;
    const duration = 2;

    // --- 1. Create pink noise buffer ---
    const bufferSize = Math.floor(audioContext.sampleRate * duration);
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const data = buffer.getChannelData(0);

    // Pink noise generator (Paul Kellet filter)
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

    for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;

        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;

        const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        b6 = white * 0.115926;

        data[i] = pink * 0.11;
    }

    // --- 2. Noise source ---
    const noiseSource = audioContext.createBufferSource();
    noiseSource.buffer = buffer;

    // --- 3. Chord oscillators ---
    const chordFrequencies = [220, 277.18, 329.63];

    const chordGain = audioContext.createGain();
    chordGain.gain.setValueAtTime(0.1, now);
    chordGain.gain.exponentialRampToValueAtTime(0.001, now + 2);

    const oscillators = chordFrequencies.map(freq => {
        const osc = audioContext.createOscillator();
        osc.type = "square";

        // small pitch drop for impact realism
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.5, now + 2);

        osc.connect(chordGain);
        return osc;
    });

    // --- 4. Bandpass filter (for noise only) ---
    const bandpass = audioContext.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.setValueAtTime(2500, now);
    bandpass.Q.setValueAtTime(1.2, now);

    // --- 5. Output gain ---
    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.linearRampToValueAtTime(0.001, now + duration);

    // --- 6. Frequency sweep ---
    bandpass.frequency.linearRampToValueAtTime(100, now + duration);

    // --- 7. Connect nodes ---
    noiseSource.connect(bandpass);
    bandpass.connect(gain);

    chordGain.connect(gain); // chord bypasses filter

    gain.connect(audioContext.destination);

    // --- 8. Start / Stop ---
    noiseSource.start(now);
    noiseSource.stop(now + duration);

    oscillators.forEach(osc => {
        osc.start(now);
        osc.stop(now + duration);
    });

    // --- 9. Cleanup ---
    noiseSource.onended = () => {
        noiseSource.disconnect();
        chordGain.disconnect();
        bandpass.disconnect();
        gain.disconnect();
        oscillators.forEach(osc => osc.disconnect());
    };
}

function triggerCrateDisappear() {
    if (!audioContext) return;

    const now = audioContext.currentTime;
    const duration = 2;

    // --- 1. Create pink noise buffer ---
    const bufferSize = Math.floor(audioContext.sampleRate * duration);
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const data = buffer.getChannelData(0);

    // Pink noise generator (Paul Kellet filter)
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

    for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;

        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;

        const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        b6 = white * 0.115926;

        data[i] = pink * 0.11;
    }

    // --- 2. Noise source ---
    const noiseSource = audioContext.createBufferSource();
    noiseSource.buffer = buffer;

    // --- 3. Chord oscillators ---
    const chordFrequencies = [220, 277.18, 329.63];

    const chordGain = audioContext.createGain();
    chordGain.gain.setValueAtTime(0.1, now);
    chordGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    const oscillators = chordFrequencies.map(freq => {
        const osc = audioContext.createOscillator();
        osc.type = "square";

        // reverse pitch movement (disappearing / lifting)
        osc.frequency.setValueAtTime(freq * 0.5, now);
        osc.frequency.exponentialRampToValueAtTime(freq, now + duration);

        osc.connect(chordGain);
        return osc;
    });

    // --- 4. Bandpass filter (noise only) ---
    const bandpass = audioContext.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.setValueAtTime(100, now);
    bandpass.Q.setValueAtTime(1.2, now);

    // --- 5. Output gain ---
    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.linearRampToValueAtTime(0.001, now + duration);

    // --- 6. Reverse frequency sweep ---
    bandpass.frequency.linearRampToValueAtTime(2500, now + duration);

    // --- 7. Connect nodes ---
    noiseSource.connect(bandpass);
    bandpass.connect(gain);

    chordGain.connect(gain); // chord bypasses filter

    gain.connect(audioContext.destination);

    // --- 8. Start / Stop ---
    noiseSource.start(now);
    noiseSource.stop(now + duration);

    oscillators.forEach(osc => {
        osc.start(now);
        osc.stop(now + duration);
    });

    // --- 9. Cleanup ---
    noiseSource.onended = () => {
        noiseSource.disconnect();
        chordGain.disconnect();
        bandpass.disconnect();
        gain.disconnect();
        oscillators.forEach(osc => osc.disconnect());
    };
}

function triggerCratePickup() {
    if (!audioContext) return;

    const now = audioContext.currentTime;
    const duration = 0.1; // very short click

    // --- 1. Pink noise buffer ---
    const bufferSize = Math.floor(audioContext.sampleRate * duration);
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const data = buffer.getChannelData(0);

    let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;

    for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;

        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;

        const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        b6 = white * 0.115926;

        data[i] = pink * 0.12;
    }

    // --- 2. Noise source ---
    const noiseSource = audioContext.createBufferSource();
    noiseSource.buffer = buffer;

    // --- 3. Chord oscillators (no pitch sweep) ---
    const chordFrequencies = [220, 277.18, 329.63];

    const chordGain = audioContext.createGain();
    chordGain.gain.setValueAtTime(0.4, now);
    chordGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    const oscillators = chordFrequencies.map(freq => {
        const osc = audioContext.createOscillator();
        osc.type = "square";
        osc.frequency.setValueAtTime(freq, now); // no sweep
        osc.connect(chordGain);
        return osc;
    });

    // --- 4. Brightness filter for noise ---
    const highpass = audioContext.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.setValueAtTime(1200, now);

    // --- 5. Gain envelope ---
    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    // --- 6. Connections ---
    noiseSource.connect(highpass);
    highpass.connect(gain);

    chordGain.connect(gain);

    gain.connect(audioContext.destination);

    // --- 7. Start / stop ---
    noiseSource.start(now);
    noiseSource.stop(now + duration);

    oscillators.forEach(osc => {
        osc.start(now);
        osc.stop(now + duration);
    });

    // --- 8. Cleanup ---
    noiseSource.onended = () => {
        noiseSource.disconnect();
        highpass.disconnect();
        chordGain.disconnect();
        gain.disconnect();
        oscillators.forEach(osc => osc.disconnect());
    };
}

function triggerSelection() {
    if (!audioContext) return;

    const now = audioContext.currentTime;
    const clickDuration = 0.04;
    const gap = 0.05; // delay between ticks

    // --- Function to create one tick ---
    function createTick(startTime) {

        // --- 1. Pink noise buffer ---
        const bufferSize = Math.floor(audioContext.sampleRate * clickDuration);
        const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
        const data = buffer.getChannelData(0);

        let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;

        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;

            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            b3 = 0.86650 * b3 + white * 0.3104856;
            b4 = 0.55000 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.0168980;

            const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
            b6 = white * 0.115926;

            data[i] = pink * 0.15;
        }

        // --- 2. Noise source ---
        const noiseSource = audioContext.createBufferSource();
        noiseSource.buffer = buffer;

        // --- 3. Bright click filter ---
        const highpass = audioContext.createBiquadFilter();
        highpass.type = "highpass";
        highpass.frequency.setValueAtTime(2000, startTime);

        // --- 4. Gain envelope ---
        const gain = audioContext.createGain();
        gain.gain.setValueAtTime(0.4, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + clickDuration);

        // --- 5. Connections ---
        noiseSource.connect(highpass);
        highpass.connect(gain);
        gain.connect(audioContext.destination);

        // --- 6. Start / stop ---
        noiseSource.start(startTime);
        noiseSource.stop(startTime + clickDuration);

        // --- 7. Cleanup ---
        noiseSource.onended = () => {
            noiseSource.disconnect();
            highpass.disconnect();
            gain.disconnect();
        };
    }

    // --- Trigger two ticks ---
    createTick(now);
    createTick(now + gap);
}

function triggerFirstaid( startFreq = 150, endFreq = 2500) {
    if (!audioContext) return;

    const now = audioContext.currentTime;
    const duration = 2;

    // --- 1. Chord oscillators ---
    const chordFrequencies = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5

    const chordGain = audioContext.createGain();
    chordGain.gain.setValueAtTime(0.35, now);
    chordGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    const oscillators = chordFrequencies.map(freq => {
        const osc = audioContext.createOscillator();
        osc.type = "square";
        osc.frequency.setValueAtTime(freq, now);
        osc.connect(chordGain);
        return osc;
    });

    // --- 2. Bandpass filter ---
    const bandpass = audioContext.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.setValueAtTime(startFreq, now);
    bandpass.Q.setValueAtTime(5, now);

    // --- 3. Output gain ---
    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.linearRampToValueAtTime(0.001, now + duration);

    // --- 4. Frequency sweep ---
    bandpass.frequency.linearRampToValueAtTime(endFreq, now + 1);

    // --- 5. Connect nodes ---
    chordGain.connect(bandpass);
    bandpass.connect(gain);
    gain.connect(audioContext.destination);

    // --- 6. Start / Stop ---
    oscillators.forEach(osc => {
        osc.start(now);
        osc.stop(now + duration);
    });

    // --- 7. Cleanup ---
    gain.onended = () => {
        chordGain.disconnect();
        bandpass.disconnect();
        gain.disconnect();
        oscillators.forEach(osc => osc.disconnect());
    };
}

function triggerFirstaidPickup() {
    if (!audioContext) return;

    const now = audioContext.currentTime;
    const frequencies = [261.63, 392.00]; // C4 then G4
    const durations = [0.25, 1.0];         // first tone 0.15s, second tone 1s

    // --- 1. Output gain ---
    const outputGain = audioContext.createGain();
    outputGain.gain.setValueAtTime(0.35, now);

    // --- 1a. Bandpass filter ---
    const bandpass = audioContext.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.setValueAtTime(260, now); // start frequency 260Hz
    bandpass.Q.setValueAtTime(2, now);         // moderate resonance
    bandpass.connect(audioContext.destination);

    // Connect gain → filter → destination
    outputGain.connect(bandpass);

    // --- 1b. Bandpass sweep ---
    bandpass.frequency.linearRampToValueAtTime(2500, now + 2); // sweep to 2500Hz over 2s

    // --- 2. Create oscillators for each tone ---
    let accumulatedTime = 0; // keeps track of start times
    const oscillators = frequencies.map((freq, i) => {
        const osc = audioContext.createOscillator();
        osc.type = "sawtooth";

        const toneDuration = durations[i];
        const startTime = now + accumulatedTime;
        const endTime = startTime + toneDuration;

        // --- 2a. Tone-specific gain for fast fade ---
        const toneGain = audioContext.createGain();
        toneGain.gain.setValueAtTime(0.001, startTime);
        toneGain.gain.exponentialRampToValueAtTime(0.5, startTime + 0.05); // quick fade in
        toneGain.gain.exponentialRampToValueAtTime(0.001, endTime);          // fade out

        // --- 2b. Connect oscillator ---
        osc.frequency.setValueAtTime(freq, startTime);
        osc.connect(toneGain);
        toneGain.connect(outputGain);

        // --- 2c. Start / Stop ---
        osc.start(startTime);
        osc.stop(endTime);

        accumulatedTime += toneDuration; // next tone starts immediately after previous

        return { osc, toneGain };
    });

    // --- 3. Cleanup after all tones ---
    const totalDuration = accumulatedTime;
    setTimeout(() => {
        oscillators.forEach(({ osc, toneGain }) => {
            osc.disconnect();
            toneGain.disconnect();
        });
        outputGain.disconnect();
        bandpass.disconnect();
    }, totalDuration * 1000 + 100); // add 100ms buffer
}





function spawnRandomCrate() {
    let x, y, pos;

    do {
        x = Math.floor(Math.random() * hTiles);
        y = Math.floor(Math.random() * vTiles);
        pos = y * hTiles + x;
    } while (![1,2,15,16,17].includes(gameMap[pos]));

    crates.push({
        x: x,
        y: y,
        spawnTime: Date.now()
    });

    if (audioContext) triggerCrateDrop();
}

function spawnRandomFirstaid() {
    let x, y, pos;

    do {
        x = Math.floor(Math.random() * hTiles);
        y = Math.floor(Math.random() * vTiles);
        pos = y * hTiles + x;
    } while (![1,2,15,16,17].includes(gameMap[pos]));

    firstaids.push({
        x: x,
        y: y,
        spawnTime: Date.now()
    });

    if (audioContext) triggerFirstaid(150, 2500);
}