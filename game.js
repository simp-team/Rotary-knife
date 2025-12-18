// Game Configuration
const CONFIG = {
    TIERS: [
        { name: "Yellow", color: "#FFD700", radius: 5 },
        { name: "Blue", color: "#00BFFF", radius: 6 },
        { name: "Dark Blue", color: "#00008B", radius: 7 },
        { name: "Purple", color: "#800080", radius: 8 },
        { name: "Pink", color: "#FF69B4", radius: 9 },
        { name: "Dark Red", color: "#8B0000", radius: 10 }
    ],
    MAX_KNIVES: 100,
    MAP_WIDTH: 3000,
    MAP_HEIGHT: 3000,
    PLAYER_SPEED: 4,
    BOT_SPEED: 3,
    ROTATION_SPEED: 0.05,
    KNIFE_ORBIT_RADIUS_BASE: 40,
    KNIFE_ORBIT_RADIUS_PER_KNIFE: 1.5,
    PICKUP_SPAWN_RATE: 5, // frames
    MAX_PICKUPS: 300,
    BOT_COUNT: 15
};

// Utility Functions
function randomRange(min, max) {
    return Math.random() * (max - min) + min;
}

function getDistance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}

// Game State
class Game {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());

        this.entities = [];
        this.pickups = [];
        this.player = null;
        this.gameOver = false;
        this.isRunning = false;
        this.mode = 'multi'; // 'single' or 'multi'

        this.ui = {
            mainMenu: document.getElementById('main-menu'),
            uiLayer: document.getElementById('ui-layer'),
            tier: document.getElementById('tier-display'),
            count: document.getElementById('knife-count'),
            upgradeBtn: document.getElementById('upgrade-btn'),
            msg: document.getElementById('message-area'),
            btnSingle: document.getElementById('btn-single'),
            btnMulti: document.getElementById('btn-multi')
        };

        this.ui.upgradeBtn.addEventListener('click', () => {
            if (this.player && this.player.canUpgrade()) {
                this.player.upgrade();
                this.ui.upgradeBtn.classList.add('hidden');
            }
        });

        // Menu Listeners
        this.ui.btnSingle.addEventListener('click', () => this.startGame('single'));
        this.ui.btnMulti.addEventListener('click', () => this.startGame('multi'));

        // Mouse Input
        this.mouse = { x: 0, y: 0 };
        window.addEventListener('mousemove', (e) => {
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
        });

        // Start Loop but wait for start
        this.loop();
    }

    startGame(mode) {
        this.mode = mode;
        this.ui.mainMenu.classList.add('hidden');
        this.ui.uiLayer.classList.remove('hidden');
        this.isRunning = true;
        this.init();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    init() {
        this.entities = [];
        this.pickups = [];
        this.gameOver = false;
        this.ui.msg.innerText = "";
        
        // Create Player
        this.player = new Player(CONFIG.MAP_WIDTH / 2, CONFIG.MAP_HEIGHT / 2, this);
        this.entities.push(this.player);

        // Configure Bots based on Mode
        let botCount = CONFIG.BOT_COUNT;
        if (this.mode === 'single') {
            botCount = 0; // Sandbox / Solo
            // Or maybe a few weak ones? Let's make it 1 weak bot for practice or 0 for pure sandbox.
            // User asked for "Single Player or Multiplayer Battle".
            // Let's make Single Player = 3 weak bots.
            botCount = 3; 
        }

        // Create Bots
        for (let i = 0; i < botCount; i++) {
            this.spawnBot();
        }

        // Create Initial Pickups
        for (let i = 0; i < 100; i++) {
            this.spawnPickup();
        }
    }

    spawnBot() {
        const x = randomRange(100, CONFIG.MAP_WIDTH - 100);
        const y = randomRange(100, CONFIG.MAP_HEIGHT - 100);
        // Ensure some bots never upgrade (Tier 0 lock)
        const canUpgrade = Math.random() > 0.3; 
        this.entities.push(new Bot(x, y, this, canUpgrade));
    }

    spawnPickup() {
        if (this.pickups.length >= CONFIG.MAX_PICKUPS) return;
        const x = randomRange(50, CONFIG.MAP_WIDTH - 50);
        const y = randomRange(50, CONFIG.MAP_HEIGHT - 50);
        this.pickups.push(new Pickup(x, y));
    }

    update() {
        if (!this.isRunning) return;
        if (this.gameOver) return;

        // Spawning logic
        if (Math.random() < 0.1) this.spawnPickup();
        
        // Respawn bots in Multi mode
        if (this.mode === 'multi') {
            if (this.entities.length < CONFIG.BOT_COUNT + 1) {
                if (Math.random() < 0.05) this.spawnBot();
            }
        } else if (this.mode === 'single') {
             // In single player, maybe don't respawn or respawn slowly?
             if (this.entities.length < 4) { // Keep 3 bots
                 if (Math.random() < 0.01) this.spawnBot();
             }
        }

        // Update Entities
        this.entities.forEach(e => e.update());

        // Collision: Entity vs Pickup
        this.entities.forEach(entity => {
            for (let i = this.pickups.length - 1; i >= 0; i--) {
                const p = this.pickups[i];
                // Check if pickup is within pickup radius (body + knives)
                const dist = getDistance(entity, p);
                const pickupRadius = entity.getOrbitRadius() + 30;
                
                if (dist < pickupRadius) {
                    if (entity.addKnife()) {
                        this.pickups.splice(i, 1);
                    }
                }
            }
        });

        // Collision: Entity vs Entity (Combat)
        for (let i = 0; i < this.entities.length; i++) {
            for (let j = i + 1; j < this.entities.length; j++) {
                this.resolveCombat(this.entities[i], this.entities[j]);
            }
        }

        // Remove dead entities
        this.entities = this.entities.filter(e => !e.dead);
        if (this.player.dead) {
            this.handleGameOver("You Died!");
        }

        // Update UI
        if (!this.player.dead) {
            const tierData = CONFIG.TIERS[this.player.tier];
            this.ui.tier.innerText = tierData.name;
            this.ui.tier.style.color = tierData.color;
            this.ui.count.innerText = this.player.knives.length;
            
            if (this.player.canUpgrade()) {
                this.ui.upgradeBtn.classList.remove('hidden');
            } else {
                this.ui.upgradeBtn.classList.add('hidden');
            }
        }
    }

    resolveCombat(a, b) {
        if (a.dead || b.dead) return;

        const dist = getDistance(a, b);
        const orbitA = a.getOrbitRadius();
        const orbitB = b.getOrbitRadius();
        const combinedOrbit = orbitA + orbitB;

        // Optimization check
        if (dist > combinedOrbit + 50) return;

        // --- NEW COLLISION LOGIC ---
        // 1. Check if A's knife wall blocks B's body
        if (a.knives.length > 5 && dist < orbitA + b.radius + 10) {
            // A has a shield.
            // Check if B is hitting the shield
            if (dist > a.radius + b.radius) {
                // B is touching the shield
                this.handleShieldHit(a, b);
            }
        }

        // 2. Check if B's knife wall blocks A's body
        if (b.knives.length > 5 && dist < orbitB + a.radius + 10) {
            if (dist > b.radius + a.radius) {
                this.handleShieldHit(b, a);
            }
        }

        // 3. Knife vs Knife Interaction
        if (dist < orbitA + orbitB) {
            if (a.tier === b.tier) {
                if (Math.random() < 0.2) {
                     // Check if actually touching (simplified)
                     // If distance implies overlap of rings
                     a.removeKnife();
                     b.removeKnife();
                     
                     // Bounce if last knife
                     if (a.knives.length <= 1 && b.knives.length <= 1) {
                         this.bounce(a, b);
                     }
                }
            } else if (a.tier > b.tier) {
                // High tier destroys low tier knives
                if (Math.random() < 0.3) b.removeKnife();
            } else {
                if (Math.random() < 0.3) a.removeKnife();
            }
        }

        // 4. Body Hits (Fatal)
        // Only possible if shield is penetrated or non-existent
        // We assume if you got this close and weren't repelled by handleShieldHit, you might hit.
        
        // A hits B's body
        if (dist < orbitA + b.radius && a.knives.length > 0) {
             // If B has no knives, or B's knives are smaller than dist?
             // Actually, handleShieldHit should have pushed B away if A had knives.
             // If B is still here, it means B somehow got inside?
             // Or A's knives are hitting B.
             if (b.knives.length < 5) { // B is vulnerable
                 b.die();
             }
        }

        // B hits A's body
        if (dist < orbitB + a.radius && b.knives.length > 0) {
            if (a.knives.length < 5) { // A is vulnerable
                a.die();
            }
        }
    }

    handleShieldHit(defender, attacker) {
        // Attacker hit Defender's Shield
        // Attacker gets repelled
        const angle = Math.atan2(attacker.y - defender.y, attacker.x - defender.x);
        const force = 5;
        attacker.vx += Math.cos(angle) * force;
        attacker.vy += Math.sin(angle) * force;

        // Attacker loses knives?
        if (defender.tier >= attacker.tier) {
            attacker.removeKnife();
        }
        
        // Defender might lose knife if same tier
        if (defender.tier === attacker.tier) {
            if (Math.random() < 0.5) defender.removeKnife();
        }
    }

    bounce(a, b) {
        // Reverse directions or push back
        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        const force = 10;
        
        a.vx -= Math.cos(angle) * force;
        a.vy -= Math.sin(angle) * force;
        b.vx += Math.cos(angle) * force;
        b.vy += Math.sin(angle) * force;
        
        // Also reverse rotation as per prompt "bounce... and reverse rotation"
        a.rotationSpeed *= -1;
        b.rotationSpeed *= -1;
    }

    handleGameOver(msg) {
        this.gameOver = true;
        this.ui.msg.innerText = msg + "\nReturning to Menu in 3 seconds...";
        setTimeout(() => {
            this.isRunning = false;
            this.ui.mainMenu.classList.remove('hidden');
            this.ui.uiLayer.classList.add('hidden');
            // Clear canvas
            this.ctx.fillStyle = '#222';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }, 3000);
    }

    handleWin() {
        this.gameOver = true;
        this.ui.msg.innerText = "VICTORY!\nReturning to Menu in 10 seconds...";
        setTimeout(() => {
            this.isRunning = false;
            this.ui.mainMenu.classList.remove('hidden');
            this.ui.uiLayer.classList.add('hidden');
        }, 10000);
    }

    draw() {
        if (!this.isRunning) {
            // Draw background for menu
            this.ctx.fillStyle = '#111';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            return;
        }

        // Clear background
        this.ctx.fillStyle = '#222';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Camera Logic (Follow Player)
        this.ctx.save();
        
        let camX = 0, camY = 0;
        if (this.player) {
            camX = this.canvas.width / 2 - this.player.x;
            camY = this.canvas.height / 2 - this.player.y;
        }
        this.ctx.translate(camX, camY);

        // Draw Map Boundaries
        this.ctx.strokeStyle = '#444';
        this.ctx.lineWidth = 10;
        this.ctx.strokeRect(0, 0, CONFIG.MAP_WIDTH, CONFIG.MAP_HEIGHT);

        // Draw Grid
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        for (let x = 0; x <= CONFIG.MAP_WIDTH; x += 100) {
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, CONFIG.MAP_HEIGHT);
        }
        for (let y = 0; y <= CONFIG.MAP_HEIGHT; y += 100) {
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(CONFIG.MAP_WIDTH, y);
        }
        this.ctx.stroke();

        // Draw Pickups
        this.pickups.forEach(p => p.draw(this.ctx));

        // Draw Entities
        this.entities.forEach(e => e.draw(this.ctx));

        this.ctx.restore();
    }

    loop() {
        this.update();
        this.draw();
        requestAnimationFrame(() => this.loop());
    }
}

