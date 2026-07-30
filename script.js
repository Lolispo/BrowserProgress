// Author Petter Andersson
"use strict"

// Entry point + shared UI helpers. Game data lives in data/registry.js; the
// per-system renderers live in bars.js / shops.js / jobs.js / energy.js.
// (The old free-text TODO list that lived here now lives in TODO.md.)

$(document).ready(function(){
	var loaded = (typeof loadGame === "function") && loadGame();
	initValues(loaded);
	assignHotkeys();       // set .key on ACTIONS/SCOUTS before the bars render badges
	initBars();
	initScouts();
	initShopButtons();
	initJobsButtons();
	initTooltips();
	initHotkeys();
	initDevMode();
	initUI();
	if(loaded){ rebuildUI(); } else { updateGoal(); }
	updateNextGoal();
	if(typeof startAutoSave === "function"){ startAutoSave(); }

	$(document.getElementById("victoryClose")).on("click", function(){
		$("#victoryOverlay").toggleClass("hidden", true);
	});
	$(document.getElementById("resetGame")).on("click", function(){
		if(window.confirm("Reset all progress?")){ resetGame(); }
	});
});

// Live goal tracker: Monument materials have/need, with locked resources masked
// until their region is claimed. Called from set() on any resource change.
function updateGoal(){
	var el = document.getElementById("goalMaterials");
	if(!el || typeof SHOP_ITEMS === "undefined"){ return; }
	var cost = SHOP_ITEMS.monument.cost;
	var unlock = { stone: "hills", gold: "mountains", crystal: "cavern" };
	var parts = [];
	for(var k in cost){
		if(unlock[k] && !state.regions[unlock[k]]){
			parts.push(k + ": 🔒");
		} else {
			parts.push(k + ": " + Math.min(state[k], cost[k]) + "/" + cost[k]);
		}
	}
	el.innerHTML = parts.join("<br>");
}

// Next-goal HUD hint: a persistent north-star pointing at the recommended next
// step, with progress, so there's always an obvious target — right through the
// mid/late chain (build Mine -> scout Hills -> Quarry + Mason for stone ->
// Blacksmith -> scout Mountains -> Market + Trader -> scout Cavern -> Monument),
// not just the opening. Ordered; the first unmet step is shown. Re-run from set().

// A purchasable step: shows "ready! (open Shop)" or the resource shortfall.
function goalBuy(key){
	var item = SHOP_ITEMS[key];
	var ready = canAfford(item.cost) && (!item.canBuy || item.canBuy());
	if(ready){ return { ready: true, html: "<span class='ngName'>" + item.name + "</span> — ready! (open 🛒 Shop)" }; }
	var parts = [];
	for(var k in item.cost){ parts.push(Math.min(state[k], item.cost[k]) + "/" + item.cost[k] + " " + k); }
	return { ready: false, html: "<span class='ngName'>" + item.name + "</span> — " + parts.join(", ") };
}

// A free-text guidance step (assign a job, mine crystal, grow population).
function goalHint(name, tail){ return { ready: false, html: "<span class='ngName'>" + name + "</span> — " + tail }; }

// A scout step: nudge toward the population it needs, then to the Expeditions bar.
function goalScout(regionId){
	var s = SCOUTS[regionId], needV = 0;
	for(var i = 0; i < s.requires.length; i++){ if(s.requires[i].key === "villagers"){ needV = s.requires[i].min; } }
	var label = "Scout the " + REGIONS[regionId].label;
	if(state.villagers < needV){ return goalHint(label, "grow to " + needV + " villagers (" + state.villagers + "/" + needV + ")"); }
	return { ready: true, html: "<span class='ngName'>" + label + "</span> — ready in Expeditions (bottom bar)" };
}

// A "assign someone to this job" step. It clears as soon as the job is staffed,
// and also once you've banked the stockpile that job exists to build — so a
// one-off like the Mason doesn't have to stay assigned forever to stay cleared
// (the milestone below makes it stick either way). `need` shows what the pile
// is *for*, so the step has a visible finish line rather than an open-ended nag.
function goalJob(job, resource, need, forWhat){
	var have = Math.min(state[resource], need);
	return goalHint("Assign a " + job,
		"open 👷 Jobs and add a " + job + " — " + have + "/" + need + " " + resource + " for the " + forWhat);
}

