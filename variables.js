// Author Petter Andersson
"use strict"

// This file holds only tuning constants and rendering config.
// All mutable game values live in `state` (see data/registry.js).


// Important global vars
var speedRatio = 0.1; // Speedratio of bars
var incomeInterval = null; // Used for job income
var energyInterval = null; // Used for energy increase for energy meter
var ctx = null; // the canvas 2d graphics

// Dev sandbox flag: true only when running locally (localhost / 127.0.0.1 / opened
// as a file://). On the deployed GitHub Pages host this is false, so the live game
// starts honest at zero resources. See initValues() for the resource top-up.
// Add ?nodev to the local URL to force the real zero-resource economy (for balance
// playtesting without deploying).
var developer = (location.hostname === "localhost" ||
	location.hostname === "127.0.0.1" ||
	location.protocol === "file:") &&
	location.search.indexOf("nodev") === -1;

// Action base speeds (ms), scaled by player speed and speedRatio in ACTIONS.maxTime()
var woodSpeed = 2000000;
var ironSpeed = 6000000;
var huntSpeed = 8000000;
var clawTreeSpeed = 5000000;

// Action tuning - yields, equipment damage and energy requirements/costs
var woodInc = 10;
var ironInc = 10;
var foodInc = 10;
var clawInc = 2;
var axeWoodDmg = 5;
var axeIronDmg = 5;
var spearHuntDmg = 5;
var successHuntRate = 60;
var huntEnergyReq = 80;
var huntEnergyCost = 0.4;
var clawEnergyReq = 50;
var clawEnergyCost = 0.6;

// Training tuning
var speedInc = 10;
var strengthInc = 10;
var cardioInc = 50;
var speedSpeed = 50000;
var strengthSpeed = 50000;
var cardioSpeed = 50000;
var trainingSpeedEnergyCost = 0.25;
var trainingStrengthEnergyCost = 0.5;
var trainingCardioEnergyCost = 0;
var trainingSpeedEnergyReq = 100;
var trainingStrengthEnergyReq = 100;
var trainingCardioEnergyReq = 100;

// Shop increments (how much a purchase grants when it is more than 1)
var foodShopInc = 10;
var houseShopInc = 8;

// Phase 3 building tuning
var farmHousing = 8;         // housing each Farm adds
var farmFoodPerTick = 2;     // food per Farm per income tick
var masonStonePerTick = 2;   // stone per Mason per income tick
var traderGoldPerTick = 1;   // gold per Trader per income tick

// Sprite image elements (populated in initValues, consumed by scene.js)
var imgHouse;
var imgVillager;
var imgHunter;
var imgLumberMill;
var imgMine;
var imgHuntingLodge;
var imgTrainingYard;
var imgTree;