// Pickup Class
class Pickup {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.size = 10;
        this.oscillation = Math.random() * Math.PI * 2;
    }

    draw(ctx) {
        this.oscillation += 0.1;
        const scale = 1 + Math.sin(this.oscillation) * 0.2;
        
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(scale, scale);
        
        // Draw a simple knife shape
        ctx.fillStyle = '#CCC';
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.lineTo(5, 5);
        ctx.lineTo(0, 15);
        ctx.lineTo(-5, 5);
        ctx.closePath();
        ctx.fill();
        
        ctx.restore();
    }
}

// Entity Class (Player & Bots)
class Entity {
    constructor(x, y, game) {
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.game = game;
        this.radius = 20;
        this.knives = [];
        this.tier = 0;
        this.rotationAngle = 0;
        this.rotationSpeed = CONFIG.ROTATION_SPEED;
        this.dead = false;
        
        // Initialize with 1 knife
        this.addKnife();
    }

    getOrbitRadius() {
        return CONFIG.KNIFE_ORBIT_RADIUS_BASE + (this.knives.length * CONFIG.KNIFE_ORBIT_RADIUS_PER_KNIFE);
    }

    addKnife() {
        if (this.knives.length >= CONFIG.MAX_KNIVES) return false;
        this.knives.push(new Knife(this.tier));
        return true;
    }

