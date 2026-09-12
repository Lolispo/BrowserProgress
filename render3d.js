// Author Petter Andersson
import * as THREE from "./lib/three.module.min.js";

// ===========================================================================
// Render3D — the same village, in three dimensions.
//
// This file draws the world; it never changes it. Everything here is a reading
// of the identical `scene` object the 2D renderer gets (see render2d.js), so
// the two views are always showing the same game — switch with ?render=3d.
//
// The mapping is the whole trick: the world is a flat 1150x460 plane where y
// runs "down" the map, so world (x, y) becomes three.js (x, 0, y) and the third
// axis — the one the 2D view never had — is height. Nothing in the simulation
// knows that height exists; buildings get their mass from a table down here.
//
// Meshes are reconciled against the world each frame rather than pushed in by
// the game: walk the entity arrays, build what is new, drop what is gone. That
// means a load, a Reset or a mid-game renderer switch all "just work" without
// the world having to announce anything.
// ===========================================================================

var GROUND_COLORS = {
	home:      "#4a9b3c",
	hills:     "#c9b37e",
	mountains: "#9aa0a6",
	cavern:    "#4a3b63",
};
var ROAD_COLOR = "#9c7f52";

// Sky gradient. The horizon colour doubles as the fog colour.
var HORIZON = "#c2d1dc";
var ZENITH = "#39699f";

// Materials are shared by colour across the whole village: a hundred meshes that
// are all "#8a6239 lambert" should be one material, not a hundred.
var MATS = {};
function mat(hex, opts){
	var key = hex + (opts ? JSON.stringify(opts) : "");
	if(!MATS[key]){
		MATS[key] = new THREE.MeshLambertMaterial(Object.assign({ color: hex }, opts || {}));
	}
	return MATS[key];
}

// --- a small kit of parts every building is assembled from ------------------

function box(w, h, d, m, x, y, z){
	var e = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
	e.position.set(x || 0, y || 0, z || 0);
	e.castShadow = true; e.receiveShadow = true;
	return e;
}

function cyl(rTop, rBot, h, seg, m, x, y, z){
	var e = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), m);
	e.position.set(x || 0, y || 0, z || 0);
	e.castShadow = true;
	return e;
}

// A real gable roof — a triangular prism with a ridge — rather than the
// four-sided pyramid this used to have, which read as a wizard hat on anything
// that wasn't square. A 3-sided cylinder IS a triangular prism; the rotations
// below lay it on its side with the ridge running along x, and the scale
// decouples the height from the (equilateral) depth. Eaves end up at y = 0.
function gableRoof(w, h, d, m){
	var r = d / 1.7320508;
	var g = new THREE.CylinderGeometry(r, r, w, 3, 1);
	g.rotateZ(Math.PI / 2);
	g.rotateX(-Math.PI / 2);
	var sy = h / (1.5 * r);
	g.scale(1, sy, 1);
	g.translate(0, r * 0.5 * sy, 0);
	var e = new THREE.Mesh(g, m);
	e.castShadow = true;
	return e;
}

// --- wind -------------------------------------------------------------------
//
// One wind function for the whole map, so the trees, the crops and the market
// awnings all lean the same way at the same moment. Gusts travel: the phase
// depends on world x, so you can watch a gust cross the valley rather than
// everything wobbling independently in place, which is what gives away that
// each thing is animating on its own little timer.
function windAt(x, z, now){
	return Math.sin(now * 1.15 - x * 0.013 - z * 0.006) * 0.62 +
	       Math.sin(now * 0.47 - x * 0.005) * 0.38;
}

// --- effects pool -----------------------------------------------------------
//
// Short-lived bits and pieces — wood chips off an axe, smoke off the forge,
// dust off the quarry. Meshes are pooled and recycled, so a busy village
// doesn't allocate per frame, and each keeps its own material so it can fade
// out independently.
var FX_KINDS = {
	chip:  { color: "#8a6239", life: 0.85, grav: -260, grow: -0.9 },
	smoke: { color: "#cfc9bf", life: 3.2,  grav: 0,    grow: 2.2 },
	dust:  { color: "#c6b795", life: 1.3,  grav: -40,  grow: 1.4 },
	spark: { color: "#ff9a3a", life: 0.6,  grav: -200, grow: -0.8 },
};
var FX_CAP = 90;          // hard ceiling; beyond this the oldest is reused
// Does this device have a pointer that hovers? Edge panning depends on it.
var FINE_POINTER = !window.matchMedia || window.matchMedia("(pointer: fine)").matches;

var _fxGeo = null;
function FX_GEO(){
	if(!_fxGeo){ _fxGeo = new THREE.IcosahedronGeometry(1.5, 0); }
	return _fxGeo;
}

// Building silhouettes. Each gets its usable footprint (W across, D deep, in
// world units) and returns a group standing on y = 0.
//
// These are written out by hand rather than generated from a table of box sizes
// because a village of ten buildings has to be legible at a glance: a water
// wheel, a mine head, a set of market awnings and a stepped quarry tell you
// where you are. Ten tinted boxes with pyramids on top do not.
var BUILD = {
	house: function(W, D){
		var g = new THREE.Group(), wall = mat("#cdb08a"), roof = mat("#8d3f2f");
		g.add(box(W, 22, D, wall, 0, 11));
		var r = gableRoof(W * 1.14, 15, D * 1.14, roof); r.position.y = 22; g.add(r);
		g.add(box(W * 0.26, 12, 1.5, mat("#5c3f28"), 0, 6, D / 2 + 0.4));       // door
		g.add(box(W * 0.2, 5, 1.2, mat("#89b7c9"), -W * 0.3, 15, D / 2 + 0.4)); // windows
		g.add(box(W * 0.2, 5, 1.2, mat("#89b7c9"), W * 0.3, 15, D / 2 + 0.4));
		return g;
	},

	lumberMill: function(W, D){
		var g = new THREE.Group(), wall = mat("#8a6239"), roof = mat("#5d4324"), wood = mat("#6b4a2b");
		g.add(box(W * 0.8, 24, D, wall, -W * 0.1, 12));
		var r = gableRoof(W * 0.92, 14, D * 1.12, roof); r.position.set(-W * 0.1, 24, 0); g.add(r);
		// Water wheel on the gable end — the thing that says "mill" from a distance.
		// Two nested groups on purpose: the outer one aims the axle out of the wall,
		// the inner one is free to spin about that axle. Doing both on one node
		// would compose two Euler angles and tumble the wheel instead of turning it.
		var axle = new THREE.Group();
		var wheel = new THREE.Group();
		// A ring plus spokes plus big paddles. A solid disc with small nubs on it
		// read as a pile of planks at any distance you actually play at.
		var rim = new THREE.Mesh(new THREE.TorusGeometry(12, 1.5, 6, 14), wood);
		rim.castShadow = true;
		wheel.add(rim);
		var hub = cyl(2, 2, 9, 6, wood);
		hub.rotation.x = Math.PI / 2;
		wheel.add(hub);
		for(var i = 0; i < 8; i++){
			var a = i / 8 * 6.2832;
			var spoke = box(11, 1.2, 1.2, wood, Math.cos(a) * 6, Math.sin(a) * 6, 0);
			spoke.rotation.z = a;
			wheel.add(spoke);
			var pad = box(2, 6, 9, mat("#7d5a36"), Math.cos(a) * 11.5, Math.sin(a) * 11.5, 0);
			pad.rotation.z = a;
			wheel.add(pad);
		}
		axle.add(wheel);
		axle.rotation.y = Math.PI / 2;             // axle now points along x, into the mill
		axle.position.set(W * 0.44, 14, 0);
		g.add(axle);
		g.userData.wheel = wheel;   // turns about its own z; see sync()
		// Log pile out front.
		for(var L = 0; L < 3; L++){
			var log = cyl(2.4, 2.4, W * 0.5, 6, wood, -W * 0.18, 2.4 + L * 3.8, D * 0.62 - (L % 2) * 2);
			log.rotation.z = Math.PI / 2;
			g.add(log);
		}
		return g;
	},

	mine: function(W, D){
		var g = new THREE.Group(), rock = mat("#7f8489"), timber = mat("#5a4632");
		// A spoil heap with a timbered adit cut into it.
		var mound = new THREE.Mesh(new THREE.SphereGeometry(W * 0.62, 10, 6, 0, 6.2832, 0, Math.PI / 2), rock);
		mound.scale.y = 0.62; mound.castShadow = true; mound.receiveShadow = true;
		g.add(mound);
		// The headframe stands at the FRONT of the heap, not inside it — at z =
		// D * 0.3 the mound (radius W * 0.62) simply ate it.
		var face = W * 0.55;
		g.add(box(3.4, 16, 3.4, timber, -W * 0.22, 8, face));
		g.add(box(3.4, 16, 3.4, timber, W * 0.22, 8, face));
		g.add(box(W * 0.58, 3.4, 3.4, timber, 0, 17.5, face));
		var brace = box(W * 0.5, 2.4, 2.4, timber, 0, 12, face);
		brace.rotation.z = 0.25; g.add(brace);
		g.add(box(W * 0.38, 14, 2, mat("#17130f"), 0, 7, face + 0.6));         // the dark of the shaft
		// Minecart on a short rail.
		g.add(box(9, 5.5, 6.5, mat("#6b5a45"), W * 0.16, 3.4, D * 0.72));
		g.add(box(W * 0.8, 0.8, 1.2, timber, 0, 0.6, D * 0.72 - 2.4));
		g.add(box(W * 0.8, 0.8, 1.2, timber, 0, 0.6, D * 0.72 + 2.4));
		return g;
	},

	huntingLodge: function(W, D){
		var g = new THREE.Group(), logm = mat("#7d5c3c"), roof = mat("#6d5238");
		g.add(box(W - 5, 22, D - 5, logm, 0, 11));
		// Stacked logs along two walls read as a cabin rather than a plastered house.
		for(var i = 0; i < 4; i++){
			var log = cyl(2.9, 2.9, W, 7, logm, 0, 3 + i * 5.4, -D / 2 + 2.9);
			log.rotation.z = Math.PI / 2;
			g.add(log);
			var log2 = cyl(2.9, 2.9, D, 7, logm, -W / 2 + 2.9, 3 + i * 5.4, 0);
			log2.rotation.x = Math.PI / 2;
			g.add(log2);
		}
		var r = gableRoof(W * 1.1, 11, D * 1.1, roof); r.position.y = 22; g.add(r);
		// Antlers mounted on the wall over the door — the lodge's one unmistakable
		// signature. They have to sit proud of the FRONT WALL: on the roof face
		// (where they were) a gable roof's slope just swallows them.
		var bone = mat("#e2d8c2");
		for(var sx = -1; sx <= 1; sx += 2){
			g.add(box(1.5, 8, 1.5, bone, sx * 2.6, 17, D / 2 + 1.2));
			g.add(box(1.3, 1.3, 1.3, bone, sx * 5, 20, D / 2 + 1.2));
			g.add(box(5.5, 1.3, 1.3, bone, sx * 5, 20.5, D / 2 + 1.2));
			g.add(box(1.3, 4.5, 1.3, bone, sx * 7.4, 22.5, D / 2 + 1.2));
			g.add(box(1.3, 3.5, 1.3, bone, sx * 4.2, 22, D / 2 + 1.2));
		}
		g.add(box(W * 0.24, 11, 1.5, mat("#3a2a1a"), 0, 5.5, D / 2 + 0.4));
		return g;
	},

	trainingYard: function(W, D){
		var g = new THREE.Group(), sand = mat("#c4a878"), post = mat("#7a5c33");
		g.add(box(W, 2.5, D, sand, 0, 1.25));
		for(var p = 0; p < 4; p++){
			g.add(cyl(1.8, 2.2, 17, 6, post, (p % 2 ? 1 : -1) * W * 0.4, 10.5, (p < 2 ? 1 : -1) * D * 0.4));
		}
		// A pell to hit: post, crossbar, head.
		var d = new THREE.Group();
		d.add(cyl(2.2, 2.6, 22, 7, post, 0, 11, 0));
		d.add(box(17, 2.4, 2.4, post, 0, 19, 0));
		d.add(box(5.5, 5.5, 5.5, mat("#9c7f52"), 0, 24, 0));
		d.position.set(W * 0.08, 2.5, -D * 0.12);
		g.add(d);
		return g;
	},

	quarry: function(W, D){
		var g = new THREE.Group(), stone = mat("#98a3b5"), dark = mat("#5d6675"), rub = mat("#7b8697");
		// A worked pit: a stone rim stepping down to a dark floor.
		g.add(box(W, 9, D, stone, 0, 4.5));
		g.add(box(W * 0.74, 5, D * 0.74, dark, 0, 7.6));
		g.add(box(W * 0.46, 4, D * 0.46, mat("#3f4652"), 0, 8.6));
		for(var r = 0; r < 4; r++){
			var rb = new THREE.Mesh(new THREE.DodecahedronGeometry(3 + (r % 3), 0), rub);
			rb.position.set((r - 1.5) * W * 0.3, 10 + (r % 2), D * 0.52);
			rb.rotation.set(r, r * 1.7, 0);
			rb.castShadow = true;
			g.add(rb);
		}
		// Hoist arm over the pit.
		g.add(cyl(1.6, 1.6, 20, 6, mat("#6b4a2b"), -W * 0.36, 19, -D * 0.3));
		var arm = box(W * 0.6, 1.8, 1.8, mat("#6b4a2b"), -W * 0.1, 28, -D * 0.3);
		arm.rotation.z = -0.12; g.add(arm);
		g.userData.emit = { kind: "dust", at: new THREE.Vector3(0, 10, 0), rise: 7, rate: 0.9, size: 0.8 };
		return g;
	},

	farm: function(W, D){
		var g = new THREE.Group(), barn = mat("#a8503c"), roof = mat("#d8cdb0");
		// Small barn pushed to one side; the rest of the plot is crop.
		g.add(box(W * 0.42, 19, D * 0.6, barn, -W * 0.28, 9.5));
		var r = gableRoof(W * 0.5, 12, D * 0.68, roof); r.position.set(-W * 0.28, 19, 0); g.add(r);
		// Ploughed rows, alternating green and ripe gold so it reads as a field.
		g.userData.sway = [];
		for(var i = 0; i < 5; i++){
			var row = box(W * 0.44, 3.2, D * 0.11, mat(i % 2 ? "#7cb342" : "#c9a94a"),
				W * 0.22, 1.6, (i - 2) * D * 0.17);
			g.add(row);
			g.userData.sway.push(row);   // the crop bends in the same wind as the trees
		}
		g.add(box(1.6, 13, 1.6, mat("#8a6239"), W * 0.05, 6.5, -D * 0.36));     // scarecrow
		g.add(box(11, 1.4, 1.4, mat("#8a6239"), W * 0.05, 10.5, -D * 0.36));
		g.add(box(4, 4, 4, mat("#c9a94a"), W * 0.05, 14.5, -D * 0.36));
		return g;
	},

	blacksmith: function(W, D){
		var g = new THREE.Group(), wall = mat("#6d4c41"), roof = mat("#3a2722"), iron = mat("#3b3b40");
		g.add(box(W, 21, D * 0.8, wall, 0, 10.5, -D * 0.1));
		var r = gableRoof(W * 1.12, 12, D * 0.92, roof); r.position.set(0, 21, -D * 0.1); g.add(r);
		g.add(box(6.5, 22, 6.5, mat("#4a332c"), W * 0.3, 26, -D * 0.22));       // chimney
		// Open forge front: a glowing hearth and an anvil under the eaves.
		g.add(box(W * 0.42, 11, 4, mat("#211a16"), -W * 0.14, 5.5, D * 0.28));
		var coals = box(W * 0.3, 2, 3, mat("#ff6a18", { emissive: "#ff5500" }), -W * 0.14, 3, D * 0.3);
		coals.castShadow = false; g.add(coals);
		g.add(cyl(3.2, 4.2, 4, 6, iron, W * 0.28, 2, D * 0.3));                  // anvil base
		g.add(box(9, 3, 4, iron, W * 0.28, 5.5, D * 0.3));                       // anvil
		var forge = new THREE.PointLight("#ff7a1a", 420, 190);
		forge.position.set(-W * 0.14, 8, D * 0.4);
		g.add(forge);
		g.userData.forge = forge;
		// Smoke off the chimney, sparks off the hearth. Declared, not special-cased.
		g.userData.emit = { kind: "smoke", at: new THREE.Vector3(W * 0.3, 38, -D * 0.22), rise: 20, rate: 2.4, size: 1.1 };
		g.userData.emit2 = { kind: "spark", at: new THREE.Vector3(-W * 0.14, 5, D * 0.3), rise: 40, rate: 1.6, size: 0.35 };
		return g;
	},

	market: function(W, D){
		var g = new THREE.Group(), post = mat("#8a6239"), crate = mat("#b08a52");
		// Two stalls with striped awnings, goods stacked between them.
		for(var st = 0; st < 2; st++){
			var stall = new THREE.Group();
			for(var p = 0; p < 4; p++){
				stall.add(cyl(1.2, 1.2, 17, 5, post, (p % 2 ? 1 : -1) * W * 0.18, 8.5, (p < 2 ? 1 : -1) * D * 0.2));
			}
			stall.add(box(W * 0.42, 3, D * 0.46, crate, 0, 8, 0));              // counter
			g.userData.sway = g.userData.sway || [];
			for(var b = 0; b < 4; b++){                                         // striped awning
				var strip = box(W * 0.13, 1.6, D * 0.56, mat(b % 2 ? "#e8e2d4" : "#b34a3a"),
					(b - 1.5) * W * 0.13, 18, 0);
				stall.add(strip);
				g.userData.sway.push(strip);   // canvas ripples
			}
			stall.position.x = (st ? 1 : -1) * W * 0.26;
			g.add(stall);
		}
		g.add(box(7, 7, 7, crate, 0, 3.5, D * 0.3));
		g.add(box(6, 6, 6, crate, 3, 10, D * 0.3));
		g.add(box(5.5, 5.5, 5.5, mat("#c9a227"), -4, 3, D * 0.34));
		return g;
	},

	monument: function(W, D){
		var g = new THREE.Group(), stone = mat("#8d86a8"), dark = mat("#6b5a8a");
		// Stepped plinth rising to a lit shard. The win condition should be the
		// tallest thing on the map and visible from the far end of it.
		g.add(box(W * 1.15, 6, D * 1.15, stone, 0, 3));
		g.add(box(W * 0.88, 6, D * 0.88, stone, 0, 9));
		g.add(box(W * 0.62, 8, D * 0.62, dark, 0, 16));
		var shard = new THREE.Mesh(new THREE.ConeGeometry(W * 0.3, 52, 6),
			mat("#9b6dc9", { emissive: "#4a2d6b" }));
		shard.position.y = 46; shard.castShadow = true;
		g.add(shard);
		for(var i = 0; i < 3; i++){
			var a = i / 3 * 6.2832;
			var small = new THREE.Mesh(new THREE.ConeGeometry(3.4, 15, 5), mat("#b58ede", { emissive: "#3f2660" }));
			small.position.set(Math.cos(a) * W * 0.5, 27, Math.sin(a) * D * 0.5);
			small.castShadow = true;
			g.add(small);
		}
		var light = new THREE.PointLight("#9b6dc9", 1400, 400);
		light.position.y = 60;
		g.add(light);
		g.userData.glow = light;
		return g;
	},
};

