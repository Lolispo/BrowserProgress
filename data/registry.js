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
	// Equipment + durability (%)
	axe: 1, spear: 1, axeDurability: 100, spearDurability: 100,
	// Buildings + housing capacity
	houses: 2, housesBuilt: 0, lumberMill: 0, mine: 0, huntingLodge: 0, trainingYard: 0,
	// Population / jobs
	villagers: 0, unemployed: 0, woodCutter: 0, ironWorker: 0, hunter: 0,
	// Player stats
	speed: 100, strength: 100, cardio: 100, energy: 100, energyInc: 0.5,
};

// Resource keys drive shop affordability colouring; changing one refreshes the shop.
var RESOURCE_KEYS = ["wood", "iron", "food"];

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
		onStart: function(){ axeUpdate(axeWoodDmg); },
		onDone: function(){
			set("wood", state.wood + Math.round(woodInc * (state.strength / 100.0)));
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
		onStart: function(){ axeUpdate(axeIronDmg); },
		onDone: function(){
			set("iron", state.iron + Math.round(ironInc * (state.strength / 100.0)));
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
				newMsg("Hunted Successfully!");
			} else {
				newMsg("Hunt failed! (" + roll + "/100 - needed " + Math.round(successRate) + ")");
			}
			spearUpdate(spearHuntDmg);
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
			set("wood", state.wood + Math.round(clawInc * (state.strength / 100.0)));
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
			ctx.drawImage(imgVillager, villagerXImg + ((imgVillager.width + imgVillager.width / 5) * state.villagers), villagerYImg);
			set("villagers", state.villagers);
			set("unemployed", state.unemployed);
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
			ctx.drawImage(imgHouse, houseXImg + ((imgHouse.width + imgHouse.width / 5) * state.housesBuilt), houseYImg);
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
			ctx.drawImage(imgLumberMill, imgXStart + ((imgLumberMill.width + imgLumberMill.width / 5) * state.lumberMill), lumberMillYImg);
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
			ctx.drawImage(imgMine, imgXStart + ((imgMine.width + imgMine.width / 5) * state.mine), mineYImg);
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
			ctx.drawImage(imgHuntingLodge, imgXStart + ((imgHuntingLodge.width + imgHuntingLodge.width / 5) * state.huntingLodge), huntingLodgeYImg);
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
			ctx.drawImage(imgTrainingYard, imgXStart + ((imgTrainingYard.width + imgTrainingYard.width / 5) * state.trainingYard), trainingYardYImg);
			newMsg("Built a TrainingYard!");
		},
	},
};

// Shop navigation buttons (category switching), kept separate from purchasables.
var SHOP_NAV = [
	{ btnId: "shopOpenEquipment", label: "Open Equipment", show: "equipment", title: "Shop - Equipment" },
	{ btnId: "shopOpenResources", label: "Open Resources", show: "resources", title: "Shop - Resources" },
	{ btnId: "shopOpenHouses",    label: "Open Houses",    show: "houses",    title: "Shop - Houses" },
];
