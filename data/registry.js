// Author Petter Andersson
"use strict"

// ===========================================================================
// Central game state + data registries.
//
// This file is the single source of truth for the game. The rest of the code
// (bars.js, shops.js, jobs.js, energy.js) are thin renderers that read from
// the `state` object and the ACTIONS / SHOP_ITEMS registries defined here.
//
// Load order matters: this file loads after variables.js (which holds the
// tuning constants the behaviour functions read) and before the renderers.
// ===========================================================================


// ---------------------------------------------------------------------------
// State: every mutable value in one place. Keys mirror the DOM element ids
// they are displayed in, so set() can update the value and the screen at once.
// ---------------------------------------------------------------------------
var state = {
	// Resources
	wood: 0, iron: 0, food: 0,
	// Phase 3 gating resources (revealed as regions are claimed)
	stone: 0, gold: 0, crystal: 0,
	// Equipment: each tool is { dur: 0-100, inUse: bool }. One tool per worker.
	axes: [{ dur: 100, inUse: false }],
	spears: [{ dur: 100, inUse: false }],
	// Buildings + housing capacity
	houses: 2, housesBuilt: 0, lumberMill: 0, mine: 0, huntingLodge: 0, trainingYard: 0,
	// Phase 3 buildings
	quarry: 0, farm: 0, blacksmith: 0, market: 0, monument: 0,
	// Population / jobs (start with one villager — the actor for manual work)
	villagers: 1, unemployed: 1, woodCutter: 0, ironWorker: 0, hunter: 0,
	mason: 0, trader: 0,
	// Player stats (global). Energy is now per-villager (see scene.js), not here.
	speed: 100, strength: 100, cardio: 100,
	// Claimed regions (home is free; the rest are scouted). See REGIONS.
	regions: { home: true, hills: false, mountains: false, cavern: false },
};

// Resource keys drive shop affordability colouring; changing one refreshes the shop.
var RESOURCE_KEYS = ["wood", "iron", "food", "stone", "gold", "crystal"];

// ---------------------------------------------------------------------------
// REGIONS registry — the horizontal map zones. `zone` is a [start, end]
// fraction of the canvas width; `resource` is the gating resource the region
// introduces (home introduces none). Drawn left -> right in REGION_ORDER.
// ---------------------------------------------------------------------------
var REGION_ORDER = ["home", "hills", "mountains", "cavern"];
var REGIONS = {
	home:      { label: "Home",           resource: null,      zone: [0.00, 0.30], tint: "#3fbf3f" },
	hills:     { label: "Hills",          resource: "stone",   zone: [0.30, 0.52], tint: "#c9b37e" },
	mountains: { label: "Mountains",      resource: "gold",    zone: [0.52, 0.74], tint: "#9aa0a6" },
	cavern:    { label: "Crystal Cavern", resource: "crystal", zone: [0.74, 1.00], tint: "#4a3b63" },
};

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------