// Ordered; the first step that isn't done is the one shown. Each carries an `id`
// so updateNextGoal can bank it permanently once cleared (see state.milestones).
var NEXT_GOALS = [
	{ id: "hire",      done: function(){ return state.villagers >= 2; },      get: function(){ return goalBuy("hireVillager"); } },
	{ id: "lumber",    done: function(){ return state.lumberMill >= 1; },     get: function(){ return goalBuy("lumberMill"); } },
	{ id: "lodge",     done: function(){ return state.huntingLodge >= 1; },   get: function(){ return goalBuy("huntingLodge"); } },
	{ id: "mine",      done: function(){ return state.mine >= 1; },           get: function(){ return goalBuy("mine"); } },
	{ id: "pop4",      done: function(){ return state.villagers >= 4; },      get: function(){ return goalHint("Grow to 4 villagers", "hire more / build Farm Houses — needed to scout the Hills"); } },
	{ id: "hills",     done: function(){ return !!state.regions.hills; },     get: function(){ return goalScout("hills"); } },
	{ id: "quarry",    done: function(){ return state.quarry >= 1; },         get: function(){ return goalBuy("quarry"); } },
	{ id: "mason",     done: function(){ return state.mason >= 1 || state.stone >= SHOP_ITEMS.blacksmith.cost.stone; },
	                                                                         get: function(){ return goalJob("Mason", "stone", SHOP_ITEMS.blacksmith.cost.stone, "Blacksmith"); } },
	{ id: "blacksmith",done: function(){ return state.blacksmith >= 1; },     get: function(){ return goalBuy("blacksmith"); } },
	{ id: "mountains", done: function(){ return !!state.regions.mountains; }, get: function(){ return goalScout("mountains"); } },
	{ id: "market",    done: function(){ return state.market >= 1; },         get: function(){ return goalBuy("market"); } },
	{ id: "trader",    done: function(){ return state.trader >= 1 || state.gold >= SHOP_ITEMS.monument.cost.gold; },
	                                                                         get: function(){ return goalJob("Trader", "gold", SHOP_ITEMS.monument.cost.gold, "Monument"); } },
	{ id: "cavern",    done: function(){ return !!state.regions.cavern; },    get: function(){ return goalScout("cavern"); } },
	{ id: "crystal",   done: function(){ return state.crystal >= SHOP_ITEMS.monument.cost.crystal; }, get: function(){ return goalHint("Mine Crystal", "use the Mine Crystal action bar to gather Crystal for the Monument"); } },
	{ id: "monument",  done: function(){ return state.monument >= 1; },       get: function(){ return goalBuy("monument"); } },
];

function updateNextGoal(){
	var el = document.getElementById("nextGoal");
	if(!el || typeof SHOP_ITEMS === "undefined"){ return; }
	if(!state.milestones){ state.milestones = {}; }
	var goal = null;
	for(var i = 0; i < NEXT_GOALS.length; i++){
		var step = NEXT_GOALS[i];
		if(state.milestones[step.id]){ continue; }   // banked — never shown again
		if(step.done()){ state.milestones[step.id] = true; continue; }
		goal = step; break;
	}
	if(!goal){ el.className = "ngReady"; el.innerHTML = "🏆 Village complete!"; return; }
	var g = goal.get();
	el.className = g.ready ? "ngReady" : "";
	el.innerHTML = "Next: " + g.html;
}

// Equipment overlay: one row per pooled tool with its durability. Tools are a
// shared pool (not per-villager), so this lists the pool, not owners.
function updateEquipmentPanel(){
	var el = document.getElementById("equipList");
	if(!el){ return; }
	el.innerHTML =
		"<div class='equipHead'>🪓 Axes (" + state.axes.length + ")</div>" + toolRows(state.axes) +
		"<div class='equipHead'>🗡️ Spears (" + state.spears.length + ")</div>" + toolRows(state.spears);
}

