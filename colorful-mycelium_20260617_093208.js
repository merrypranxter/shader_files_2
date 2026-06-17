function render(ctx, grid, time, repos, input, mouse, canvas, THREE) {
    if (!ctx) return;

    // ✦ CORE STRANGE MECHANISM: Cyber-Mycelial Hexagram Divination Engine
    // Synthesizing:
    // - mycelial_networks: tip growth, anastomosis (fusion), branching
    // - i_ching_fields: 8 trigram directional forces dictating growth
    // - THE-LISTS: "Divine Data Corruption" (bitwise coordinate glitches)
    // - retrofuturism: UI target nodes at fusion points
    // - shiny & color_fields: "Neon Acid" cosine palettes, "Kintsugi" fusion shine

    if (!canvas.__feralMycelium) {
        canvas.__feralMycelium = {
            hyphae: [],
            nodes: [],
            spores: [],
            lastSpawn: 0
        };
        
        // Seed the initial petri dish
        for (var i = 0; i < 16; i++) {
            spawnHypha(grid.width / 2, grid.height / 2, (i / 16) * Math.PI * 2, 0);
        }
    }

    var state = canvas.__feralMycelium;

    // ✦ 1. MATTE HOST / RESIDUE FADE (slime_molds: "mucus-slick" fading to "powder-dry")
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(10, 8, 15, 0.06)';
    ctx.fillRect(0, 0, grid.width, grid.height);

    // ✦ 2. COSINE PALETTE GENERATOR (color_fields: "Neon Acid" + "Toxic Growth")
    // color(t) = a + b * cos(2π(c*t + d))
    function getPalette(t, alpha) {
        var r = 0.5 + 0.5 * Math.cos(6.28318 * (2.0 * t + 0.5));
        var g = 0.5 + 0.5 * Math.cos(6.28318 * (1.0 * t + 0.2));
        var b = 0.33 + 0.5 * Math.cos(6.28318 * (1.0 * t + 0.25));
        return 'rgba(' + Math.floor(r*255) + ',' + Math.floor(g*255) + ',' + Math.floor(b*255) + ',' + alpha + ')';
    }

    function spawnHypha(x, y, angle, gen) {
        state.hyphae.push({
            x: x, y: y, px: x, py: y,
            angle: angle,
            life: 150 + Math.random() * 200,
            gen: gen,
            // Assign one of the 8 I Ching Trigrams (0:Earth, 1:Thunder, 2:Water, 3:Lake, 4:Mountain, 5:Fire, 6:Wind, 7:Heaven)
            trigram: Math.floor(Math.random() * 8)
        });
    }

    // Interactive Infection (parasitic override)
    if (mouse.isPressed && time - state.lastSpawn > 0.05) {
        for(var m=0; m<3; m++) {
            spawnHypha(mouse.x, mouse.y, Math.random() * Math.PI * 2, 0);
        }
        state.lastSpawn = time;
    }

    // ✦ 3. HYPHAL GROWTH & TRIGRAM FORCES
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';

    for (var i = state.hyphae.length - 1; i >= 0; i--) {
        var h = state.hyphae[i];
        h.px = h.x;
        h.py = h.y;
        
        var speed = 1.5 + (8 - h.gen) * 0.2;
        var forceX = 0;
        var forceY = 0;

        // Trigram Elemental Forces (i_ching_fields)
        switch(h.trigram) {
            case 0: forceY = 1.0; break; // Earth: downward gravity
            case 1: forceX = Math.cos(time*4); forceY = Math.sin(time*4); break; // Thunder: radial pulse
            case 2: forceY = 0.8; forceX = Math.sin(h.y * 0.05); break; // Water: downward with lateral diffusion
            case 3: forceX = 1.0; forceY = Math.sin(h.x * 0.05) * 0.2; break; // Lake: horizontal reflection
            case 4: speed *= 0.3; break; // Mountain: keeping still / slow
            case 5: forceY = -1.0; forceX = Math.sin(time*8 + h.y*0.1)*0.5; break; // Fire: rising shimmer
            case 6: forceX = 0.7; forceY = 0.7; break; // Wind: diagonal permeating
            case 7: // Heaven: outward from center
                var cx = h.x - grid.width/2;
                var cy = h.y - grid.height/2;
                var dist = Math.sqrt(cx*cx + cy*cy) + 0.001;
                forceX = cx/dist; forceY = cy/dist;
                break;
        }

        // Steer towards force
        if (h.trigram !== 4) {
            var targetAngle = Math.atan2(forceY, forceX);
            var diff = targetAngle - h.angle;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            h.angle += diff * 0.08;
        }

        // Organic wander (mycelial tip hesitation)
        h.angle += (Math.random() - 0.5) * 0.5;

        // Move
        h.x += Math.cos(h.angle) * speed;
        h.y += Math.sin(h.angle) * speed;

        // ✦ DIVINE DATA CORRUPTION (THE-LISTS: Math Failure / Glitch Prophet)
        if (Math.random() < 0.003) {
            h.x ^= (Math.floor(Math.random() * 32)); // Bitwise coordinate shred
            h.y ^= (Math.floor(Math.random() * 32));
        }

        // Draw vein
        ctx.beginPath();
        ctx.moveTo(h.px, h.py);
        ctx.lineTo(h.x, h.y);
        ctx.lineWidth = Math.max(0.5, 3.0 - h.gen * 0.3);
        ctx.strokeStyle = getPalette(h.gen * 0.15 + time * 0.1, 0.8);
        ctx.stroke();

        // Branching (Fibonacci/Prime gap inspired intervals)
        if (h.life > 40 && h.gen < 8 && Math.random() < 0.015) {
            spawnHypha(h.x, h.y, h.angle + (Math.random() > 0.5 ? 0.7 : -0.7), h.gen + 1);
            h.life *= 0.8; // Cost of branching
        }

        // Anastomosis (Fusion Check)
        for (var j = i + 1; j < state.hyphae.length; j++) {
            var oh = state.hyphae[j];
            var d = Math.hypot(h.x - oh.x, h.y - oh.y);
            if (d < 12 && h.gen !== oh.gen && Math.random() < 0.15) {
                // Fuse into a structural node
                state.nodes.push({
                    x: (h.x + oh.x) / 2,
                    y: (h.y + oh.y) / 2,
                    life: 1.0,
                    type: Math.random() > 0.6 ? 'retro_ui' : 'kintsugi_spark'
                });
                h.angle = Math.atan2(oh.y - h.y, oh.x - h.x); // Snap to target
                h.life -= 20;
                break;
            }
        }

        h.life--;
        // Wrap around screen (toroidal topology)
        if (h.x < 0) h.x += grid.width;
        if (h.x > grid.width) h.x -= grid.width;
        if (h.y < 0) h.y += grid.height;
        if (h.y > grid.height) h.y -= grid.height;

        if (h.life <= 0) {
            state.hyphae.splice(i, 1);
        }
    }

    // ✦ 4. SHINY STRUCTURES / RETROFUTURISTIC NODES
    // Drawing the anastomosis fusion events
    for (var n = state.nodes.length - 1; n >= 0; n--) {
        var node = state.nodes[n];
        
        ctx.save();
        ctx.translate(node.x, node.y);
        ctx.rotate(time * 2.0 + node.life * 5.0);
        
        var pulse = Math.sin(node.life * Math.PI * 10) * 0.5 + 0.5;
        ctx.strokeStyle = getPalette(time * 0.2 + node.x * 0.01, node.life);
        ctx.lineWidth = 1.0 + pulse * 2.0;

        if (node.type === 'retro_ui') {
            // Cassette Futurism / Y2K target reticle
            ctx.strokeRect(-6, -6, 12, 12);
            ctx.beginPath();
            ctx.arc(0, 0, 4 + pulse * 4, 0, Math.PI * 2);
            ctx.stroke();
            
            // Corner ticks
            ctx.beginPath();
            ctx.moveTo(-10, -10); ctx.lineTo(-7, -10);
            ctx.moveTo(10, 10); ctx.lineTo(7, 10);
            ctx.stroke();
        } else {
            // Kintsugi Crack Seam Sparkle (shiny)
            ctx.beginPath();
            var spread = 15 * node.life;
            ctx.moveTo(-spread, 0); ctx.lineTo(spread, 0);
            ctx.moveTo(0, -spread); ctx.lineTo(0, spread);
            ctx.moveTo(-spread*0.5, -spread*0.5); ctx.lineTo(spread*0.5, spread*0.5);
            ctx.stroke();
            
            // Core jewel
            ctx.fillStyle = '#FFFFFF';
            ctx.globalAlpha = node.life;
            ctx.beginPath();
            ctx.arc(0, 0, 2, 0, Math.PI*2);
            ctx.fill();
        }
        
        ctx.restore();

        node.life -= 0.015;
        if (node.life <= 0) {
            state.nodes.splice(n, 1);
        }
    }

    // Population control - if colony dies out, re-seed
    if (state.hyphae.length < 5) {
        spawnHypha(Math.random() * grid.width, Math.random() * grid.height, Math.random() * Math.PI * 2, 0);
    }
    // Limit overgrowth
    if (state.hyphae.length > 400) {
        state.hyphae.splice(0, 10);
    }
}