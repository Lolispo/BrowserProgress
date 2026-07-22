// Author Petter Andersson
"use strict"

// This file holds only tuning constants and rendering config.
// All mutable game values live in `state` (see data/registry.js).


// Important global vars
var speedRatio = 0.1; // Speedratio of bars
var timeScale = 1;    // dev speed toggle: multiplies bar/income durations (1 = normal, <1 = faster)
var incomeInterval = null; // Used for job income
var energyInterval = null; // Used for energy increase for energy meter
var ctx = null; // the canvas 2d graphics

// Dev flag: unlocks the dev-only fast-forward speed toggle (see controls.js). On by
// default when running locally (localhost / 127.0.0.1 / file://), off on the deployed
// host. Two URL overrides win over the host default, so you can flip it either way
// anywhere (e.g. to fast-forward the live game): ?dev forces it on, ?nodev forces it
// off. If both are present, ?nodev wins. (It no longer grants any resources — a fresh
// game always starts honest at zero — so this is purely the debug speed control.)
var _devParams = new URLSearchParams(location.search);
var _devIsLocal = location.hostname === "localhost" ||
	location.hostname === "127.0.0.1" ||
	location.protocol === "file:";
var developer = _devParams.has("nodev") ? false :
	(_devParams.has("dev") ? true : _devIsLocal);

// Action base speeds (ms), scaled by player speed and speedRatio in ACTIONS.maxTime()
var woodSpeed = 2000000;
var ironSpeed = 4000000;
var huntSpeed = 6000000;
var clawTreeSpeed = 5000000;

// Action tuning - yields, equipment damage and energy requirements/costs
var woodInc = 20;
var ironInc = 15;
var foodInc = 15;
var clawInc = 2;
var axeWoodDmg = 5;
var axeIronDmg = 5;
var spearHuntDmg = 5;
var successHuntRate = 60;
var huntEnergyReq = 80;
var huntEnergyCost = 0.4;
var clawEnergyReq = 50;
var clawEnergyCost = 0.6;

// Hunger (per-villager food upkeep): each villager gets hungry and eats from the
// global food stockpile. When food runs dry they stay hungry and slow down (shared
// 30% floor with tiredness). Hunger is driven mainly by WORK: a villager on a task
// or employed at a job burns hunger fast; an idle villager barely does. Rates are
// per real second / per meal (see scene.feed).
var hungerDrainWork = 2.0;   // hunger points lost per second while working (task or job)
var hungerDrainIdle = 0.3;   // hunger points lost per second while idle (no task, no job)
var hungerEatAt = 60;        // a villager eats once hunger drops below this
var foodPerMeal = 1;         // food consumed per meal
var hungerPerMeal = 45;      // hunger restored per meal

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
var houseShopInc = 2;

// Phase 3 building tuning
var farmHousing = 8;         // housing each Farm adds
var farmFoodPerTick = 2;     // food per Farm per income tick
var masonStonePerTick = 3;   // stone per Mason per income tick
var traderGoldPerTick = 2;   // gold per Trader per income tick

// Hot-path sprite aliases, populated from the SPRITES manifest by
// scene.loadAssets() (all other sprites are looked up via scene.assets[key]).
var imgVillager;
var imgTree;

// Atmosphere layer master intensity (0 = fully off, 1 = designed strength).
// See atmosphere.js. Kept here with the other rendering tuning constants.
var ATMOSPHERE_INTENSITY = 1;