function toolRows(arr){
	if(!arr.length){ return "<div class='equipRow'><span class='equipNone'>none</span></div>"; }
	var html = "";
	for(var i = 0; i < arr.length; i++){
		var d = Math.max(0, Math.round(arr[i].dur));
		var col = d > 50 ? "#2e7d32" : (d > 25 ? "#e08a2a" : "#d0402a");
		html += "<div class='equipRow'>" +
			"<span class='equipName'>#" + (i + 1) + (arr[i].inUse ? " · in use" : "") + "</span>" +
			"<span class='equipBar'><span class='equipFill' style='width:" + d + "%;background:" + col + "'></span></span>" +
			"<span class='equipPct'>" + d + "%</span></div>";
	}
	return html;
}

// --- Villager inspect panel (opened by clicking a villager; see ui.js) -------
// Structure + action buttons are built ONCE on open (buttons bound once, so the
// ~4x/sec live refresh can never eat a click); refreshVillagerPanel() updates
// only the numbers/bars/status while the panel is open.
function openVillagerPanel(){
	var v = scene.selected;
	var body = document.getElementById("villagerBody");
	if(!v || !body){ return; }
	document.getElementById("villagerTitle").innerHTML = "Villager #" + (scene.villagers.indexOf(v) + 1);
	body.innerHTML =
		"<div class='vStats'>" +
			"<span class='vStat'>🏃 Speed <b id='vSpeed'>-</b></span>" +
			"<span class='vStat'>💪 Strength <b id='vStr'>-</b></span>" +
			"<span class='vStat'>🫀 Cardio <b id='vCardio'>-</b></span>" +
		"</div>" +
		vMeter("Energy", "vEnergyFill", "#e0c040") +
		vMeter("Hunger", "vHungerFill", "#c9863a") +
		"<p class='vStatus' id='vStatus'></p>" +
		"<div class='vActions' id='vActions'></div>" +
		"<button type='button' class='btn btnSmall vCancel' id='vCancel'>✖ Cancel task</button>";
	var acts = [];
	if(state.trainingYard > 0){
		acts.push(["trainSpeed", "🏃 Train Speed"], ["trainStrength", "💪 Train Strength"], ["trainCardio", "🫀 Train Cardio"]);
	}
	acts.push(["sleep", "😴 Sleep"]);
	document.getElementById("vActions").innerHTML = acts.map(function(a){
		return "<button type='button' class='btn btn-default btnSmall vAct' data-act='" + a[0] + "'>" + a[1] + "</button>";
	}).join("");
	$("#vActions .vAct").each(function(){
		var id = this.getAttribute("data-act");
		$(this).on("click", function(){ dispatchActionFor(scene.selected, id); });
	});
	// Bound once, like the dispatch buttons — the ~4x/sec refresh only toggles its
	// enabled state, so the live update can never eat the click.
	$("#vCancel").on("click", function(){
		var v = scene.selected;
		if(v && scene.cancelTask(v)){ newMsg("Called the villager back"); }
		if(typeof refreshQueueBadges === "function"){ refreshQueueBadges(); }
		refreshVillagerPanel();
	});
	refreshVillagerPanel();
}

function vMeter(label, fillId, color){
	return "<div class='vMeter'><span class='vMeterLabel'>" + label + "</span>" +
		"<span class='vMeterBar'><span class='vMeterFill' id='" + fillId + "' style='background:" + color + "'></span></span></div>";
}

function refreshVillagerPanel(){
	var v = scene.selected;
	if(!v || $("#villagerOverlay").hasClass("hidden") || !document.getElementById("vSpeed")){ return; }
	document.getElementById("vSpeed").innerHTML = Math.round(v.stats.speed);
	document.getElementById("vStr").innerHTML = Math.round(v.stats.strength);
	document.getElementById("vCardio").innerHTML = Math.round(v.stats.cardio);
	$("#vEnergyFill").css("width", Math.max(0, v.energy) + "%");
	$("#vHungerFill").css("width", Math.max(0, v.hunger) + "%");
	document.getElementById("vStatus").innerHTML = villagerStatus(v);
	// Cancel is only meaningful mid-task; on the return leg the work is already
	// banked, so it stays disabled and the title says why.
	var btn = document.getElementById("vCancel");
	if(btn){
		var can = scene.canCancel(v);
		btn.disabled = !can;
		btn.title = can ? "Abort this task and walk home empty-handed"
			: (v.busy ? "Already done — they're carrying it home" : "Not on a task");
	}
}