    removeKnife() {
        if (this.knives.length > 0) {
            this.knives.pop();
            return true;
        }
        return false;
    }

    canUpgrade() {
        return this.knives.length >= CONFIG.MAX_KNIVES && this.tier < CONFIG.TIERS.length - 1;
    }

    upgrade() {
        if (this.canUpgrade()) {
            this.tier++;
            this.knives = []; // Reset knives
            this.addKnife(); // Start with 1
            
            // Win check
            if (this.tier === CONFIG.TIERS.length - 1 && this.knives.length >= CONFIG.MAX_KNIVES) {
                // This condition handles "When reaching dark red 100 count"
                // But we just reset to 1. 
                // Wait, prompt says: "Continue collecting... to Dark Red 100 count -> Win"
            }
        }
    }

    checkWinCondition() {
        if (this.tier === CONFIG.TIERS.length - 1 && this.knives.length >= CONFIG.MAX_KNIVES) {
            if (this instanceof Player) {
                this.game.handleWin();
            }
        }
    }

    update() {
        // Apply Velocity
        this.x += this.vx;
        this.y += this.vy;

        // Friction
        this.vx *= 0.9;
        this.vy *= 0.9;

        // Wall Collision
        let hitWall = false;
        if (this.x < 0) { this.x = 0; hitWall = true; this.vx *= -1; }
        if (this.x > CONFIG.MAP_WIDTH) { this.x = CONFIG.MAP_WIDTH; hitWall = true; this.vx *= -1; }
        if (this.y < 0) { this.y = 0; hitWall = true; this.vy *= -1; }
        if (this.y > CONFIG.MAP_HEIGHT) { this.y = CONFIG.MAP_HEIGHT; hitWall = true; this.vy *= -1; }

        if (hitWall) {
            this.rotationSpeed *= -1; // Reverse rotation on wall hit
        }

        // Rotate Knives
        this.rotationAngle += this.rotationSpeed;

        // Check Win
        this.checkWinCondition();
    }

