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
	// Equipment + durability (%)
	axe: 1, spear: 1, axeDurability: 100, spearDurability: 100,
	// Buildings + housing capacity
	houses: 2, housesBuilt: 0, lumberMill: 0, mine: 0, huntingLodge: 0, trainingYard: 0,
	// Phase 3 buildings
	quarry: 0, farm: 0, blacksmith: 0, market: 0, monument: 0,
	// Population / jobs
	villagers: 0, unemployed: 0, woodCutter: 0, ironWorker: 0, hunter: 0,
	mason: 0, trader: 0,
	// Player stats
	speed: 100, strength: 100, cardio: 100, energy: 100, energyInc: 0.5,
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

// Set a state value and mirror it into the DOM node sharing its id (if present).
function set(key, val){
	state[key] = val;
	var el = document.getElementById(key);
	if(el){ el.innerHTML = val; }
	if(RESOURCE_KEYS.indexOf(key) !== -1 && typeof refreshShopColors === "function"){
		refreshShopColors();
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
		requires: [{ key: "axe", min: 1 }],
		startsHidden: false,
		maxTime: function(){ return Math.floor(woodSpeed / state.speed); },
		onStart: function(){ axeUpdate(equipDamage(axeWoodDmg)); },
		onDone: function(){
			var amt = gatherAmount(woodInc);
			set("wood", state.wood + amt);
			scene.chopWoodFx(amt);
			newMsg("Gathered Wood!");
		},
	},
	mineIron: {
		barId: "ironBar",
		label: "Mine Iron",
		tooltip: "Mine iron ore. Needs an axe; each swing wears it down.",
		requires: [{ key: "axe", min: 1 }],
		startsHidden: false,
		maxTime: function(){ return Math.floor(ironSpeed / state.speed); },
		onStart: function(){ axeUpdate(equipDamage(axeIronDmg)); },
		onDone: function(){
			var amt = gatherAmount(ironInc);
			set("iron", state.iron + amt);
			scene.gainFx("iron", amt);
			newMsg("Gathered Iron!");
		},
	},
	hunt: {
		barId: "huntBar",
		label: "Go Hunting",
		tooltip: "Hunt for food. Needs a spear and high energy. Success scales with strength.",
		requires: [{ key: "spear", min: 1 }, { key: "energy", min: huntEnergyReq }],
		startsHidden: false,
		maxTime: function(){ return Math.floor(huntSpeed / state.speed); },
		onStart: function(){
			state.energy *= huntEnergyCost * ((Math.floor((Math.random() * 40) + 81)) / 100);
			energyIncUpdate();
		},
		onDone: function(){
			var successRate = successHuntRate * (state.strength / 100.0);
			var roll = Math.floor((Math.random() * 100) + 1);
			if(roll < successRate){
				set("food", state.food + foodInc);
				scene.gainFx("food", foodInc);
				newMsg("Hunted Successfully!");
			} else {
				newMsg("Hunt failed! (" + roll + "/100 - needed " + Math.round(successRate) + ")");
			}
			spearUpdate(equipDamage(spearHuntDmg));
		},
	},
	clawTree: {
		barId: "clawTreeBar",
		label: "Claw Tree",
		tooltip: "Claw wood by hand. No axe needed, but it drains energy and is slow.",
		requires: [{ key: "energy", min: clawEnergyReq }],
		startsHidden: false,
		maxTime: function(){ return Math.floor(clawTreeSpeed / state.speed); },
		onStart: function(){ state.energy *= clawEnergyCost; energyIncUpdate(); },
		onDone: function(){
			var amt = gatherAmount(clawInc);
			set("wood", state.wood + amt);
			scene.chopWoodFx(amt);
			newMsg("Clawed some wood!");
		},
	},
	trainSpeed: {
		barId: "speedBar",
		label: "Train Speed",
		tooltip: "Train speed. Faster speed shortens every gathering action. Costs energy.",
		requires: [{ key: "energy", min: trainingSpeedEnergyReq }],
		startsHidden: true,
		maxTime: function(){ return speedSpeed; },
		onStart: function(){ state.energy *= trainingSpeedEnergyCost; energyIncUpdate(); },
		onDone: function(){ set("speed", state.speed + speedInc); newMsg("Improved your speed!"); },
	},
	trainStrength: {
		barId: "strengthBar",
		label: "Train Strength",
		tooltip: "Train strength. Higher strength increases resources gathered per action. Costs energy.",
		requires: [{ key: "energy", min: trainingStrengthEnergyReq }],
		startsHidden: true,
		maxTime: function(){ return strengthSpeed; },
		onStart: function(){ state.energy *= trainingStrengthEnergyCost; energyIncUpdate(); },
		onDone: function(){ set("strength", state.strength + strengthInc); newMsg("Improved your strength!"); },
	},
	trainCardio: {
		barId: "cardioBar",
		label: "Train Cardio",
		tooltip: "Train cardio. Higher cardio makes energy regenerate faster. Uses all your energy.",
		requires: [{ key: "energy", min: trainingCardioEnergyReq }],
		startsHidden: true,
		maxTime: function(){ return cardioSpeed; },
		onStart: function(){ state.energy *= trainingCardioEnergyCost; energyIncUpdate(); },
		onDone: function(){ set("cardio", state.cardio + cardioInc); setNewEnergyInc(); newMsg("Improved your cardio!"); },
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
		category: "equipment",
		cost: { wood: 50, iron: 10 },
		tooltip: "Buy an axe. Required to chop wood and mine iron.",
		onBuy: function(){
			set("axe", state.axe + 1);
			$('#axeDurabilityBar_innertext').text("Axe Durability " + state.axeDurability + "%");
			$('#axeDurabilityBar_innertext').toggleClass("innerTextRed", false);
			newMsg("Bought Axe!");
		},
	},
	tradeAxe: {
		btnId: "tradeAxeShop",
		name: "Axe",
		category: "equipment",
		cost: { food: 10 },
		tooltip: "Trade food for an axe. An alternate path when you have food but no wood/iron.",
		onBuy: function(){
			set("axe", state.axe + 1);
			$('#axeDurabilityBar_innertext').text("Axe Durability " + state.axeDurability + "%");
			$('#axeDurabilityBar_innertext').toggleClass("innerTextRed", false);
			newMsg("Bought Axe!");
		},
	},
	spear: {
		btnId: "spearShop",
		name: "Spear",
		category: "equipment",
		cost: { wood: 130 },
		tooltip: "Buy a spear. Required for hunting.",
		onBuy: function(){
			set("spear", state.spear + 1);
			$('#spearDurabilityBar_innertext').text("Spear Durability " + state.spearDurability + "%");
			$('#spearDurabilityBar_innertext').toggleClass("innerTextRed", false);
			newMsg("Bought Spear!");
		},
	},
	food: {
		btnId: "tradeFoodShop",
		name: "Buy Food",
		category: "resources",
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
		cost: { wood: 300, stone: 200 },
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
		cost: { stone: 500, iron: 100 },
		tooltip: "Build a blacksmith. Tools wear slower and you gather more. Opens the way to the Mountains.",
		onBuy: function(){
			set("blacksmith", state.blacksmith + 1);
			scene.addBuilding("blacksmith");
			newMsg("Built a Blacksmith!");
		},
	},
	market: {
		btnId: "marketShop", name: "Build Market", category: "houses", region: "mountains",
		cost: { stone: 1200, iron: 300 },
		tooltip: "Build a market in the Mountains. Unlocks the Trader job (passive gold).",
		onBuy: function(){
			set("market", state.market + 1);
			$("#jobColumn").toggleClass("hidden", false);
			$("#jobTrader").toggleClass("hidden", false);
			scene.addBuilding("market");
			newMsg("Built a Market!");
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
		requires: [{ key: "villagers", min: 15 }, { key: "unemployed", min: 4 }, { key: "market", min: 1 }],
		maxTime: function(){ return 40000; },
	},
};

// Shop navigation buttons (category switching), kept separate from purchasables.
var SHOP_NAV = [
	{ btnId: "shopOpenEquipment", label: "Open Equipment", show: "equipment", title: "Shop - Equipment" },
	{ btnId: "shopOpenResources", label: "Open Resources", show: "resources", title: "Shop - Resources" },
	{ btnId: "shopOpenHouses",    label: "Open Houses",    show: "houses",    title: "Shop - Houses" },
];