// Human-readable status line: which leg of which action, by label not raw id.
function villagerStatus(v){
	if(v.busy){
		var label = (typeof ACTIONS !== "undefined" && ACTIONS[v.task] && ACTIONS[v.task].label) || v.task || "";
		var phase = { walk: "Walking to", work: "Working", "return": "Carrying home" }[v.taskPhase] || "Working";
		return phase + ": " + label;
	}
	return v.jobTarget ? ("Working a " + v.jobTarget + " job") : "Idle";
}

// Show the win overlay when the Monument is built.
function showVictory(){
	document.getElementById("victoryStats").innerHTML =
		"Villagers: " + state.villagers + " · Regions claimed: all 4";
	$("#victoryOverlay").toggleClass("hidden", false);
}

function initValues(loaded){

	// A fresh game (and Reset) starts honest at zero. Use the dev speed toggle
	// (backtick) to grind fast when testing rather than a free resource grant.

	// Push initial state to the screen
	set("wood", state.wood);
	set("iron", state.iron);
	set("food", state.food);
	set("villagers", state.villagers);
	set("houses", state.houses);
	set("unemployed", state.unemployed);
	set("woodCutter", state.woodCutter);
	set("ironWorker", state.ironWorker);
	set("hunter", state.hunter);

	// Init the tool readouts (energy is now per-villager, see scene.js)
	updateToolDisplay();

	document.getElementById("shopName").innerHTML = "Shop - Main";

	// Init canvas; scene.init loads sprites from the SPRITES manifest.
	var c = document.getElementById("canvas1");
	ctx = c.getContext("2d");

	// Hand the canvas to the animated scene and start the render loop. The loop
	// redraws every frame, so sprite images that are still loading simply appear
	// on a later frame (no cold-load race to guard against anymore).
	scene.init(c, ctx);
	scene.start();

	// Fresh game: spawn the starting villager entities to match the count.
	// (A loaded game rebuilds them from state in rebuildUI/scene.rebuildFromState.)
	if(!loaded){
		scene.addBuilding("house", { animate: false }); // starting dwelling (the 2 base housing slots)
		for(var v = 0; v < state.villagers; v++){ scene.addVillager(); }
		$("#unemployed").toggleClass("bold", state.unemployed > 0);
	}
}

function newMsg(msg){
	document.getElementById("3rdMsg").innerHTML = document.getElementById("prevMsg").innerHTML;
	document.getElementById("prevMsg").innerHTML = document.getElementById("printText").innerHTML;
	document.getElementById("printText").innerHTML = msg;
	console.log(msg);
}

// Refresh the tool readouts: count + a durability bar showing the most-worn tool
// (the one about to break). Tools are per-worker arrays now (see data/registry.js).
function updateToolDisplay(){
	toolReadout(state.axes, "axe", "Axe", "axeDurabilityBar");
	toolReadout(state.spears, "spear", "Spear", "spearDurabilityBar");
	if(typeof updateEquipmentPanel === "function"){ updateEquipmentPanel(); }
}

function toolReadout(arr, countId, label, barId){
	var el = document.getElementById(countId);
	if(el){ el.innerHTML = arr.length; }
	var minDur = arr.length ? Math.min.apply(null, arr.map(function(t){ return t.dur; })) : 0;
	$('#' + barId + '_innerdiv').css("width", Math.max(0, minDur) + "%");
	$('#' + barId + '_innertext').text(arr.length ? (label + " Durability " + Math.round(minDur) + "%") : ("No " + label + " Available"));
	$('#' + barId + '_innertext').toggleClass("innerTextRed", arr.length === 0);
}