// How much of its tile each type takes. Things that sprawl (the quarry pit, the
// market stalls) get more; cottages get less, so neighbours read as separate plots.
var SPREAD = {
	house: 0.60, lumberMill: 0.66, mine: 0.70, huntingLodge: 0.62, trainingYard: 0.74,
	quarry: 0.70, farm: 0.72, blacksmith: 0.66, market: 0.72, monument: 0.55,
};

// --- faces ------------------------------------------------------------------
//
// A face is a curved patch sitting just proud of the head sphere, carrying a
// drawn canvas texture. A patch rather than a flat plane because a flat decal on
// a round head separates visibly the moment the camera swings round; the patch
// shares the head's curvature, so it is simply part of it.
//
// Each villager gets one of six permanent expressions (their personality, keyed
// off the same phase that already gives them their shirt colour), which the
// current MOOD then overrides — tired, hungry, or pleased with themselves on the
// walk home with a full load. Nothing new is stored on a villager for this: it
// is all read from energy, hunger and the task they're on.
var FACES = {};        // "expr|mood" -> CanvasTexture, shared across villagers
var FACE_GEO = null;

function facePatchGeo(r){
	if(!FACE_GEO){
		var span = 1.55;   // longitude covered, centred on +z (the way they face)
		FACE_GEO = new THREE.SphereGeometry(r + 0.09, 16, 12,
			Math.PI / 2 - span / 2, span,   // phiStart, phiLength
			0.62, 1.15);                    // thetaStart, thetaLength: brow to chin
	}
	return FACE_GEO;
}

function faceTexture(expr, mood, blink){
	var key = expr + "|" + mood + (blink ? "|b" : "");
	if(FACES[key]){ return FACES[key]; }

	var S = 128, cv = document.createElement("canvas");
	cv.width = cv.height = S;
	var g = cv.getContext("2d");
	g.lineCap = "round";
	g.lineJoin = "round";
	var ink = "#33261c";
	// Sizes are set for legibility at PLAY distance, not for anatomy. A head is
	// roughly 50 pixels across from the default camera, so a naturalistic eye
	// would be two pixels and simply would not be there.
	var eyeY = S * 0.36, eyeDX = S * 0.2, mouthY = S * 0.69;

	function dot(x, y, r){ g.fillStyle = ink; g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill(); }
	function arc(x, y, r, a0, a1, w){
		g.strokeStyle = ink; g.lineWidth = w || S * 0.07;
		g.beginPath(); g.arc(x, y, r, a0, a1); g.stroke();
	}
	function line(x0, y0, x1, y1, w){
		g.strokeStyle = ink; g.lineWidth = w || S * 0.07;
		g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
	}

	// Eyes. A blink beats everything (it is only 120ms), then mood beats
	// personality — a shattered villager doesn't keep beaming at you because they
	// happened to roll "cheerful".
	if(blink){
		arc(S / 2 - eyeDX, eyeY - S * 0.02, S * 0.095, 0.1, Math.PI - 0.1);
		arc(S / 2 + eyeDX, eyeY - S * 0.02, S * 0.095, 0.1, Math.PI - 0.1);
	} else if(mood === "tired"){
		arc(S / 2 - eyeDX, eyeY, S * 0.095, 0.15, Math.PI - 0.15);   // drooping lids
		arc(S / 2 + eyeDX, eyeY, S * 0.095, 0.15, Math.PI - 0.15);
	} else if(mood === "happy"){
		arc(S / 2 - eyeDX, eyeY + S * 0.04, S * 0.095, Math.PI + 0.2, -0.2);  // ^ ^
		arc(S / 2 + eyeDX, eyeY + S * 0.04, S * 0.095, Math.PI + 0.2, -0.2);
	} else if(expr === 0){
		dot(S / 2 - eyeDX, eyeY, S * 0.085); dot(S / 2 + eyeDX, eyeY, S * 0.085);
	} else if(expr === 1){
		dot(S / 2 - eyeDX, eyeY, S * 0.11); dot(S / 2 + eyeDX, eyeY, S * 0.11);
		g.fillStyle = "#fff";
		g.beginPath(); g.arc(S / 2 - eyeDX + 4, eyeY - 4, S * 0.038, 0, 6.2832); g.fill();
		g.beginPath(); g.arc(S / 2 + eyeDX + 4, eyeY - 4, S * 0.038, 0, 6.2832); g.fill();
	} else if(expr === 2){
		line(S / 2 - eyeDX - 12, eyeY, S / 2 - eyeDX + 12, eyeY, S * 0.085);   // squint
		line(S / 2 + eyeDX - 12, eyeY, S / 2 + eyeDX + 12, eyeY, S * 0.085);
	} else if(expr === 3){
		dot(S / 2 - eyeDX, eyeY, S * 0.085); dot(S / 2 + eyeDX, eyeY, S * 0.085);
		line(S / 2 + eyeDX - 12, eyeY - S * 0.16, S / 2 + eyeDX + 12, eyeY - S * 0.21, S * 0.055); // raised brow
	} else if(expr === 4){
		dot(S / 2 - eyeDX, eyeY, S * 0.085);
		arc(S / 2 + eyeDX, eyeY, S * 0.095, Math.PI + 0.2, -0.2);     // a wink
	} else {
		dot(S / 2 - eyeDX, eyeY, S * 0.085); dot(S / 2 + eyeDX, eyeY, S * 0.085);
		g.fillStyle = "rgba(190,110,90,0.5)";                          // freckles
		for(var f = 0; f < 6; f++){
			var fx = S / 2 + (f % 3 - 1) * 11 + (f < 3 ? -eyeDX : eyeDX);
			g.beginPath(); g.arc(fx, eyeY + S * 0.15, 3.2, 0, 6.2832); g.fill();
		}
	}

	// Mouth.
	if(mood === "hungry"){ arc(S / 2, mouthY + S * 0.13, S * 0.135, Math.PI + 0.35, -0.35); }
	else if(mood === "tired"){ line(S / 2 - 14, mouthY, S / 2 + 14, mouthY, S * 0.065); }
	else if(mood === "happy"){ arc(S / 2, mouthY - S * 0.04, S * 0.165, 0.25, Math.PI - 0.25); }
	else if(expr === 1){
		g.fillStyle = ink;                                             // open grin
		g.beginPath(); g.ellipse(S / 2, mouthY, S * 0.115, S * 0.09, 0, 0, 6.2832); g.fill();
	}
	else if(expr === 2){ arc(S / 2, mouthY - S * 0.03, S * 0.145, 0.2, Math.PI - 0.2); }
	else if(expr === 3){ line(S / 2 - 15, mouthY + 5, S / 2 + 15, mouthY - 4); }   // smirk
	else if(expr === 4){ line(S / 2 - 13, mouthY, S / 2 + 13, mouthY, S * 0.065); }
	else { arc(S / 2, mouthY - S * 0.05, S * 0.125, 0.3, Math.PI - 0.3); }

	var tex = new THREE.CanvasTexture(cv);
	tex.colorSpace = THREE.SRGBColorSpace;
	// Shared between every villager wearing this expression, so the per-mesh
	// teardown must not dispose it (see disposeTree).
	tex.userData.shared = true;
	FACES[key] = tex;
	return tex;
}

