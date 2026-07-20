// Author Petter Andersson
"use strict"

// Entry point + shared UI helpers. Game data lives in data/registry.js; the
// per-system renderers live in bars.js / shops.js / jobs.js / energy.js.
// (The old free-text TODO list that lived here now lives in ROADMAP.md.)

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
// purchase, with have/need progress, so the opening always has an obvious target.
// Ordered milestones; the first unmet one is shown. Re-run from set() on any change.
var NEXT_GOALS = [
	{ key: "hireVillager", done: function(){ return state.villagers >= 2; } },
	{ key: "lumberMill",   done: function(){ return state.lumberMill >= 1; } },
	{ key: "mine",         done: function(){ return state.mine >= 1; } },
	{ key: "huntingLodge", done: function(){ return state.huntingLodge >= 1; } },
	{ key: "houses",       done: function(){ return state.villagers >= 4; } },
];

function updateNextGoal(){
	var el = document.getElementById("nextGoal");
	if(!el || typeof SHOP_ITEMS === "undefined"){ return; }
	var goal = null;
	for(var i = 0; i < NEXT_GOALS.length; i++){
		if(!NEXT_GOALS[i].done()){ goal = NEXT_GOALS[i]; break; }
	}
	if(!goal){ el.className = ""; el.innerHTML = "🏆 Next: build the Monument"; return; }
	var item = SHOP_ITEMS[goal.key];
	var ready = canAfford(item.cost) && (!item.canBuy || item.canBuy());
	el.className = ready ? "ngReady" : "";
	if(ready){
		el.innerHTML = "Next: <span class='ngName'>" + item.name + "</span> — ready! (open 🛒 Shop)";
		return;
	}
	var parts = [];
	for(var k in item.cost){ parts.push(Math.min(state[k], item.cost[k]) + "/" + item.cost[k] + " " + k); }
	el.innerHTML = "Next: <span class='ngName'>" + item.name + "</span> — " + parts.join(", ");
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