    die() {
        this.dead = true;
        // Drop knives? Or just disappear. Prompt implies "die and restart".
        // Maybe drop some knives for others to pick up.
        const dropCount = Math.min(this.knives.length, 10);
        for(let i=0; i<dropCount; i++) {
            const p = new Pickup(this.x + randomRange(-50,50), this.y + randomRange(-50,50));
            this.game.pickups.push(p);
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);

        // Draw Body
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = CONFIG.TIERS[this.tier].color;
        ctx.fill();
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw Knives
        const orbitRadius = this.getOrbitRadius();
        const count = this.knives.length;
        const angleStep = (Math.PI * 2) / (count || 1);

        for (let i = 0; i < count; i++) {
            const angle = this.rotationAngle + (i * angleStep);
            const kx = Math.cos(angle) * orbitRadius;
            const ky = Math.sin(angle) * orbitRadius;
            
            ctx.save();
            ctx.translate(kx, ky);
            ctx.rotate(angle + Math.PI/2); // Point outward
            
            // Draw Knife
            ctx.fillStyle = CONFIG.TIERS[this.tier].color;
            ctx.beginPath();
            ctx.moveTo(0, -15); // Tip
            ctx.lineTo(5, 10);
            ctx.lineTo(0, 5);
            ctx.lineTo(-5, 10);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#FFF';
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.restore();
        }

        ctx.restore();
    }
}

// Player Class
class Player extends Entity {
    constructor(x, y, game) {
        super(x, y, game);
    }

    update() {
        super.update();

        // Move towards mouse relative to center of screen
        const dx = this.game.mouse.x - window.innerWidth / 2;
        const dy = this.game.mouse.y - window.innerHeight / 2;
        
        const angle = Math.atan2(dy, dx);
        
        // Simple movement: Always move? Or only if far enough?
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist > 10) {
            this.vx += Math.cos(angle) * 0.5;
            this.vy += Math.sin(angle) * 0.5;
        }