// --- hats -------------------------------------------------------------------
// Silhouette is what separates one villager from another at the distance you
// actually play at, so this is the variety that earns its place.
var HAT_KINDS = ["none", "none", "straw", "cap", "band", "top", "hood"];
var HAT_COLORS = ["#8d3f2f", "#3f5d8a", "#5d7a3a", "#7a5c33", "#4a4a52", "#a8763a", "#6b4a7a"];

function buildHat(kind, color, headY, r){
	if(kind === "none"){ return null; }
	var g = new THREE.Group();
	var m = mat(color);
	// Everything here is measured against the EYE LINE. The face patch puts the
	// eyes at about 0.51r above the head centre, so a hat whose brim dips below
	// that is not a hat, it's a blindfold — which is exactly what the hood and
	// the headband were before this.
	if(kind === "straw"){
		g.add(cyl(0.2, r * 1.5, 3.2, 9, m, 0, 1.3, 0));        // wide conical brim
		g.add(cyl(r * 0.62, r * 0.72, 3.4, 9, m, 0, 4.1, 0));
	} else if(kind === "cap"){
		g.add(box(r * 1.5, 2.6, r * 1.5, m, 0, 1.4, 0));
		g.add(box(r * 1.25, 1.2, r * 1.05, m, 0, 0.5, r * 0.95)); // peak
	} else if(kind === "band"){
		var band = new THREE.Mesh(new THREE.TorusGeometry(r * 0.96, 0.85, 5, 12), m);
		band.rotation.x = Math.PI / 2;
		band.position.y = 0.15;
		band.castShadow = true;
		g.add(band);
	} else if(kind === "top"){
		g.add(cyl(r * 1.45, r * 1.45, 1.1, 12, m, 0, 0.5, 0));  // brim
		g.add(cyl(r * 0.85, r * 0.85, 6.5, 12, m, 0, 4.2, 0));
	} else if(kind === "hood"){
		var hood = new THREE.Mesh(
			new THREE.SphereGeometry(r * 1.1, 12, 8, 0, 6.2832, 0, Math.PI * 0.46), m);
		hood.castShadow = true;
		hood.position.y = -0.2;
		g.add(hood);
	}
	g.position.y = headY + r * 0.72;
	return g;
}

// --- villagers -------------------------------------------------------------

// One skin material for everyone (the shirts vary per villager, faces don't).
// Re-made in init(), because destroy() disposes and clears the material cache.
var SKIN = null;

// World units walked per full two-step cycle. Driving the gait off distance
// rather than time is what keeps the feet from skating.
var STRIDE_LEN = 34;

// Which motion a villager plays for a given manual action, and for a given job.
// Adding an action means adding a row here (or getting the default swing).
var WORK_ANIM = {
	chopWood: "swing", mineIron: "swing", mineCrystal: "swing",
	clawTree: "claw", hunt: "stalk",
	trainSpeed: "jog", trainStrength: "press", trainCardio: "jacks",
};
var JOB_ANIM = {
	lumberMill: "swing", mine: "swing", quarry: "swing",
	huntingLodge: "stalk", market: "haggle",
};

// Camera framing, Warcraft-III style: there is ONE zoom control and the pitch
// rides on it. Zooming in doesn't just move the camera closer, it tilts it down
// toward the horizon so you end up looking along the street at head height;
// zooming out swings it back up toward a tactical near-top-down. Both ends stop
// hard, and panning is fenced to the map, so the view can never get lost.
//
// The 2D camera's habits survive: it still follows the villagers along x and
// still holds still while they work inside a deadzone.
var CAM = {
	zoom: 0.55,         // THE control: 0 = closest/lowest, 1 = furthest/steepest
	zoomTarget: 0.55,
	minDist: 175,       // hard border, zoomed all the way in
	maxDist: 950,       // hard border, with headroom beyond the whole-valley fit
	nearElev: 0.30,     // radians above the horizon when closest (~17°, in among it)
	farElev: 1.16,      // radians above the horizon when furthest (~66°, tactical)
	azimuth: 0,         // radians around Y; 0 looks straight down -z (map "north")
	deadzone: 0.45,     // fraction of the view the action roams in before we pan
	lerp: 3,
	zoomLerp: 9,        // how fast the wheel's step is eased out
	// Zoom per 100px of wheel delta. Using the delta MAGNITUDE rather than its
	// sign is the whole game here: a trackpad fires dozens of small wheel events
	// per flick, so counting each as a fixed notch meant one gesture crossed the
	// entire range and the zoom only ever felt like "nearest" or "furthest".
	perWheel: 0.085,
	maxStep: 0.11,      // ceiling per event, so a chunky mouse notch can't leap
	edge: 30,           // px from the left/right edge that starts panning
	edgeSpeed: 1.5,     // world units per second per unit of distance
};

// Distance grows faster than the zoom parameter so the close end — where the
// tilt is changing most and a few units matter — gets the finer control.
function camDist(){ return CAM.minDist + (CAM.maxDist - CAM.minDist) * Math.pow(CAM.zoom, 1.7); }
// The inverse, so a distance we want (the whole-valley fit) becomes a zoom value.
function zoomForDist(d){
	var t = (d - CAM.minDist) / (CAM.maxDist - CAM.minDist);
	return Math.max(0, Math.min(1, Math.pow(Math.max(0, t), 1 / 1.7)));
}

// Pitch leads the distance a little: the camera stands up off the ground quickly
// as you first pull back, then flattens out toward the top-down limit.
function camElev(){ return CAM.nearElev + (CAM.farElev - CAM.nearElev) * Math.pow(CAM.zoom, 0.7); }