// Abbreviate large numbers for display (12345 -> "12.3k", 2000000 -> "2M").
// Small values stay exact. State always holds the raw number; this is display only.
function formatNum(n){
	if(typeof n !== "number"){ return n; }
	var a = Math.abs(n);
	if(a >= 1e6){ return (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M"; }
	if(a >= 1e4){ return (n / 1e3).toFixed(1).replace(/\.?0+$/, "") + "k"; }
	return "" + n;
}

// Set a state value and mirror it into the DOM node sharing its id (if present).
function set(key, val){
	state[key] = val;
	var el = document.getElementById(key);
	if(el){ el.innerHTML = formatNum(val); }
	if(RESOURCE_KEYS.indexOf(key) !== -1){
		if(typeof refreshShopColors === "function"){ refreshShopColors(); }
		if(typeof updateGoal === "function"){ updateGoal(); }
	}
}

// Requirements are data: [{key, min}] -> true when every state[key] >= min.
function meetsRequirements(requires){
	if(!requires){ return true; }
	for(var i = 0; i < requires.length; i++){
		if(state[requires[i].key] < requires[i].min){ return false; }
	}
	return true;
}

// Cost is data: {wood: 50, iron: 10} checked/paid against state.
function canAfford(cost){
	if(!cost){ return true; }
	for(var k in cost){ if(state[k] < cost[k]){ return false; } }
	return true;
}
function payCost(cost){
	for(var k in cost){ set(k, state[k] - cost[k]); }
}

// "50 wood + 10 iron" from a cost object, for button labels and tooltips.
function costToText(cost){
	var parts = [];
	for(var k in cost){ parts.push(cost[k] + " " + k); }
	return parts.join(" + ");
}

// Resource gathered per action: strength-scaled, with a +15% Blacksmith bonus each.
function gatherAmount(base){
	return Math.round(base * (state.strength / 100.0) * (1 + 0.15 * state.blacksmith));
}

// Equipment durability damage per use: a Blacksmith softens it to 60%.
function equipDamage(base){
	return Math.round(base * (state.blacksmith > 0 ? 0.6 : 1));
}

// Tools: the most-durable tool not currently reserved by an in-flight action.
function freeTool(arr){
	var best = null;
	for(var i = 0; i < arr.length; i++){
		if(!arr[i].inUse && (!best || arr[i].dur > best.dur)){ best = arr[i]; }
	}
	return best;
}
function freeAxe(){ return freeTool(state.axes); }
function freeSpear(){ return freeTool(state.spears); }


// ---------------------------------------------------------------------------
// ACTIONS registry — the clickable progress bars in the middle "Work" column.
//
// Each entry carries display data (label, tooltip, requires) plus behaviour:
//   maxTime() -> base duration in ms before the speedRatio scaling
//   onStart() -> cost paid the instant the bar is clicked (durability / energy)
//   onDone()  -> effect applied when the bar fills to 100%
// requires replaces the old eval()-on-variable-name clickability check.
// ---------------------------------------------------------------------------
var ACTIONS = {
	chopWood: {
		barId: "woodBar",
		label: "Chop wood",
		tooltip: "Chop wood from the forest. Needs an axe; each chop wears it down.",
		requires: [],
		tool: "axe", toolDmg: axeWoodDmg, yields: "wood",
		startsHidden: false,
		energyCost: 8,
		maxTime: function(){ return Math.floor(woodSpeed / state.speed); },
		onStart: function(){},
		onDone: function(){
			set("wood", state.wood + gatherAmount(woodInc));
			scene.chopTree();
			newMsg("Gathered Wood!");
		},
	},
	mineIron: {
		barId: "ironBar",
		label: "Mine Iron",
		tooltip: "Mine iron ore. Needs an axe; each swing wears it down.",
		requires: [],
		tool: "axe", toolDmg: axeIronDmg, yields: "iron",
		startsHidden: false,
		energyCost: 10,
		maxTime: function(){ return Math.floor(ironSpeed / state.speed); },
		onStart: function(){},
		onDone: function(){
			set("iron", state.iron + gatherAmount(ironInc));
			newMsg("Gathered Iron!");
		},
	},
	hunt: {
		barId: "huntBar",
		label: "Go Hunting",
		tooltip: "Hunt for food. Needs a spear. Success scales with strength; tiring.",
		requires: [],
		tool: "spear", toolDmg: spearHuntDmg, yields: "food",
		startsHidden: false,
		energyCost: 25,
		maxTime: function(){ return Math.floor(huntSpeed / state.speed); },
		onStart: function(){},
		onDone: function(){
			var successRate = successHuntRate * (state.strength / 100.0);
			var roll = Math.floor((Math.random() * 100) + 1);
			if(roll < successRate){
				set("food", state.food + foodInc);
				newMsg("Hunted Successfully!");
			} else {
				newMsg("Hunt failed! (" + roll + "/100 - needed " + Math.round(successRate) + ")");
			}
		},
	},
	clawTree: {
		barId: "clawTreeBar",
		label: "Claw Tree",
		tooltip: "Claw wood by hand. No axe needed, but slow and very tiring.",
		requires: [],
		yields: "wood",
		startsHidden: false,
		energyCost: 15,
		maxTime: function(){ return Math.floor(clawTreeSpeed / state.speed); },
		onStart: function(){},
		onDone: function(){
			set("wood", state.wood + gatherAmount(clawInc));
			scene.chopTree();
			newMsg("Clawed some wood!");
		},
	},
	trainSpeed: {
		barId: "speedBar",
		label: "Train Speed",
		tooltip: "Train speed. Faster speed shortens every gathering action. Tiring.",
		requires: [],
		startsHidden: true,
		energyCost: 20,
		maxTime: function(){ return speedSpeed; },
		onStart: function(){},
		onDone: function(){ set("speed", state.speed + speedInc); newMsg("Improved your speed!"); },
	},
	trainStrength: {
		barId: "strengthBar",
		label: "Train Strength",
		tooltip: "Train strength. Higher strength increases resources gathered per action. Tiring.",
		requires: [],
		startsHidden: true,
		energyCost: 20,
		maxTime: function(){ return strengthSpeed; },
		onStart: function(){},
		onDone: function(){ set("strength", state.strength + strengthInc); newMsg("Improved your strength!"); },
	},
	trainCardio: {
		barId: "cardioBar",
		label: "Train Cardio",
		tooltip: "Train cardio. Higher cardio makes villagers recover energy faster. Tiring.",
		requires: [],
		startsHidden: true,
		energyCost: 20,
		maxTime: function(){ return cardioSpeed; },
		onStart: function(){},
		onDone: function(){ set("cardio", state.cardio + cardioInc); newMsg("Improved your cardio!"); },
	},
	mineCrystal: {
		barId: "crystalBar",
		label: "Mine Crystal",
		tooltip: "Personally mine rare crystal from the Cavern. Slow, but the Monument needs it.",
		requires: [],
		yields: "crystal",
		startsHidden: true, // revealed when the Crystal Cavern is claimed
		rawTime: true,
		energyCost: 12,
		maxTime: function(){ return 6000; },
		onStart: function(){},
		onDone: function(){ set("crystal", state.crystal + 1); newMsg("Mined a Crystal!"); },
	},
	sleep: {
		barId: "sleepBar",
		label: "Go to Sleep",
		tooltip: "Send the most-tired free villager to rest, restoring their energy to full.",
		requires: [],
		startsHidden: false,
		rawTime: true,
		energyCost: -100, // negative cost = restores energy (see scene.completeTask)
		maxTime: function(){ return 3000; },
		onStart: function(){},
		onDone: function(){ newMsg("Fully rested!"); },
	},
};


// ---------------------------------------------------------------------------
// SHOP_ITEMS registry — the buyable buttons in the shop column.
//
// Each entry carries: btnId, name, category (main|equipment|resources|houses),
// cost {}, an authored tooltip, an optional requires/canBuy gate, and onBuy().
// The button label is generated as "Name (cost)" so price text can never drift
// out of sync with the actual cost.
// ---------------------------------------------------------------------------
var SHOP_ITEMS = {
	hireVillager: {
		btnId: "hireVillagerShop",
		name: "Hire Villager",
		category: "main",
		cost: { food: 20 },
		tooltip: "Hire a villager. Needs a free house. Villagers can be assigned to jobs for passive income.",
		canBuy: function(){ return state.villagers + 1 <= state.houses; },
		onBlocked: function(){ newMsg("Requires more houses"); },
		onBuy: function(){
			increaseVillagers();
			scene.addVillager();
			newMsg("Hired a villager!");
		},
	},
	axe: {
		btnId: "axeShop",
		name: "Axe",
		category: "goods",
		key: "a",
		cost: { wood: 50, iron: 10 },
		tooltip: "Buy an axe. Required to chop wood and mine iron. One tool per worker.",
		onBuy: function(){
			state.axes.push({ dur: 100, inUse: false });
			updateToolDisplay();
			newMsg("Bought Axe!");
		},
	},
	tradeAxe: {
		btnId: "tradeAxeShop",
		name: "Axe",
		category: "goods",
		cost: { food: 10 },
		tooltip: "Trade food for an axe. An alternate path when you have food but no wood/iron.",
		onBuy: function(){
			state.axes.push({ dur: 100, inUse: false });
			updateToolDisplay();
			newMsg("Bought Axe!");
		},
	},
	spear: {
		btnId: "spearShop",
		name: "Spear",
		category: "goods",
		cost: { wood: 130 },
		tooltip: "Buy a spear. Required for hunting. One tool per worker.",
		onBuy: function(){
			state.spears.push({ dur: 100, inUse: false });
			updateToolDisplay();
			newMsg("Bought Spear!");
		},
	},
	food: {
		btnId: "tradeFoodShop",
		name: "Buy Food",
		category: "goods",
		cost: { wood: 100 },
		tooltip: "Trade wood for " + foodShopInc + " food. Food hires villagers.",
		onBuy: function(){ set("food", state.food + foodShopInc); newMsg("Bought " + foodShopInc + " Food"); },
	},
	houses: {
		btnId: "buildHousesShop",
		name: "Build Farm Houses",
		category: "houses",
		cost: { wood: 600, iron: 100 },
		tooltip: "Build houses (+" + houseShopInc + " housing). Housing caps how many villagers you can have.",
		onBuy: function(){
			set("housesBuilt", state.housesBuilt + 1);
			set("houses", state.houses + houseShopInc);
			scene.addBuilding("house");
			newMsg("Built more houses!");
		},
	},
	lumberMill: {
		btnId: "buildLumberMillShop",
		name: "Build LumberMill",
		category: "houses",
		cost: { wood: 500, iron: 100 },
		tooltip: "Build a lumber mill. Unlocks the WoodCutter job for passive wood income.",
		onBuy: function(){
			set("lumberMill", state.lumberMill + 1);
			$("#jobColumn").toggleClass("hidden", false);
			$("#jobWoodCutter").toggleClass("hidden", false);
			scene.addBuilding("lumberMill");
			newMsg("Built a LumberMill!");
		},
	},
	mine: {
		btnId: "buildMineShop",
		name: "Build Mine",
		category: "houses",
		cost: { wood: 500, iron: 150 },
		tooltip: "Build a mine. Unlocks the IronWorker job for passive iron income.",
		onBuy: function(){
			set("mine", state.mine + 1);
			$("#jobColumn").toggleClass("hidden", false);
			$("#jobIronWorker").toggleClass("hidden", false);
			scene.addBuilding("mine");
			newMsg("Built a Mine!");
		},
	},
	huntingLodge: {
		btnId: "buildHuntingLodgeShop",
		name: "Build HuntingLodge",
		category: "houses",
		cost: { wood: 800, iron: 200 },
		tooltip: "Build a hunting lodge. Unlocks the Hunter job for passive food income.",
		onBuy: function(){
			set("huntingLodge", state.huntingLodge + 1);
			$("#jobColumn").toggleClass("hidden", false);
			$("#jobHunter").toggleClass("hidden", false);
			scene.addBuilding("huntingLodge");
			newMsg("Built a HuntingLodge!");
		},
	},
	trainingYard: {
		btnId: "buildTrainingYardShop",
		name: "Build TrainingYard",
		category: "houses",
		cost: { wood: 1000, iron: 250 },
		tooltip: "Build a training yard. Unlocks Speed / Strength / Cardio training bars.",
		onBuy: function(){
			set("trainingYard", state.trainingYard + 1);
			$("#speedBar").toggleClass("hidden", false);
			$("#strengthBar").toggleClass("hidden", false);
			$("#cardioBar").toggleClass("hidden", false);
			scene.addBuilding("trainingYard");
			newMsg("Built a TrainingYard!");
		},
	},
	// --- Phase 3 buildings (appear once their region is claimed) ---
	quarry: {
		btnId: "quarryShop", name: "Build Quarry", category: "houses", region: "hills",
		cost: { wood: 400, iron: 150 },
		tooltip: "Build a quarry in the Hills. Unlocks the Mason job (passive stone).",
		onBuy: function(){
			set("quarry", state.quarry + 1);
			$("#jobColumn").toggleClass("hidden", false);
			$("#jobMason").toggleClass("hidden", false);
			scene.addBuilding("quarry");
			newMsg("Built a Quarry!");
		},
	},
	farm: {
		btnId: "farmShop", name: "Build Farm", category: "houses", region: "hills",
		cost: { wood: 300, stone: 150 },
		tooltip: "Build a farm in the Hills. Adds housing and produces food each tick.",
		onBuy: function(){
			set("farm", state.farm + 1);
			set("houses", state.houses + farmHousing);
			scene.addBuilding("farm");
			startJobInterval();
			newMsg("Built a Farm!");
		},
	},
	blacksmith: {
		btnId: "blacksmithShop", name: "Build Blacksmith", category: "houses", region: "hills",
		cost: { stone: 400, iron: 100 },
		tooltip: "Build a blacksmith. Tools wear slower and you gather more. Opens the way to the Mountains.",
		onBuy: function(){
			set("blacksmith", state.blacksmith + 1);
			scene.addBuilding("blacksmith");
			newMsg("Built a Blacksmith!");
		},
	},
	market: {
		btnId: "marketShop", name: "Build Market", category: "houses", region: "mountains",
		cost: { stone: 800, iron: 300 },
		tooltip: "Build a market in the Mountains. Unlocks the Trader job (passive gold).",
		onBuy: function(){
			set("market", state.market + 1);
			$("#jobColumn").toggleClass("hidden", false);
			$("#jobTrader").toggleClass("hidden", false);
			scene.addBuilding("market");
			newMsg("Built a Market!");
		},
	},
	monument: {
		btnId: "monumentShop", name: "Build the Monument", category: "houses", region: "cavern",
		cost: { wood: 1500, iron: 800, stone: 800, gold: 200, crystal: 12 },
		tooltip: "The Grand Monument. Needs materials from every region. Completing it wins the game.",
		onBuy: function(){
			set("monument", state.monument + 1);
			scene.addBuilding("monument");
			newMsg("The Monument is complete!");
			if(typeof showVictory === "function"){ showVictory(); }
		},
	},
};

// ---------------------------------------------------------------------------
// SCOUTS registry — timed expedition bars that claim a new region.
//
// A scout appears once its `gate` building exists and the region is unclaimed.
// `requires` gates clickability (population + free villagers + the gate). It
// occupies `villagers` unemployed for the run (they return on completion).
// `maxTime` is in real ms (rawTime: bars.js skips the speedRatio scaling).
// onStart/onDone are attached in initScouts().
// ---------------------------------------------------------------------------
var SCOUTS = {
	hills: {
		barId: "scoutHillsBar", region: "hills", gate: "mine", villagers: 2, rawTime: true,
		label: "Scout the Hills",
		tooltip: "Send villagers to scout the Hills and claim Stone.",
		requires: [{ key: "villagers", min: 4 }, { key: "unemployed", min: 2 }, { key: "mine", min: 1 }],
		maxTime: function(){ return 20000; },
	},
	mountains: {
		barId: "scoutMountainsBar", region: "mountains", gate: "blacksmith", villagers: 3, rawTime: true,
		label: "Scout the Mountains",
		tooltip: "Send villagers to scout the Mountains and claim Gold.",
		requires: [{ key: "villagers", min: 8 }, { key: "unemployed", min: 3 }, { key: "blacksmith", min: 1 }],
		maxTime: function(){ return 30000; },
	},
	cavern: {
		barId: "scoutCavernBar", region: "cavern", gate: "market", villagers: 4, rawTime: true,
		label: "Scout the Crystal Cavern",
		tooltip: "Send villagers to scout the Crystal Cavern and claim Crystal.",
		requires: [{ key: "villagers", min: 12 }, { key: "unemployed", min: 4 }, { key: "market", min: 1 }],
		maxTime: function(){ return 40000; },
	},
};

// Shop navigation buttons (category switching), kept separate from purchasables.
var SHOP_NAV = [
	{ btnId: "shopOpenEquipment", label: "Open Goods",   show: "goods",  title: "Shop - Goods" },
	{ btnId: "shopOpenHouses",    label: "Open Houses",  show: "houses", title: "Shop - Houses" },
];