        // Cap speed
        const speed = Math.sqrt(this.vx*this.vx + this.vy*this.vy);
        if (speed > CONFIG.PLAYER_SPEED) {
            this.vx = (this.vx / speed) * CONFIG.PLAYER_SPEED;
            this.vy = (this.vy / speed) * CONFIG.PLAYER_SPEED;
        }
    }
}

// Bot Class
class Bot extends Entity {
    constructor(x, y, game, canUpgrade) {
        super(x, y, game);
        this.canUpgradeFlag = canUpgrade;
        this.target = null;
        this.state = 'wander'; // wander, chase, flee, gather
        this.changeStateTimer = 0;
    }

    canUpgrade() {
        return this.canUpgradeFlag && super.canUpgrade();
    }

    update() {
        // AI Logic
        this.changeStateTimer--;
        if (this.changeStateTimer <= 0) {
            this.decideState();
            this.changeStateTimer = randomRange(30, 100);
        }

        if (this.canUpgrade()) {
            this.upgrade(); // Auto upgrade
        }

        this.executeState();
        super.update();
    }

    decideState() {
        // Simple state machine
        // 1. If knife count < 20, prioritize gathering
        // 2. If near stronger enemy, flee
        // 3. If near weaker enemy, chase
        
        let nearestEnemy = null;
        let nearestDist = Infinity;

        // Find nearest enemy
        this.game.entities.forEach(e => {
            if (e === this) return;
            const d = getDistance(this, e);
            if (d < nearestDist) {
                nearestDist = d;
                nearestEnemy = e;
            }
        });

        // Danger check
        if (nearestEnemy && nearestDist < 400) {
            if (this.isWeakerThan(nearestEnemy)) {
                this.state = 'flee';
                this.target = nearestEnemy;
                return;
            } else if (this.knives.length > 10) {
                this.state = 'chase';
                this.target = nearestEnemy;
                return;
            }
        }

        // Gather check
        if (this.knives.length < CONFIG.MAX_KNIVES) {
            this.state = 'gather';
            // Find nearest pickup
            let nearestPickup = null;
            let minDist = Infinity;
            
            // Optimization: check random subset if too many pickups
            const checkLimit = 20;
            let checked = 0;
            
            for (let p of this.game.pickups) {
                const d = getDistance(this, p);
                if (d < minDist) {
                    minDist = d;
                    nearestPickup = p;
                }
                checked++;
                if (checked > checkLimit && nearestPickup) break;
            }
            this.target = nearestPickup;
        } else {
            this.state = 'wander';
            this.target = { 
                x: randomRange(0, CONFIG.MAP_WIDTH), 
                y: randomRange(0, CONFIG.MAP_HEIGHT) 
            };
        }
    }

    isWeakerThan(other) {
        if (this.tier < other.tier) return true;
        if (this.tier > other.tier) return false;
        return this.knives.length < other.knives.length;
    }

    executeState() {
        let tx = this.x;
        let ty = this.y;

        if (this.state === 'wander' || this.state === 'gather' || this.state === 'chase') {
            if (this.target) {
                tx = this.target.x;
                ty = this.target.y;
            }
        } else if (this.state === 'flee') {
            if (this.target) {
                // Run away from target
                const angle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
                tx = this.x - Math.cos(angle) * 100;
                ty = this.y - Math.sin(angle) * 100;
            }
        }

        const angle = Math.atan2(ty - this.y, tx - this.x);
        this.vx += Math.cos(angle) * 0.2;
        this.vy += Math.sin(angle) * 0.2;

        const speed = Math.sqrt(this.vx*this.vx + this.vy*this.vy);
        if (speed > CONFIG.BOT_SPEED) {
            this.vx = (this.vx / speed) * CONFIG.BOT_SPEED;
            this.vy = (this.vy / speed) * CONFIG.BOT_SPEED;
        }
    }
}

// Knife Class (Visual Only really, logic handled in Entity)
class Knife {
    constructor(tier) {
        this.tier = tier;
    }
}

// Start Game
window.onload = () => {
    new Game();
};