var Render3D = {
	name: "3d",
	canvas: null,
	world: null,

	init: function(container){
		var c = document.createElement("canvas");
		c.id = "canvas1";
		container.appendChild(c);
		this.canvas = c;

		this.renderer = new THREE.WebGLRenderer({ canvas: c, antialias: true });
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

		this.three = new THREE.Scene();
		// Sky + matched haze. Once the camera can drop to 17° above the ground you
		// are looking at the horizon, so there has to be something up there; the
		// fog is the horizon colour so the far end of the strip dissolves into it
		// instead of ending at a visible edge.
		this.three.background = new THREE.Color(HORIZON);
		this.three.fog = new THREE.Fog(HORIZON, 1150, 3000);
		this.three.add(this.skyDome());

		this.camera = new THREE.PerspectiveCamera(45, 1, 1, 4000);
		this.camTargetX = WORLD_W * 0.15;
		this.camTargetZ = WORLD_H * 0.5;
		this._camReady = false;

		SKIN = mat("#e8c39a");
		this.buildLights();

		// One group per entity kind keeps the reconcile loops and the raycast
		// target tidy.
		this.gTerrain = new THREE.Group();
		this.gBuildings = new THREE.Group();
		this.gTrees = new THREE.Group();
		this.gVillagers = new THREE.Group();
		this.gFloaters = new THREE.Group();
		this.gFx = new THREE.Group();
		this.gBirds = new THREE.Group();
		this.three.add(this.gTerrain, this.gBuildings, this.gTrees, this.gVillagers,
			this.gFloaters, this.gFx, this.gBirds);

		// entity object -> its Object3D
		this.bMesh = new Map();
		this.vMesh = new Map();
		this.fMesh = new Map();

		this.terrainVersion = -1;
		// Forget the last session's canvas size. updateCamera only calls setSize()
		// when these change, so carrying them over meant a REBUILT renderer was
		// never sized at all: it kept the canvas element default of 300x150 and
		// stretched it over the full map, with the camera still on its constructor
		// aspect of 1. That is the "3D looks low quality the second time" bug.
		this._cw = this._ch = 0;
		this._framed = false;  // first sized frame picks the whole-valley framing
		this.ptr = null;       // pointer over the map, for edge panning
		this.fx = [];          // pooled short-lived effects
		this.birds = [];
		this.treeCount = 0;   // forces buildTrees on the first frame (and after a switch)
		this.labels = [];      // map labels, faded by distance in frame()
		this.textScale = 1;
		this.raycaster = new THREE.Raycaster();
		this.pointer = new THREE.Vector2();

		this.buildBirds({ W: WORLD_W, H: WORLD_H });
		this.bindControls(c);
	},

	destroy: function(){
		this.unbindControls();
		// Drop the GPU resources AND the context itself. dispose() alone leaves the
		// WebGL context alive until it happens to be collected, so switching back
		// and forth between renderers piles up contexts until the browser starts
		// killing the oldest — at which point this renderer is quietly dead while
		// still looking installed. forceContextLoss() releases it immediately.
		if(this.three){
			var self = this;
			this.three.traverse(function(o){
				if(o.geometry){ o.geometry.dispose(); }
				var mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
				for(var i = 0; i < mats.length; i++){
					if(mats[i].map){ mats[i].map.dispose(); }
					mats[i].dispose();
				}
				if(o.isInstancedMesh && o.dispose){ o.dispose(); }
			});
			this.three = null;
		}
		// Shared per-colour materials were disposed above; drop the caches so the
		// next init builds fresh ones rather than handing out dead GPU handles.
		MATS = {};
		SKIN = null;
		for(var k in FACES){ FACES[k].dispose(); }
		FACES = {};
		// Both of these are module-level caches of geometry that the traverse above
		// has just disposed. Null them, or the next session hands out dead handles.
		if(FACE_GEO){ FACE_GEO.dispose(); FACE_GEO = null; }
		_fxGeo = null;
		if(this.renderer){
			this.renderer.dispose();
			if(this.renderer.forceContextLoss){ this.renderer.forceContextLoss(); }
			this.renderer = null;
		}
		if(this.canvas && this.canvas.parentNode){ this.canvas.parentNode.removeChild(this.canvas); }
		this.canvas = null;
		// Everything below is rebuilt by init(); null them so a half-torn-down
		// renderer can never be mistaken for a live one, and so that nothing
		// cached here can make the next init skip work it needs to do.
		this.bMesh = this.vMesh = this.fMesh = null;
		this.trunks = this.firs = this.oaks = null;
		this.treeCount = 0;
		this.terrainVersion = -1;
		this._cw = this._ch = 0;
		this._framed = false;
		this.ptr = null;
		this.fx = [];
		this.birds = [];
	},

	// A gradient dome, horizon colour up to zenith. Big enough that the camera
	// never approaches its shell, unlit and unfogged so it stays a flat backdrop.
	skyDome: function(){
		var R = 2800;
		var geo = new THREE.SphereGeometry(R, 24, 16);
		var pos = geo.attributes.position, col = [];
		var lo = new THREE.Color(HORIZON).convertSRGBToLinear();
		var hi = new THREE.Color(ZENITH).convertSRGBToLinear();
		var c = new THREE.Color();
		for(var i = 0; i < pos.count; i++){
			// Ramp from the horizon colour at eye level up to the zenith. Anchoring
			// the ramp at y = 0 (not at the dome's equator-as-midpoint) is what
			// stops a bright seam where the fogged ground meets the sky: both are
			// exactly HORIZON at the line where they touch.
			var t = Math.max(0, Math.min(1, pos.getY(i) / R));
			c.copy(lo).lerp(hi, Math.pow(t, 0.55));
			col.push(c.r, c.g, c.b);
		}
		geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
		var sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
			vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false,
		}));
		sky.position.set(WORLD_W / 2, 0, WORLD_H / 2);
		sky.renderOrder = -1;
		return sky;
	},

	// --- lighting ----------------------------------------------------------

	buildLights: function(){
		this.three.add(new THREE.HemisphereLight("#bcd8ff", "#5a5238", 1.6));
		// The sun sits in FRONT-left of the map, not behind it. The default camera
		// looks from +z, so lighting from -z put every face the player can see into
		// shadow — which is why dark roofs read as black slabs. Front-left-above
		// lights what you are looking at and throws shadows back and to the right.
		var sun = new THREE.DirectionalLight("#fff2d0", 2.0);
		sun.position.set(-300, 500, 280);
		sun.castShadow = true;
		sun.shadow.mapSize.set(2048, 2048);
		// The shadow camera has to cover the whole 1150-wide strip, so it is wide
		// and shallow like the world itself.
		var s = sun.shadow.camera;
		s.left = -700; s.right = 700; s.top = 520; s.bottom = -520;
		s.near = 10; s.far = 1600;
		sun.target.position.set(0, 0, 0);
		this.three.add(sun, sun.target);
		this.sun = sun;
	},

	// --- terrain -----------------------------------------------------------

	// Tint a #rrggbb by a flat per-channel delta, matching the 2D renderer's
	// per-tile jitter so both views shade the same tiles the same way.
	shade: function(hex, d){
		var n = parseInt(hex.slice(1), 16);
		var r = Math.max(0, Math.min(255, ((n >> 16) & 255) + d));
		var g = Math.max(0, Math.min(255, ((n >> 8) & 255) + d));
		var b = Math.max(0, Math.min(255, (n & 255) + d));
		return new THREE.Color(r / 255, g / 255, b / 255).convertSRGBToLinear();
	},

	// The ground is one mesh: two triangles per tile with per-vertex colour, so
	// 360 tiles cost one draw call. Rebuilt only when the world changes shape
	// (a region claimed extends the road and lifts its fog).
	buildTerrain: function(world){
		var g;
		this.labels = [];
		while(this.gTerrain.children.length){
			g = this.gTerrain.children.pop();
			if(g.geometry){ g.geometry.dispose(); }
			if(g.material){ g.material.dispose(); }
		}

		var tw = world.tileW, th = world.tileH;
		var pos = [], col = [], idx = [], n = 0;
		for(var cx = 0; cx < world.COLS; cx++){
			var region = world.regionAtCol(cx);
			for(var cz = 0; cz < world.ROWS; cz++){
				var hash = world.tileHash(cx, cz);
				var onRoad = cz === world.ROAD_ROW && !!state.regions[region];
				var base = onRoad ? ROAD_COLOR : GROUND_COLORS[region];
				var c = this.shade(base, (hash % 21) - 10);
				var x0 = cx * tw, x1 = x0 + tw, z0 = cz * th, z1 = z0 + th;
				pos.push(x0, 0, z0,  x1, 0, z0,  x1, 0, z1,  x0, 0, z1);
				for(var k = 0; k < 4; k++){ col.push(c.r, c.g, c.b); }
				idx.push(n, n + 2, n + 1,  n, n + 3, n + 2);
				n += 4;
			}
		}
		var geo = new THREE.BufferGeometry();
		geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
		geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
		geo.setIndex(idx);
		geo.computeVertexNormals();
		var mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
		mesh.receiveShadow = true;
		this.gTerrain.add(mesh);

		// Land continuing past the playable strip. It is never walked on — it just
		// stops the world reading as a lit rectangle hanging in empty space, and
		// the fog dissolves it into the background a few hundred units out.
		var skirt = new THREE.Mesh(
			new THREE.PlaneGeometry(6000, 4000),
			new THREE.MeshLambertMaterial({ color: "#4a6b3a" })
		);
		skirt.rotation.x = -Math.PI / 2;
		skirt.position.set(world.W / 2, -2, world.H / 2);
		this.gTerrain.add(skirt);

		this.buildRegionFurniture(world);
	},

	// Everything static that sits on the terrain: the fog volumes over unclaimed
	// regions, the gateway frames on the road, and the Mine / Hunt landmarks.
	buildRegionFurniture: function(world){
		var tw = world.tileW, th = world.tileH, self = this;

		for(var i = 0; i < REGION_ORDER.length; i++){
			var id = REGION_ORDER[i];
			var rc = world.regionCols[id];
			var x0 = rc[0] * tw, x1 = rc[1] * tw, w = x1 - x0;

			if(!state.regions[id]){
				// Unexplored: a slab of dark air over the whole region, with the same
				// label and scouting hint the 2D fog carries.
				// Low enough to read as darkness lying on the map from above, tall
				// enough to still be a wall when the camera drops to the horizon.
				var fog = new THREE.Mesh(
					new THREE.BoxGeometry(w - 2, 55, world.H - 2),
					new THREE.MeshBasicMaterial({ color: "#12121c", transparent: true, opacity: 0.85, depthWrite: false })
				);
				fog.position.set(x0 + w / 2, 27.5, world.H / 2);
				this.gTerrain.add(fog);

				var scout = (typeof SCOUTS !== "undefined") ? SCOUTS[id] : null;
				var hint = "Scout to unlock";
				if(scout){
					var gate = scout.gate.charAt(0).toUpperCase() + scout.gate.slice(1);
					hint = state[scout.gate] > 0 ? "Scout it in Expeditions" : ("Build a " + gate + " to scout");
				}
				// Name and hint go on ONE sprite. Stacking them as two sprites at
				// different heights looked fine head-on and collided into each other
				// the moment the camera tilted toward top-down — vertical separation
				// foreshortens, separation inside a texture doesn't.
				var lbl = this.textSprite(
					[{ text: REGIONS[id].label, px: 34, color: "#f0f0f2" },
					 { text: hint, px: 20, color: "#b9b9c6" }],
					null, 0, x0 + w / 2, 84, world.H / 2, 155);
				this.labels.push(lbl);
				this.gTerrain.add(lbl);
			}

			// Gateway frame straddling the road at each region's near border.
			if(i > 0){
				var open = !!state.regions[id];
				var postC = open ? "#6b5836" : "#4a3d26";
				var zMid = (world.ROAD_ROW + 0.5) * th;
				var gate3 = new THREE.Group();
				var postG = new THREE.BoxGeometry(6, 34, 6);
				var postM = new THREE.MeshLambertMaterial({ color: postC });
				var pa = new THREE.Mesh(postG, postM); pa.position.set(0, 17, zMid - th * 0.62);
				var pb = new THREE.Mesh(postG, postM); pb.position.set(0, 17, zMid + th * 0.62);
				var lintel = new THREE.Mesh(new THREE.BoxGeometry(8, 6, th * 1.4), postM);
				lintel.position.set(0, 36, zMid);
				pa.castShadow = pb.castShadow = lintel.castShadow = true;
				gate3.add(pa, pb, lintel);
				if(!open){
					var bar = new THREE.Mesh(
						new THREE.BoxGeometry(4, 26, th * 1.24),
						new THREE.MeshLambertMaterial({ color: "#3a301e" })
					);
					bar.position.set(0, 14, zMid);
					bar.castShadow = true;
					gate3.add(bar);
				}
				gate3.position.x = x0;
				this.gTerrain.add(gate3);
			}
		}

		// Home landmarks: the ore cluster and the hunting thicket villagers walk to.
		var mx = (world.homeMine.col + 0.5) * tw, mz = (world.homeMine.row + 0.5) * th;
		var hx = (world.homeHunt.col + 0.5) * tw, hz = (world.homeHunt.row + 0.5) * th;
		var rockM = new THREE.MeshLambertMaterial({ color: "#7a7d82" });
		[[0, 4, 11], [14, 3, -8], [-13, 3.4, 6], [4, 2.4, -14]].forEach(function(r){
			var rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r[1] * 2.1, 0), rockM);
			rock.position.set(mx + r[0], r[1] * 1.6, mz + r[2]);
			rock.rotation.set(r[0], r[2], 0);
			rock.castShadow = true; rock.receiveShadow = true;
			self.gTerrain.add(rock);
		});
		var bushM = new THREE.MeshLambertMaterial({ color: "#2f7d32" });
		[[0, 10], [15, -6], [-12, 8]].forEach(function(b){
			var bush = new THREE.Mesh(new THREE.SphereGeometry(8, 8, 6), bushM);
			bush.position.set(hx + b[0], 6, hz + b[1]);
			bush.scale.y = 0.75;
			bush.castShadow = true;
			self.gTerrain.add(bush);
		});
		var deer = new THREE.Group();
		var deerM = new THREE.MeshLambertMaterial({ color: "#8a5a2b" });
		var dBody = new THREE.Mesh(new THREE.BoxGeometry(14, 7, 6), deerM); dBody.position.y = 10;
		var dHead = new THREE.Mesh(new THREE.BoxGeometry(5, 6, 5), deerM); dHead.position.set(8, 15, 0);
		dBody.castShadow = dHead.castShadow = true;
		deer.add(dBody, dHead);
		deer.position.set(hx + 4, 0, hz - 2);
		this.gTerrain.add(deer);

		this.labels.push(this.textSprite("Mine", "rgba(255,255,255,0.9)", 20, mx, 40, mz, 58, true));
		this.labels.push(this.textSprite("Hunt", "rgba(255,255,255,0.9)", 20, hx, 40, hz, 58, true));
		this.gTerrain.add(this.labels[this.labels.length - 2], this.labels[this.labels.length - 1]);
	},

	// --- entity meshes -----------------------------------------------------

	buildingMesh: function(b){
		var spread = SPREAD[b.type] || 0.64;
		var builder = BUILD[b.type];
		if(!builder){
			// Unknown type: a plain block, so a building added to the game is
			// visible on the map before anyone has drawn it a silhouette.
			var g = new THREE.Group();
			g.add(box(b.w * spread, 20, b.h * spread, mat("#8a8a8a"), 0, 10));
			return g;
		}
		return builder(b.w * spread, b.h * spread);
	},

	// The forest is three InstancedMeshes rather than ~36 little groups: the same
	// picture for three draw calls instead of seventy. Trees only ever differ by
	// position, rotation and growth, which is exactly what an instance matrix is.
	buildTrees: function(world){
		while(this.gTrees.children.length){
			var old = this.gTrees.children.pop();
			old.geometry.dispose();
		}
		var n = world.trees.length;
		this.treeCount = n;
		if(!n){ return; }

		var trunkG = new THREE.CylinderGeometry(2.4, 3.2, 15, 5);
		trunkG.translate(0, 7.5, 0);
		// Two canopies so the wood isn't one shape repeated: a fir, and a rounder
		// scrubbier tree, picked per tile by the same hash the terrain jitters with.
		var firG = new THREE.ConeGeometry(12.5, 30, 7);
		firG.translate(0, 28, 0);
		var oakG = new THREE.IcosahedronGeometry(12, 0);
		oakG.scale(1, 0.86, 1);
		oakG.translate(0, 24, 0);

		this.trunks = new THREE.InstancedMesh(trunkG, mat("#6b4a2b"), n);
		this.firs = new THREE.InstancedMesh(firG, mat("#2f7d32", { flatShading: true }), n);
		this.oaks = new THREE.InstancedMesh(oakG, mat("#4f9440", { flatShading: true }), n);
		this.trunks.castShadow = this.firs.castShadow = this.oaks.castShadow = true;
		this.gTrees.add(this.trunks, this.firs, this.oaks);

		// Per-tree constants: where it stands, which kind it is, how it is turned.
		this.treeInfo = world.trees.map(function(t){
			var h = world.tileHash(t.col, t.row);
			return {
				x: (t.col + 0.5) * world.tileW + ((h % 100) / 100 - 0.5) * world.tileW * 0.5,
				z: (t.row + 0.5) * world.tileH + (((h >> 7) % 100) / 100 - 0.5) * world.tileH * 0.5,
				rot: (h % 628) / 100,
				fir: (h % 5) !== 0,
				size: 0.82 + ((h >> 3) % 40) / 100,
				lastGrow: t.growth,
			};
		});
		this._m4 = new THREE.Matrix4();
		this._q = new THREE.Quaternion();
		this._eul = new THREE.Euler();
		this._up = new THREE.Vector3(0, 1, 0);
		this._pos = new THREE.Vector3();
		this._scl = new THREE.Vector3();
		this.updateTrees(world);
	},

	updateTrees: function(world, dt, now){
		if(!this.treeCount){ return; }
		var HIDE = 0.0001; // the canopy of the kind this tree isn't, scaled away
		for(var i = 0; i < world.trees.length; i++){
			var info = this.treeInfo[i];
			if(!info){ continue; }
			var grow = world.trees[i].growth;

			// A tree the sim just knocked down. The world drops growth to a stump in
			// one step (it has no notion of time passing mid-chop); the renderer sees
			// that drop and plays it out — a topple, and a burst of chips where the
			// axe landed.
			if(grow < info.lastGrow - 0.2){
				info.fell = 0;
				this.chipBurst(info.x, info.z);
			}
			info.lastGrow = grow;
			var lean = 0;
			if(info.fell !== undefined && info.fell < 1){
				info.fell = Math.min(1, info.fell + (dt || 0) * 2.4);
				// Over and back: it goes down hard, then what's left of it settles.
				lean = Math.sin(info.fell * Math.PI) * 1.15;
			}

			// Wind. Taller trees lean further, which is most of what makes a
			// treeline read as a treeline rather than a row of cones.
			var w = windAt(info.x, info.z, now || 0) * 0.085 * (0.6 + grow);
			this._eul.set(w * 0.55, info.rot, w + lean);
			this._q.setFromEuler(this._eul);

			var g = (0.3 + 0.7 * grow) * info.size;
			this._pos.set(info.x, 0, info.z);
			this._scl.set(g, g, g);
			this._m4.compose(this._pos, this._q, this._scl);
			this.trunks.setMatrixAt(i, this._m4);
			// Every tree has an instance in both canopy meshes and collapses the one
			// it doesn't use. Cheaper than re-packing buffers, and the counts never
			// change after the forest is built.
			var f = info.fir ? g : HIDE;
			this._scl.set(f, f, f);
			this._m4.compose(this._pos, this._q, this._scl);
			this.firs.setMatrixAt(i, this._m4);
			var o = info.fir ? HIDE : g;
			this._scl.set(o, o, o);
			this._m4.compose(this._pos, this._q, this._scl);
			this.oaks.setMatrixAt(i, this._m4);
		}
		this.trunks.instanceMatrix.needsUpdate = true;
		this.firs.instanceMatrix.needsUpdate = true;
		this.oaks.instanceMatrix.needsUpdate = true;
	},

	// A villager is a little figure rather than a billboard — the 2D view already
	// does flat art well, and a body that catches the light is what makes the
	// village read as a place rather than a diagram.
	villagerMesh: function(v){
		var g = new THREE.Group();
		// A stable per-villager hue from its animation phase, so the crowd reads as
		// individuals without the sim having to carry an appearance.
		var hue = (v.phase / 6.2832);
		var shirt = new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(hue, 0.48, 0.52) });
		var pants = new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(hue, 0.35, 0.28) });

		// `rig` carries every whole-body move — the bob, the lean, the squash — so
		// the root stays planted on the ground and keeps facing the way they walk.
		var rig = new THREE.Group();
		g.add(rig);

		var torso = new THREE.Mesh(new THREE.CapsuleGeometry(4.4, 7, 3, 8), shirt);
		torso.position.y = 16;
		torso.castShadow = true; // the one shadow caster: limbs aren't worth the pass
		var HEAD_R = 4.4, HEAD_Y = 25.2;
		var head = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R, 12, 9), SKIN);
		head.position.y = HEAD_Y;
		rig.add(torso, head);

		// Everything that makes this villager a person rather than a copy comes off
		// one hash of the phase they already carry — so it is stable for their whole
		// life, survives a save, and costs the simulation nothing.
		var h = Math.floor(v.phase * 10007) >>> 0;
		var expr = h % 6;
		var hat = buildHat(HAT_KINDS[(h >> 3) % HAT_KINDS.length],
			HAT_COLORS[(h >> 6) % HAT_COLORS.length], HEAD_Y, HEAD_R);
		if(hat){ rig.add(hat); }

		// The face rides on the head, so it turns when they look around.
		var face = new THREE.Mesh(
			facePatchGeo(HEAD_R),
			new THREE.MeshBasicMaterial({ map: faceTexture(expr, "ok"), transparent: true })
		);
		head.add(face);

		// Limbs hang from a pivot at the joint, so rotating the pivot swings the
		// limb about the shoulder / hip instead of about its own middle.
		function limb(len, rad, mat, x, y){
			var pivot = new THREE.Group();
			pivot.position.set(x, y, 0);
			var mesh = new THREE.Mesh(new THREE.CapsuleGeometry(rad, Math.max(0.1, len - rad * 2), 3, 6), mat);
			mesh.position.y = -len / 2;
			pivot.add(mesh);
			return pivot;
		}
		var armL = limb(9.5, 1.6, shirt, -5.0, 20.4);
		var armR = limb(9.5, 1.6, shirt,  5.0, 20.4);
		var legL = limb(11.5, 2.0, pants, -2.4, 11.5);
		var legR = limb(11.5, 2.0, pants,  2.4, 11.5);
		rig.add(armL, armR, legL, legR);

		// The reserved tool, in the working hand. The sim already tracks whether a
		// villager holds one (v.tool) and which kind the action wants, so this is
		// read, not invented — and it swings with the arm because it hangs off the
		// arm's pivot rather than off the body.
		var axe = new THREE.Group();
		axe.add(cyl(0.7, 0.7, 12, 5, mat("#7a5a38"), 0, -6, 0));
		axe.add(box(1.2, 5, 4.5, mat("#9aa3ad"), 0, -11, 1.6));
		axe.visible = false;
		armR.add(axe);
		// A spear is mostly shaft. The old one was 20 long and 1.1 thick with a
		// stubby head — the proportions of a sword, which is what it looked like.
		// Long, thin, and held so most of its length is past the hand.
		var spear = new THREE.Group();
		spear.add(cyl(0.38, 0.38, 34, 5, mat("#8a6b45"), 0, -10, 0));
		var tip = new THREE.Mesh(new THREE.ConeGeometry(1.15, 6, 5), mat("#c2cad3"));
		tip.position.y = -29.5;
		var collar = cyl(0.62, 0.62, 1.6, 5, mat("#9aa3ad"), 0, -26, 0);
		spear.add(tip, collar);
		spear.rotation.x = -0.22;   // carried angled, not hanging straight down
		spear.visible = false;
		armR.add(spear);

		// What they're carrying home, held out in front. Colour is set from the
		// resource when the carry leg starts.
		var load = new THREE.Mesh(new THREE.BoxGeometry(6.5, 6.5, 6.5), new THREE.MeshLambertMaterial({ color: "#fff" }));
		load.position.set(0, 18, 8.5);
		load.visible = false;
		rig.add(load);

		// Selection ring, shown only for the villager in the inspect panel.
		var ring = new THREE.Mesh(
			new THREE.RingGeometry(9, 12, 20),
			new THREE.MeshBasicMaterial({ color: "#ffd257", transparent: true, opacity: 0.9, side: THREE.DoubleSide })
		);
		ring.rotation.x = -Math.PI / 2;
		ring.position.y = 0.6;
		ring.visible = false;
		g.add(ring);

		// Status plate: the energy / hunger / progress bars the 2D view paints
		// above each villager, as one canvas sprite redrawn only when it changes.
		var cv = document.createElement("canvas");
		cv.width = 256; cv.height = 128;
		var tex = new THREE.CanvasTexture(cv);
		tex.colorSpace = THREE.SRGBColorSpace;
		var plate = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
		plate.scale.set(20, 10, 1);
		plate.position.y = 41;
		plate.renderOrder = 10;
		g.add(plate);

		g.userData = {
			rig: rig, head: head, armL: armL, armR: armR, legL: legL, legR: legR, load: load,
			ring: ring, plate: plate, cv: cv, tex: tex, sig: "", axe: axe, spear: spear,
			face: face, expr: expr, mood: "ok", blink: false,
			stride: 0, lastX: 0, lastZ: 0, faced: 0,
			villager: v, // raycast hit -> villager
		};
		return g;
	},

	// Pose the rig for what this villager is actually doing. Everything here is
	// derived from sim state that already existed — nobody had to add an
	// "animation" field to a villager for them to mine, jog, haul or nap.
	poseVillager: function(m, v, world, now){
		var u = m.userData, rig = u.rig;
		var armL = u.armL, armR = u.armR, legL = u.legL, legR = u.legR, head = u.head;

		// Clear last frame's pose: each branch below sets only what it needs.
		rig.position.y = 0; rig.rotation.set(0, 0, 0); rig.scale.set(1, 1, 1);
		armL.rotation.set(0, 0, 0); armR.rotation.set(0, 0, 0);
		legL.rotation.set(0, 0, 0); legR.rotation.set(0, 0, 0);
		head.rotation.set(0, 0, 0);

		// The walk cycle advances with DISTANCE TRAVELLED, not with time, so the
		// feet never slide — and a villager slowed by hunger or exhaustion gets a
		// correspondingly plodding gait for free.
		var moved = Math.hypot(m.position.x - u.lastX, m.position.z - u.lastZ);
		u.lastX = m.position.x; u.lastZ = m.position.z;
		u.stride += moved;
		var cyc = u.stride / STRIDE_LEN * 6.2832;
		var sw = Math.sin(cyc), bob = Math.abs(Math.cos(cyc));

		var carrying = v.busy && v.taskPhase === "return" && !!v.dropResource;
		u.load.visible = carrying;
		// Expression follows how they are actually doing. Pleased with themselves on
		// the walk home with a full load; otherwise exhaustion outranks hunger,
		// because it is the one that also slows them down.
		var mood = carrying ? "happy"
			: (v.energy < 35 ? "tired" : (v.hunger < 35 ? "hungry" : "ok"));
		// Blink: a brief shut every few seconds, offset per villager so a crowd
		// never blinks in unison. Cheap — it is a swap between two cached textures.
		var cycle = 3.4 + (u.expr % 4) * 0.9;
		var blink = ((now + v.phase * 3) % cycle) < 0.13;
		if(mood !== u.mood || blink !== u.blink){
			u.mood = mood; u.blink = blink;
			u.face.material.map = faceTexture(u.expr, mood, blink);
			u.face.material.needsUpdate = true;
		}

		// Show whichever tool the action reserved, for as long as they hold it.
		var wants = (v.busy && typeof ACTIONS !== "undefined" && ACTIONS[v.task] && ACTIONS[v.task].tool) || null;
		u.axe.visible = !!v.tool && wants === "axe";
		u.spear.visible = !!v.tool && wants === "spear";
		if(carrying && u.loadRes !== v.dropResource){
			u.loadRes = v.dropResource;
			u.load.material.color.set(world.resColor(v.dropResource));
		}

		// Asleep: flat out on the ground, breathing.
		if(v.busy && v.task === "sleep" && v.taskPhase === "work"){
			rig.rotation.x = -1.45;
			rig.position.y = 4.5;
			rig.scale.x = 1 + Math.sin(now * 1.5 + v.phase) * 0.06;
			armL.rotation.z = -0.5; armR.rotation.z = 0.5;
			legL.rotation.x = 0.12; legR.rotation.x = -0.12;
			return;
		}

		// Mid-task or on the job: play the motion that fits the work.
		var doing = null;
		if(v.busy && v.taskPhase === "work"){ doing = WORK_ANIM[v.task] || "swing"; }
		else if(!v.busy && v.jobTarget && v.working){ doing = JOB_ANIM[v.jobTarget] || "swing"; }
		if(doing){ this.workPose(u, v, doing, now); return; }

		var tired = v.energy < 35 || v.hunger < 35;

		if(v.moving){
			legL.rotation.x = sw * 0.85;
			legR.rotation.x = -sw * 0.85;
			if(carrying){
				// Hauling: arms out under the load, leaning back against the weight,
				// shorter and heavier steps.
				armL.rotation.x = -1.45; armR.rotation.x = -1.45;
				armL.rotation.z = -0.16; armR.rotation.z = 0.16;
				rig.rotation.x = -0.12;
				rig.position.y = bob * 1.1;
			} else {
				armL.rotation.x = -sw * 0.62;
				armR.rotation.x = sw * 0.62;
				rig.rotation.x = 0.10;
				rig.position.y = bob * 1.8;
				rig.scale.y = 1 + bob * 0.05;      // a touch of stretch at the top of the step
			}
			rig.rotation.z = sw * 0.055;           // rolls from foot to foot
			if(tired){ rig.rotation.x += 0.24; head.rotation.x = 0.3; }
			return;
		}

		// Standing around: breathing, a wandering gaze, and a stretch every few
		// seconds — enough that an idle village never looks like a row of statues.
		var br = Math.sin(now * 1.7 + v.phase) * 0.022;
		rig.scale.y = 1 + br;
		armL.rotation.x = -0.07 + br; armR.rotation.x = -0.07 - br;
		head.rotation.y = Math.sin(now * 0.45 + v.phase) * 0.45;
		var f = (now * 0.5 + v.phase * 2.3) % 7;
		if(f < 1.1){
			var e = Math.sin(f / 1.1 * Math.PI);
			armL.rotation.x = -e * 2.5; armR.rotation.x = -e * 2.5;
			armL.rotation.z = -e * 0.3; armR.rotation.z = e * 0.3;
			rig.rotation.x = -e * 0.18;
			rig.scale.y = 1 + e * 0.07;
		}
		if(tired){
			rig.rotation.x += 0.26;
			head.rotation.x = 0.38;
			armL.rotation.x = -0.02; armR.rotation.x = -0.02;
		}
	},

	// The work motions. Each is a few lines of trig; the point is that you can
	// tell from across the map what someone is doing.
	workPose: function(u, v, kind, now){
		var armL = u.armL, armR = u.armR, legL = u.legL, legR = u.legR, rig = u.rig, head = u.head, t, k;

		if(kind === "swing"){
			// Axe / pick: haul it overhead, then drive it down. The arc deliberately
			// stops short of straight-out-front — the torso folding forward is what
			// carries the blow the rest of the way to the ground.
			t = Math.pow((Math.sin(now * 6.5 + v.phase) + 1) * 0.5, 0.62);
			armL.rotation.x = armR.rotation.x = -2.35 + t * 1.3;
			armL.rotation.z = 0.13; armR.rotation.z = -0.13;
			rig.rotation.x = -0.12 + (1 - t) * 0.62;
			rig.position.y = (1 - t) * 0.9;
			legL.rotation.x = 0.22; legR.rotation.x = -0.22;
		} else if(kind === "claw"){
			// Bare hands on a tree: fast alternating scratching.
			t = Math.sin(now * 12 + v.phase);
			armL.rotation.x = -1.7 + t * 0.55;
			armR.rotation.x = -1.7 - t * 0.55;
			rig.rotation.x = 0.22;
			legL.rotation.x = 0.26; legR.rotation.x = -0.18;
		} else if(kind === "stalk"){
			// Hunting with a spear: brace, wind it back over the shoulder, then drive
			// it forward and lean into the thrust. The previous version held both
			// arms out front and twitched, which read as nothing in particular —
			// certainly not as hunting, and not as a spear being used.
			t = (Math.sin(now * 2.3 + v.phase) + 1) * 0.5;
			k = Math.pow(t, 3.2);                  // long wind-up, fast strike
			rig.scale.y = 0.94;
			rig.rotation.x = 0.1 + k * 0.34;       // lunge in behind it
			rig.position.y = -k * 0.8;
			armR.rotation.x = 0.95 - k * 2.75;     // back past the shoulder -> forward
			armR.rotation.z = -0.18;
			armL.rotation.x = -0.55 - k * 0.95;    // guiding hand out front
			armL.rotation.z = 0.22;
			legL.rotation.x = 0.5 - k * 0.22;      // braced front foot
			legR.rotation.x = -0.42 + k * 0.26;
		} else if(kind === "jog"){
			// Speed training: running on the spot, knees up.
			t = now * 11 + v.phase;
			var s2 = Math.sin(t);
			legL.rotation.x = s2 * 1.15; legR.rotation.x = -s2 * 1.15;
			armL.rotation.x = -s2 * 0.95; armR.rotation.x = s2 * 0.95;
			rig.position.y = Math.abs(Math.cos(t)) * 2.3;
			rig.rotation.x = 0.14;
		} else if(kind === "press"){
			// Strength training: overhead press, sinking under the load.
			t = (Math.sin(now * 3.1 + v.phase) + 1) * 0.5;
			armL.rotation.x = armR.rotation.x = -1.85 - t * 1.15;
			armL.rotation.z = -0.32; armR.rotation.z = 0.32;
			rig.scale.y = 1 - t * 0.07;
			legL.rotation.x = 0.14; legR.rotation.x = -0.14;
		} else if(kind === "jacks"){
			// Cardio: star jumps. Silly on purpose — it reads instantly.
			t = now * 4.6 + v.phase;
			k = (Math.sin(t) + 1) * 0.5;
			armL.rotation.z = -k * 2.45; armR.rotation.z = k * 2.45;
			legL.rotation.z = -k * 0.45; legR.rotation.z = k * 0.45;
			rig.position.y = k * 3.4;
		} else if(kind === "haggle"){
			// Market trader: gesturing at someone who isn't there.
			t = Math.sin(now * 3 + v.phase);
			armL.rotation.x = -1.25 + t * 0.45;
			armR.rotation.x = -1.25 - t * 0.45;
			armL.rotation.z = -0.3; armR.rotation.z = 0.3;
			head.rotation.y = t * 0.35;
			rig.rotation.y = t * 0.12;
		}
	},

	// Redraw a villager's status plate, but only when something actually moved —
	// a canvas upload per villager per frame would be the one real cost here.
	updatePlate: function(mesh, v, now){
		var sig = Math.round(v.energy / 3) + "|" + Math.round(v.hunger / 3) + "|" +
			(v.busy && v.taskPhase === "work" ? Math.round(v.progress * 20) : -1);
		if(sig === mesh.userData.sig){ return; }
		mesh.userData.sig = sig;

		var cv = mesh.userData.cv, g = cv.getContext("2d");
		g.clearRect(0, 0, cv.width, cv.height);
		var y = 12;
		function bar(frac, color, icon){
			g.fillStyle = "rgba(0,0,0,0.55)";
			g.fillRect(44, y, 200, 24);
			g.fillStyle = color;
			g.fillRect(44, y, 200 * Math.max(0, Math.min(1, frac)), 24);
			g.font = "26px sans-serif";
			g.textAlign = "center";
			g.textBaseline = "middle";
			g.fillStyle = "#fff";
			g.fillText(icon, 22, y + 12);
			y += 32;
		}
		if(v.busy && v.taskPhase === "work"){ bar(v.progress, "#6bbf47", "⏳"); }
		if(v.energy < 99.5){
			var e = v.energy / 100;
			bar(e, e > 0.5 ? "#e0c040" : (e > 0.25 ? "#e08a2a" : "#d0402a"), "⚡");
		}
		if(v.hunger < 99.5){
			var hn = v.hunger / 100;
			bar(hn, hn > 0.5 ? "#c9863a" : (hn > 0.25 ? "#c76b28" : "#a33"), "🍖");
		}
		mesh.userData.tex.needsUpdate = true;
		mesh.userData.plate.visible = y > 12;
	},

	// A screen-facing text label at a world point. Used for region names, the
	// Mine / Hunt markers and the "+N wood" floaters.
	// A screen-facing text label. `text` is a string, or an array of
	// {text, px, color} lines to stack on a single texture.
	textSprite: function(text, color, fontPx, x, y, z, widthUnits, depthTest){
		// The canvas is drawn at SS times the nominal size and then scaled down to
		// `widthUnits` in the world. A 1:1 canvas magnified onto a sprite this big
		// goes to mush; the extra texels cost nothing and keep the label crisp
		// when the camera dollies in.
		var SS = 3, pad = 8 * SS, gap = 5 * SS;
		var lines = Array.isArray(text) ? text : [{ text: text, px: fontPx, color: color }];
		var cv = document.createElement("canvas");
		var g = cv.getContext("2d");
		var wide = 0, tall = 0, i;
		for(i = 0; i < lines.length; i++){
			g.font = "bold " + (lines[i].px * SS) + "px sans-serif";
			wide = Math.max(wide, Math.ceil(g.measureText(lines[i].text).width));
			tall += lines[i].px * SS + (i ? gap : 0);
		}
		cv.width = wide + pad * 2;
		cv.height = tall + pad * 2;
		g = cv.getContext("2d");
		g.textAlign = "center";
		g.textBaseline = "middle";
		var yy = pad;
		for(i = 0; i < lines.length; i++){
			var px = lines[i].px * SS;
			g.font = "bold " + px + "px sans-serif";
			g.fillStyle = "rgba(0,0,0,0.6)";
			g.fillText(lines[i].text, cv.width / 2 + 2 * SS, yy + px / 2 + 2 * SS);
			g.fillStyle = lines[i].color;
			g.fillText(lines[i].text, cv.width / 2, yy + px / 2);
			yy += px + gap;
		}

		var tex = new THREE.CanvasTexture(cv);
		tex.colorSpace = THREE.SRGBColorSpace;
		var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: !!depthTest }));
		var w = widthUnits || 90;
		sp.userData.baseW = w;
		sp.userData.baseH = w * cv.height / cv.width;
		sp.scale.set(sp.userData.baseW, sp.userData.baseH, 1);
		sp.position.set(x, y, z);
		sp.renderOrder = depthTest ? 0 : 20;
		return sp;
	},

	// --- reconcile ---------------------------------------------------------

	// Walk each entity list, create meshes for anything new and dispose meshes
	// whose entity is gone. This is what makes a save load or a Reset need no
	// notification from the game.
	sync: function(world, dt, now){
		var self = this, seen;

		if(this.terrainVersion !== world.version){
			this.terrainVersion = world.version;
			this.buildTerrain(world);
		}

		// Buildings — placed on their tile centre so they sit square in the plot.
		seen = new Set();
		world.buildings.forEach(function(b){
			seen.add(b);
			var m = self.bMesh.get(b);
			if(!m){
				m = self.buildingMesh(b);
				self.bMesh.set(b, m);
				self.gBuildings.add(m);
			}
			m.position.set((b.col + 0.5) * world.tileW, 0, (b.row + 0.5) * world.tileH);
			// One-shot spawn pop: the same easeOutBack the 2D view uses, applied to
			// the whole massing so the building grows out of the ground.
			var s = 1;
			if(b.bornAt >= 0){
				var age = now - b.bornAt;
				if(age < 0.45){ s = Math.max(0.01, Anim.easeOutBack(Anim.clamp01(age / 0.45))); }
			}
			m.scale.set(s, s, s);
			// Things that live: the forge breathes, the monument pulses, the mill
			// wheel turns.
			if(m.userData.forge){ m.userData.forge.intensity = 320 + 160 * Anim.pulse(now, 2.2, b.phase); }
			if(m.userData.glow){ m.userData.glow.intensity = 1150 + 420 * Anim.pulse(now, 0.8, b.phase); }
			if(m.userData.wheel){ m.userData.wheel.rotation.z = now * 0.9 + b.phase; }
			// Crops and market canvas bend in the same wind that moves the trees.
			if(m.userData.sway){
				var w = windAt(m.position.x, m.position.z, now);
				for(var q = 0; q < m.userData.sway.length; q++){
					m.userData.sway[q].rotation.z = w * 0.11 + Math.sin(now * 2.4 + q * 0.7 + b.phase) * 0.035;
				}
			}
		});
		this.prune(this.bMesh, this.gBuildings, seen);

		// Trees — growth drives their scale, so a chopped tree visibly shrinks and
		// grows back exactly as the sim says. Instanced, so this is a matrix write
		// per tree rather than a scene-graph node per tree.
		if(this.treeCount !== world.trees.length){ this.buildTrees(world); }
		this.updateTrees(world, dt, now);

		// Villagers.
		seen = new Set();
		world.villagers.forEach(function(v){
			seen.add(v);
			var m = self.vMesh.get(v);
			if(!m){
				m = self.villagerMesh(v);
				self.vMesh.set(v, m);
				self.gVillagers.add(m);
			}
			// The world's (x, y) is a sprite's top-left corner; the figure stands at
			// the middle of its feet. Height belongs to the pose, not the position.
			m.position.set(v.x + world.VW / 2, 0, v.y + world.VH);
			// Turn toward the way they are walking rather than snapping to it, so a
			// villager rounding a corner leans into it.
			var dx = v.tx - v.x, dz = v.ty - v.y;
			if(v.moving && (dx * dx + dz * dz) > 1){ m.userData.faced = Math.atan2(dx, dz); }
			else if(!v.busy && !v.jobTarget){
				// Standing around next to someone else who is also standing around:
				// turn and face them. Two idle villagers staring in random directions
				// look like props; the same two turned toward each other look like
				// they are having a conversation, for the cost of one loop.
				var mate = null, best = 46 * 46;
				for(var q = 0; q < world.villagers.length; q++){
					var o = world.villagers[q];
					if(o === v || o.busy || o.jobTarget || o.moving){ continue; }
					var ox = o.x - v.x, oz = o.y - v.y, d2 = ox * ox + oz * oz;
					if(d2 < best && d2 > 4){ best = d2; mate = o; }
				}
				if(mate){ m.userData.faced = Math.atan2(mate.x - v.x, mate.y - v.y); }
			}
			var turn = m.userData.faced - m.rotation.y;
			while(turn > Math.PI){ turn -= 6.2832; }
			while(turn < -Math.PI){ turn += 6.2832; }
			m.rotation.y += turn * Math.min(1, (dt || 0) * 9);
			// Arrival: a new hire springs up out of the ground, the same easeOutBack
			// a new building uses. Suppressed for villagers restored from a save.
			var vs = 1;
			if(v.bornAt >= 0){
				var age = now - v.bornAt;
				if(age < 0.5){ vs = Math.max(0.01, Anim.easeOutBack(Anim.clamp01(age / 0.5))); }
			}
			m.scale.set(vs, vs, vs);
			self.poseVillager(m, v, world, now);
			// Faces are a couple of pixels across from the tactical view, so they are
			// only drawn once the camera is close enough for them to be anything.
			m.userData.face.visible = self.dist < 460;
			// Status bars stay a constant size on screen, and give up once the view
			// is so far out that twenty of them would just be noise.
			var ps = self.textScale;
			m.userData.plate.scale.set(20 * ps, 10 * ps, 1);
			m.userData.plate.position.y = 37 + 10 * (ps - 1);
			m.userData.ring.visible = (world.selected === v);
			self.updatePlate(m, v, now);
		});
		this.prune(this.vMesh, this.gVillagers, seen);

		// Floaters — "+12 wood" rising off a drop-off. The world ages and removes
		// them; we just mirror the list.
		seen = new Set();
		world.floaters.forEach(function(f){
			seen.add(f);
			var m = self.fMesh.get(f);
			if(!m){
				m = self.textSprite(f.text, f.color, 26, 0, 0, 0, 38);
				self.fMesh.set(f, m);
				self.gFloaters.add(m);
			}
			// Rises straight up from where it was banked — it stays over the spot,
			// which is the whole point of showing it there.
			var age = world.FLOATER_LIFE - f.life;
			m.position.set(f.x + 20, 42 + age * 22, f.y + 20);
			m.scale.set(m.userData.baseW * self.textScale, m.userData.baseH * self.textScale, 1);
			m.material.opacity = Anim.clamp01(f.life / world.FLOATER_LIFE);
		});
		this.prune(this.fMesh, this.gFloaters, seen);
	},

	prune: function(map, group, seen){
		var self = this;
		map.forEach(function(mesh, key){
			if(seen.has(key)){ return; }
			group.remove(mesh);
			self.disposeTree(mesh);
			map.delete(key);
		});
	},

	disposeTree: function(obj){
		obj.traverse(function(o){
			// Face patches share one geometry and one texture per expression across
			// every villager wearing it, so tearing down a single villager must not
			// take the shared copies with it.
			if(o.geometry && o.geometry !== FACE_GEO){ o.geometry.dispose(); }
			if(o.material){
				if(o.material.map && !o.material.map.userData.shared){ o.material.map.dispose(); }
				o.material.dispose();
			}
		});
	},

	// Wood chips off a felled tree.
	chipBurst: function(x, z){
		if(this.dist > 620){ return; }
		for(var i = 0; i < 7; i++){
			var a = Math.random() * 6.2832;
			this.spawnFx("chip", x, 14 + Math.random() * 10, z,
				Math.cos(a) * (20 + Math.random() * 40), 55 + Math.random() * 55,
				Math.sin(a) * (20 + Math.random() * 40), 0.8 + Math.random() * 0.5);
		}
	},

	// --- effects -----------------------------------------------------------

	// Take a mesh from the pool (or make one, up to the cap) and launch it.
	spawnFx: function(kind, x, y, z, vx, vy, vz, scale){
		var cfg = FX_KINDS[kind];
		var fx = null, i;
		for(i = 0; i < this.fx.length; i++){ if(this.fx[i].t >= this.fx[i].life){ fx = this.fx[i]; break; } }
		if(!fx){
			if(this.fx.length >= FX_CAP){ fx = this.fx[0]; }   // oldest gives way
			else {
				fx = { mesh: new THREE.Mesh(FX_GEO(), null) };
				fx.mesh.matrixAutoUpdate = true;
				this.gFx.add(fx.mesh);
				this.fx.push(fx);
			}
		}
		if(!fx.mesh.material || fx.mesh.userData.kind !== kind){
			if(fx.mesh.material){ fx.mesh.material.dispose(); }
			fx.mesh.material = new THREE.MeshLambertMaterial({
				color: cfg.color, transparent: true, depthWrite: false,
			});
			fx.mesh.userData.kind = kind;
		}
		fx.kind = kind;
		fx.t = 0;
		fx.life = cfg.life * (0.75 + Math.random() * 0.5);
		fx.v = { x: vx, y: vy, z: vz };
		fx.s0 = scale || 1;
		fx.mesh.position.set(x, y, z);
		fx.mesh.scale.setScalar(fx.s0);
		fx.mesh.rotation.set(Math.random() * 6.28, Math.random() * 6.28, 0);
		fx.mesh.visible = true;
		return fx;
	},

	updateFx: function(dt){
		for(var i = 0; i < this.fx.length; i++){
			var fx = this.fx[i];
			if(fx.t >= fx.life){ continue; }
			fx.t += dt;
			var p = Math.min(1, fx.t / fx.life);
			var cfg = FX_KINDS[fx.kind];
			fx.v.y += cfg.grav * dt;
			fx.mesh.position.x += fx.v.x * dt;
			fx.mesh.position.y += fx.v.y * dt;
			fx.mesh.position.z += fx.v.z * dt;
			if(fx.mesh.position.y < 0.4){ fx.mesh.position.y = 0.4; fx.v.y = 0; fx.v.x *= 0.7; fx.v.z *= 0.7; }
			fx.mesh.scale.setScalar(Math.max(0.01, fx.s0 * (1 + cfg.grow * p)));
			fx.mesh.material.opacity = 1 - p * p;
			if(p >= 1){ fx.mesh.visible = false; }
		}
	},

	// Chimneys, forges and worked stone give off something continuously. Emitters
	// are declared by the building builders (userData.emit) so a new building
	// smokes by saying so, not by being special-cased here.
	emitFromBuildings: function(world, dt, now){
		var self = this;
		this._emitT = (this._emitT || 0) + dt;
		if(this._emitT < 0.28){ return; }
		var step = this._emitT;
		this._emitT = 0;
		if(this.dist > 700){ return; }   // invisible specks from the tactical view
		this.bMesh.forEach(function(m){
			// A building declares its emitters (emit, emit2) in its builder, so a
			// new one smokes by saying so rather than by being special-cased here.
			self.emitOne(m, m.userData.emit, step, now);
			self.emitOne(m, m.userData.emit2, step, now);
		});
	},

	emitOne: function(m, em, step, now){
		if(!em){ return; }
		if(Math.random() > (em.rate || 1) * step){ return; }
		var p = em.at.clone();
		p.applyMatrix4(m.matrixWorld);
		var w = windAt(p.x, p.z, now);
		this.spawnFx(em.kind, p.x, p.y, p.z,
			(Math.random() - 0.5) * 6 + w * 9,
			em.rise * (0.7 + Math.random() * 0.6),
			(Math.random() - 0.5) * 6,
			em.size || 1);
	},

	// --- birds ---------------------------------------------------------------
	// Three of them, drifting on long ellipses over the valley. Nothing in the
	// game knows or cares — it is here because an empty sky reads as a menu.
	buildBirds: function(world){
		this.birds = [];
		for(var i = 0; i < 3; i++){
			var g = new THREE.Group();
			var body = new THREE.Mesh(new THREE.ConeGeometry(1.4, 6, 4), mat("#43474f"));
			body.rotation.x = Math.PI / 2;
			g.add(body);
			var wl = new THREE.Mesh(new THREE.BoxGeometry(9, 0.6, 3), mat("#43474f"));
			var wr = new THREE.Mesh(new THREE.BoxGeometry(9, 0.6, 3), mat("#43474f"));
			wl.position.x = -4.6; wr.position.x = 4.6;
			g.add(wl, wr);
			g.userData = {
				wl: wl, wr: wr,
				cx: world.W * (0.25 + i * 0.24), cz: world.H * 0.5,
				rx: 220 + i * 70, rz: 120 + i * 30,
				speed: 0.13 + i * 0.035, phase: i * 2.3,
				y: 165 + i * 34,
			};
			this.gBirds.add(g);
			this.birds.push(g);
		}
	},

	updateBirds: function(now){
		for(var i = 0; i < this.birds.length; i++){
			var g = this.birds[i], u = g.userData;
			var a = now * u.speed + u.phase;
			var x = u.cx + Math.cos(a) * u.rx;
			var z = u.cz + Math.sin(a) * u.rz;
			g.position.set(x, u.y + Math.sin(now * 0.6 + u.phase) * 9, z);
			// Face along the tangent of the ellipse they are flying.
			g.rotation.y = Math.atan2(-Math.sin(a) * u.rx, Math.cos(a) * u.rz) + Math.PI / 2;
			var flap = Math.sin(now * 7 + u.phase) * 0.5;
			u.wl.rotation.z = flap;
			u.wr.rotation.z = -flap;
		}
	},

	// --- camera ------------------------------------------------------------

	// What the camera follows: the middle of the villagers, exactly as in 2D.
	focusX: function(world){
		var n = world.villagers.length;
		if(!n){ return world.W * (REGIONS.home.zone[1] / 2); }
		var sum = 0;
		for(var i = 0; i < n; i++){ sum += world.villagers[i].x; }
		return sum / n;
	},

	updateCamera: function(world, dt){
		// Resize to whatever the layout gave the canvas.
		var c = this.canvas;
		var cw = c.clientWidth || 800, ch = c.clientHeight || 450;
		if(this._cw !== cw || this._ch !== ch){
			this._cw = cw; this._ch = ch;
			this.renderer.setSize(cw, ch, false);
			this.camera.aspect = cw / Math.max(1, ch);
			this.camera.updateProjectionMatrix();
		}

		// Ease toward the zoom the wheel asked for, so a notch glides rather than
		// snapping — the tilt rides along with it.
		// The opening view is the whole valley. It can only be worked out once the
		// canvas has a real size, so it happens on the first sized frame.
		if(!this._framed){
			this._framed = true;
			var fit = this.fitZoom(world);
			CAM.zoom = CAM.zoomTarget = fit;
			this.camTargetX = world.W / 2;
			this.camTargetZ = world.H / 2;
		}
		CAM.zoom += (CAM.zoomTarget - CAM.zoom) * Math.min(1, (dt || 0) * CAM.zoomLerp);
		CAM.zoom = Math.max(0, Math.min(1, CAM.zoom));
		var dist = camDist(), elev = camElev();
		this.dist = dist;

		// Edge panning, Warcraft style: hold the pointer against the left or right
		// edge of the map and the view slides that way, faster the further in you
		// push. Sideways only — the world is a wide shallow strip, and the top and
		// bottom edges of the viewport are where the build bar and the work toolbar
		// live, so a cursor there is heading for a button, not asking to scroll.
		//
		// It stays switched off while the whole valley is already on screen: there
		// is nowhere to go, and nudging a view that shows everything is just a way
		// to lose your place.
		var edging = 0;
		// Never on touch. A tap synthesises a mousemove at the point touched and
		// then nothing further — so a tap near the edge would leave the pointer
		// latched there and the map would scroll away forever with nothing to stop
		// it. Edge panning needs a pointer that actually keeps moving.
		if(this.ptr && this.ptr.inside && FINE_POINTER && this.canEdgePan(world)){
			if(this.ptr.x < CAM.edge){ edging = -(1 - this.ptr.x / CAM.edge); }
			else if(this.ptr.x > this.ptr.w - CAM.edge){ edging = 1 - (this.ptr.w - this.ptr.x) / CAM.edge; }
			edging = Math.max(-1, Math.min(1, edging));
		}
		if(edging !== 0){
			this.userPanned = true;   // you are driving now; stop chasing the villagers
			this.camTargetX += edging * dist * CAM.edgeSpeed * (dt || 0);
		}
		if(this.canvas){
			this.canvas.style.cursor = edging < 0 ? "w-resize" : (edging > 0 ? "e-resize" : "");
		}

		// Follow the action along x with the same deadzone feel as the 2D camera:
		// hold still while they work, ease across when they leave the middle.
		if(!this.userPanned){
			var focus = this.focusX(world);
			var span = dist * 0.9 * CAM.deadzone;
			var target = this.camTargetX;
			if(focus < this.camTargetX - span){ target = focus + span; }
			else if(focus > this.camTargetX + span){ target = focus - span; }
			target = Math.max(0, Math.min(world.W, target));
			var k = Math.min(1, (dt || 0) * CAM.lerp);
			this.camTargetX = this._camReady ? this.camTargetX + (target - this.camTargetX) * k : target;
			this._camReady = true;
		}
		// The map is the border. However you got here — following or dragging —
		// the point being looked at stays on the world.
		this.camTargetX = Math.max(0, Math.min(world.W, this.camTargetX));
		this.camTargetZ = Math.max(0, Math.min(world.H, this.camTargetZ));

		var ce = Math.cos(elev), se = Math.sin(elev);
		this.camera.position.set(
			this.camTargetX + Math.sin(CAM.azimuth) * dist * ce,
			se * dist,
			this.camTargetZ + Math.cos(CAM.azimuth) * dist * ce
		);
		// Zoomed right in, look slightly above the ground so the shot is filled by
		// the village rather than by the dirt immediately in front of the lens.
		this.camera.lookAt(this.camTargetX, 26 * (1 - CAM.zoom), this.camTargetZ);
		// Keep the sun anchored to the view so shadows stay inside its shadow map
		// however far the camera pans along the strip.
		this.sun.position.set(this.camTargetX - 300, 500, this.camTargetZ + 280);
		this.sun.target.position.set(this.camTargetX, 0, this.camTargetZ);
		this.sun.target.updateMatrixWorld();
	},

	// Drag horizontally to spin the view, drag vertically to zoom (and so to tilt);
	// shift-drag or middle-drag pans; the wheel zooms. There is no separate pitch
	// control by design — pitch belongs to the zoom, which is what makes the close
	// end feel like walking into the village instead of hovering lower over it.
	// Panning by hand releases the auto-follow; double-click hands it back.
	bindControls: function(c){
		var self = this, drag = null;
		var clampZoom = function(z){ return Math.max(0, Math.min(1, z)); };
		this._onDown = function(e){
			drag = { x: e.clientX, y: e.clientY, pan: e.shiftKey || e.button === 1, moved: 0 };
		};
		this._onMove = function(e){
			if(!drag){ return; }
			var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
			drag.x = e.clientX; drag.y = e.clientY;
			drag.moved += Math.abs(dx) + Math.abs(dy);
			if(drag.pan){
				self.userPanned = true;
				self.camTargetX -= dx * self.dist / 900;
				self.camTargetZ -= dy * self.dist / 900;
			} else {
				CAM.azimuth -= dx * 0.006;
				CAM.zoomTarget = clampZoom(CAM.zoomTarget + dy * 0.0022);
			}
		};
		// Where the pointer is over the map, for edge panning. Tracked separately
		// from the drag handler because it matters when no button is down.
		this._onTrack = function(e){
			var r = c.getBoundingClientRect();
			self.ptr = {
				x: e.clientX - r.left, y: e.clientY - r.top,
				w: r.width, h: r.height,
				inside: e.clientX >= r.left && e.clientX <= r.right &&
				        e.clientY >= r.top && e.clientY <= r.bottom,
			};
		};
		this._onLeave = function(){ self.ptr = null; };

		this._onUp = function(){
			// Remember how far the pointer travelled: a camera drag also fires a
			// click, and that click must not select whatever it happens to land on.
			self._dragDist = drag ? drag.moved : 0;
			drag = null;
		};
		this._onWheel = function(e){
			e.preventDefault();
			// Normalise to pixels — browsers report lines (1) or pages (2) too — then
			// scale by the actual delta. Hard stops at both ends: the zoom parameter
			// cannot leave 0..1, so there is always a nearest and a furthest.
			var d = e.deltaY;
			if(e.deltaMode === 1){ d *= 16; }
			else if(e.deltaMode === 2){ d *= 400; }
			var step = Math.max(-CAM.maxStep, Math.min(CAM.maxStep, (d / 100) * CAM.perWheel));
			CAM.zoomTarget = clampZoom(CAM.zoomTarget + step);
		};
		// Double-click empty ground hands the camera back to the villagers.
		this._onDbl = function(){ self.userPanned = false; };

		c.addEventListener("mousedown", this._onDown);
		c.addEventListener("mousemove", this._onTrack);
		c.addEventListener("mouseleave", this._onLeave);
		window.addEventListener("mousemove", this._onMove);
		window.addEventListener("mouseup", this._onUp);
		c.addEventListener("wheel", this._onWheel, { passive: false });
		c.addEventListener("dblclick", this._onDbl);
		this.bindTouch(c);
	},

	// Touch: one finger drags the map, two fingers pinch to zoom and twist to
	// spin. Deliberately NOT a mirror of the mouse scheme — there is no hover to
	// edge-scroll with and no wheel to zoom with, so the gestures have to carry
	// everything the pointer does on a desktop.
	bindTouch: function(c){
		var self = this, t0 = null, t1 = null, startDist = 0, startZoom = 0, startAng = 0, startAz = 0, moved = 0;

		function pair(e){
			var a = e.touches[0], b = e.touches[1];
			return {
				dist: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY),
				ang: Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX),
			};
		}

		this._onTouchStart = function(e){
			moved = 0;
			if(e.touches.length === 1){
				t0 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
				t1 = null;
			} else if(e.touches.length === 2){
				var p = pair(e);
				t1 = true;
				startDist = p.dist; startAng = p.ang;
				startZoom = CAM.zoomTarget; startAz = CAM.azimuth;
			}
		};

		this._onTouchMove = function(e){
			if(e.touches.length === 1 && t0 && !t1){
				e.preventDefault();
				var dx = e.touches[0].clientX - t0.x, dy = e.touches[0].clientY - t0.y;
				t0 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
				moved += Math.abs(dx) + Math.abs(dy);
				self.userPanned = true;
				// Drag the ground, not the camera: the map follows your finger.
				self.camTargetX -= dx * self.dist / 620;
				self.camTargetZ -= dy * self.dist / 620;
			} else if(e.touches.length === 2){
				e.preventDefault();
				var p = pair(e);
				moved += 8;
				if(startDist > 0){
					// Pinch apart = zoom in. Ratio, not delta, so it feels the same
					// whether your fingers start close together or far apart.
					var ratio = p.dist / startDist;
					CAM.zoomTarget = Math.max(0, Math.min(1, startZoom - Math.log(ratio) * 0.55));
				}
				var dAng = p.ang - startAng;
				while(dAng > Math.PI){ dAng -= 6.2832; }
				while(dAng < -Math.PI){ dAng += 6.2832; }
				CAM.azimuth = startAz + dAng;
			}
		};

		this._onTouchEnd = function(e){
			// A drag must not also count as a tap on whatever was underneath.
			self._dragDist = moved;
			if(e.touches.length < 2){ t1 = null; }
			if(e.touches.length === 0){ t0 = null; self.ptr = null; }
		};

		c.addEventListener("touchstart", this._onTouchStart, { passive: true });
		c.addEventListener("touchmove", this._onTouchMove, { passive: false });
		c.addEventListener("touchend", this._onTouchEnd);
		c.addEventListener("touchcancel", this._onTouchEnd);
	},

	unbindControls: function(){
		var c = this.canvas;
		if(c && this._onDown){
			c.removeEventListener("mousedown", this._onDown);
			c.removeEventListener("mousemove", this._onTrack);
			c.removeEventListener("mouseleave", this._onLeave);
			c.removeEventListener("wheel", this._onWheel);
			c.removeEventListener("dblclick", this._onDbl);
			c.removeEventListener("touchstart", this._onTouchStart);
			c.removeEventListener("touchmove", this._onTouchMove);
			c.removeEventListener("touchend", this._onTouchEnd);
			c.removeEventListener("touchcancel", this._onTouchEnd);
		}
		window.removeEventListener("mousemove", this._onMove);
		window.removeEventListener("mouseup", this._onUp);
	},

	// --- frame + picking ---------------------------------------------------

	frame: function(world, dt, now){
		this.world = world;
		this.updateCamera(world, dt);
		// Text is in world space, so without this it doubles in size every time you
		// zoom in. Damped rather than exact (pow < 1) so labels still shrink a
		// little with distance instead of tiling the screen when zoomed out.
		this.textScale = Math.pow(this.dist / 520, 0.55);
		// Map labels are an overview aid: once the camera is down among the
		// buildings they are in the way, so they fade out.
		this.labelFade = Math.max(0, Math.min(1, (this.dist - 250) / 220));
		for(var i = 0; i < this.labels.length; i++){
			this.labels[i].material.opacity = this.labelFade;
			this.labels[i].visible = this.labelFade > 0.02;
		}
		this.sync(world, dt, now);
		this.updateFx(dt);
		this.updateBirds(now);
		this.emitFromBuildings(world, dt, now);
		this.renderer.render(this.three, this.camera);
	},

	// --- public camera API -------------------------------------------------
	// CAM lives in the module, but the camera is legitimately part of what this
	// renderer offers: the game may want to frame something (the Monument on a
	// win), and it is the one thing worth poking at from the console.

	cam: CAM,
	camDist: function(){ return camDist(); },
	camElev: function(){ return camElev(); },

	// The zoom at which the whole playing area is on screen. Computed from the
	// real viewport and field of view rather than being a magic number, so it
	// stays right on any window shape.
	fitZoom: function(world){
		var w = world || this.world;
		if(!w || !this.camera){ return 0.8; }
		var vFov = this.camera.fov * Math.PI / 180;
		var hFov = 2 * Math.atan(Math.tan(vFov / 2) * (this.camera.aspect || 1.8));
		return zoomForDist((w.W * 0.54) / Math.tan(hFov / 2));   // 0.54 leaves a margin
	},

	// Frame the whole valley: the view you want back whenever you have lost your
	// bearings. Squared up, centred, and no longer chasing anyone.
	resetView: function(world){
		var w = world || this.world;
		if(!w){ return; }
		this.setZoom(this.fitZoom(w));
		CAM.azimuth = 0;
		this.userPanned = true;
		this.camTargetX = w.W / 2;
		this.camTargetZ = w.H / 2;
	},

	// Whether there is anywhere to pan to: at the whole-valley fit there is not,
	// so edge panning stays switched off rather than nudging a view that already
	// shows everything.
	canEdgePan: function(world){
		// Against the TARGET zoom, not the easing one. Otherwise pressing Home with
		// the cursor resting near an edge lets it scroll during the ease out, and
		// the view you just asked to be centred arrives off-centre.
		return CAM.zoomTarget < this.fitZoom(world) - 0.015;
	},

	// Zoom to t in 0..1 (0 = closest and lowest, 1 = furthest and steepest).
	// Anything outside that is clamped — the borders are the point.
	setZoom: function(t, immediate){
		CAM.zoomTarget = Math.max(0, Math.min(1, t));
		if(immediate){ CAM.zoom = CAM.zoomTarget; }
	},

	// Point the camera at a spot on the map and stop following the villagers.
	// Pass no arguments to hand the follow back.
	focusOn: function(x, z){
		if(x === undefined){ this.userPanned = false; return; }
		this.userPanned = true;
		this.camTargetX = x;
		if(z !== undefined){ this.camTargetZ = z; }
	},

	// True when the click that just arrived was the tail of a camera drag. The 2D
	// renderer has no such gesture and simply omits this method.
	swallowClick: function(){
		var moved = this._dragDist || 0;
		this._dragDist = 0;
		return moved > 5;
	},

	// Cast a ray from the clicked pixel into the village and return the villager
	// it hits, if any — the 3D counterpart of the 2D box hit-test.
	pick: function(clientX, clientY){
		if(!this.canvas || !this.world){ return null; }
		var rect = this.canvas.getBoundingClientRect();
		this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
		this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
		this.raycaster.setFromCamera(this.pointer, this.camera);
		var hits = this.raycaster.intersectObjects(this.gVillagers.children, true);
		for(var i = 0; i < hits.length; i++){
			var o = hits[i].object;
			while(o && !o.userData.villager){ o = o.parent; }
			if(o && o.userData.villager){ return o.userData.villager; }
		}
		return null;
	},
};

window.Render3D = Render3D;
